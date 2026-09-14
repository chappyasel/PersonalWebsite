import * as crypto from "crypto";
import { desc, eq, sql } from "drizzle-orm";
import * as fs from "fs";

import { db } from "~/server/db";
import {
  wlExerciseTypes,
  wlExercises,
  wlSets,
  wlSyncMetadata,
  wlWorkouts,
} from "~/server/db/schema";

import {
  WORKOUT_DATE_POLICY,
  getExportTimeZone,
  pacificWorkoutDate,
} from "./exportTimeZone";
import { downloadWldFromS3, getWldObjectState } from "./s3";
import type { WldFile } from "./types";

export type WlSyncResult = {
  totalWorkouts: number;
  totalExercises: number;
  totalSets: number;
  totalExerciseTypes: number;
  skipped: boolean;
};

type SyncTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class WorkoutSyncBusyError extends Error {
  constructor() {
    super("A workout sync is already running");
  }
}

/** All callers share a transaction lock, including the daily fallback. */
export async function syncWeightlifting(
  triggeredBy: "cron" | "manual" | "s3" = "cron",
  localFilePath?: string,
): Promise<WlSyncResult> {
  const syncId = await createSyncRecord(triggeredBy);
  try {
    return await db.transaction(async (tx) => {
      const [lock] = await tx.execute<{ acquired: boolean }>(sql`
        SELECT pg_try_advisory_xact_lock(872041, 1) AS acquired
      `);
      if (!lock?.acquired) throw new WorkoutSyncBusyError();
      return syncWithinTransaction(tx, syncId, localFilePath);
    });
  } catch (error) {
    await completeSyncRecord(syncId, "failed", null, null, error);
    throw error;
  }
}

async function syncWithinTransaction(
  db: SyncTransaction,
  syncId: number,
  localFilePath?: string,
): Promise<WlSyncResult> {
  // HEAD avoids downloading unchanged backups. The policy remains part of
  // the fingerprint so a date-policy change forces an import.
  const object = localFilePath ? null : await getWldObjectState();
  let wldData: WldFile | undefined;
  if (localFilePath) {
    wldData = JSON.parse(fs.readFileSync(localFilePath, "utf-8")) as WldFile;
  }
  const fileHash =
    object?.fingerprint ??
    crypto
      .createHash("sha256")
      .update(WORKOUT_DATE_POLICY)
      .update(JSON.stringify(wldData))
      .digest("hex");

  const lastSync = await db.query.wlSyncMetadata.findFirst({
    where: eq(wlSyncMetadata.status, "success"),
    orderBy: desc(wlSyncMetadata.syncStartedAt),
  });

  if (lastSync?.fileHash === fileHash) {
    console.log("File unchanged, skipping sync");
    const result: WlSyncResult = {
      totalWorkouts: lastSync.totalWorkouts ?? 0,
      totalExercises: lastSync.totalExercises ?? 0,
      totalSets: lastSync.totalSets ?? 0,
      totalExerciseTypes: lastSync.totalExerciseTypes ?? 0,
      skipped: true,
    };
    await completeSyncRecord(
      syncId,
      "success",
      fileHash,
      result,
      undefined,
      db,
    );
    return result;
  }

  // If a new upload races HEAD, S3 rejects the GET and the caller retries.
  wldData ??= await downloadWldFromS3(object?.etag);
  const exportTimeZone = getExportTimeZone(wldData.workouts);
  const data = wldData;

  // 3. Full replace — truncate and reinsert atomically so a mid-sync
  // failure rolls back to the previous data instead of an empty site
  console.log("Syncing weightlifting data...");

  const totals = await db.transaction(async (tx) => {
    // Delete in dependency order (sets → exercises → workouts → types)
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await tx.delete(wlSets);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await tx.delete(wlExercises);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await tx.delete(wlWorkouts);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await tx.delete(wlExerciseTypes);

    // 4. Insert exercise types (deduplicate by name, keep last occurrence)
    const typeMap = new Map<string, (typeof data.typeList.list)[0]>();
    for (const t of data.typeList.list) {
      typeMap.set(t.name, t);
    }
    const uniqueTypes = Array.from(typeMap.values());
    if (uniqueTypes.length > 0) {
      await tx.insert(wlExerciseTypes).values(
        uniqueTypes.map((t) => ({
          name: t.name,
          category: t.category,
          style: t.style,
          iterations: t.iterations,
          favorite: t.favorite,
          hidden: t.hidden,
        })),
      );
    }
    console.log(`Inserted ${uniqueTypes.length} exercise types`);

    // 5. Bulk insert workouts, then exercises, then sets
    // Insert all workouts in one batch and get IDs back
    const BATCH_SIZE = 500;
    let totalExercises = 0;
    let totalSets = 0;

    // Build all workout rows
    const workoutRows = data.workouts.map((w) => ({
      uuid: w.uuid,
      name: w.name,
      date: pacificWorkoutDate(w.date, exportTimeZone),
      dateModified: w.dateModified,
      durationSeconds: w.duration,
      supersets: w.supersets,
    }));

    // Insert workouts in batches, collecting uuid→id mapping
    const uuidToId = new Map<string, number>();
    for (let i = 0; i < workoutRows.length; i += BATCH_SIZE) {
      const batch = workoutRows.slice(i, i + BATCH_SIZE);
      const inserted = await tx
        .insert(wlWorkouts)
        .values(batch)
        .returning({ id: wlWorkouts.id, uuid: wlWorkouts.uuid });
      for (const row of inserted) {
        uuidToId.set(row.uuid, row.id);
      }
    }
    console.log(`Inserted ${workoutRows.length} workouts`);

    // Build all exercise rows with workoutId resolved
    type ExerciseRow = {
      workoutId: number;
      exerciseOrder: number;
      name: string;
      category: string;
      style: string;
      iteration: string | null;
    };
    const exerciseRows: ExerciseRow[] = [];
    // Track which exercises belong to which workout+order for set mapping
    const exerciseKey: string[] = []; // "uuid:order" for mapping back

    for (const workout of data.workouts) {
      const workoutId = uuidToId.get(workout.uuid);
      if (!workoutId) continue;
      for (let exIdx = 0; exIdx < workout.exercises.length; exIdx++) {
        const ex = workout.exercises[exIdx]!;
        exerciseRows.push({
          workoutId,
          exerciseOrder: exIdx,
          name: ex.name,
          category: ex.category,
          style: ex.style,
          iteration: ex.iteration ?? null,
        });
        exerciseKey.push(`${workout.uuid}:${exIdx}`);
      }
    }

    // Insert exercises in batches, collecting key→id mapping
    const exerciseKeyToId = new Map<string, number>();
    for (let i = 0; i < exerciseRows.length; i += BATCH_SIZE) {
      const batch = exerciseRows.slice(i, i + BATCH_SIZE);
      const inserted = await tx
        .insert(wlExercises)
        .values(batch)
        .returning({ id: wlExercises.id });
      for (let j = 0; j < inserted.length; j++) {
        exerciseKeyToId.set(exerciseKey[i + j]!, inserted[j]!.id);
      }
    }
    totalExercises = exerciseRows.length;
    console.log(`Inserted ${totalExercises} exercises`);

    // Build all set rows with exerciseId resolved
    type SetRow = {
      exerciseId: number;
      setOrder: number;
      reps: number | null;
      weight: number | null;
      volume: number | null;
      oneRM: number | null;
      durationSeconds: number | null;
      distance: number | null;
      calories: number | null;
      custom: string | null;
    };
    const setRows: SetRow[] = [];

    for (const workout of data.workouts) {
      for (let exIdx = 0; exIdx < workout.exercises.length; exIdx++) {
        const ex = workout.exercises[exIdx]!;
        const exerciseId = exerciseKeyToId.get(`${workout.uuid}:${exIdx}`);
        if (!exerciseId) continue;
        for (let setIdx = 0; setIdx < ex.sets.length; setIdx++) {
          const set = ex.sets[setIdx]!;
          setRows.push({
            exerciseId,
            setOrder: setIdx,
            reps: set.reps ?? null,
            weight: set.weight ?? null,
            volume: set.volume ?? null,
            oneRM: set.oneRM ?? null,
            durationSeconds: set.duration ?? null,
            distance: set.distance ?? null,
            calories: set.calories ?? null,
            custom: set.custom != null ? String(set.custom) : null,
          });
        }
      }
    }

    // Insert sets in batches
    for (let i = 0; i < setRows.length; i += BATCH_SIZE) {
      const batch = setRows.slice(i, i + BATCH_SIZE);
      await tx.insert(wlSets).values(batch);
    }
    totalSets = setRows.length;
    console.log(`Inserted ${totalSets} sets`);

    return {
      totalExercises,
      totalSets,
      totalExerciseTypes: uniqueTypes.length,
    };
  });

  const result: WlSyncResult = {
    totalWorkouts: data.workouts.length,
    ...totals,
    skipped: false,
  };

  console.log("Sync completed:", result);
  await completeSyncRecord(syncId, "success", fileHash, result, undefined, db);

  return result;
}

async function createSyncRecord(
  triggeredBy: "cron" | "manual" | "s3",
): Promise<number> {
  const [record] = await db
    .insert(wlSyncMetadata)
    .values({ status: "in_progress", triggeredBy })
    .returning({ id: wlSyncMetadata.id });
  return record!.id;
}

async function completeSyncRecord(
  syncId: number,
  status: "success" | "failed",
  fileHash: string | null,
  result: WlSyncResult | null,
  error?: unknown,
  database: typeof db | SyncTransaction = db,
): Promise<void> {
  await database
    .update(wlSyncMetadata)
    .set({
      syncCompletedAt: new Date(),
      status,
      fileHash,
      totalWorkouts: result?.totalWorkouts ?? null,
      totalExercises: result?.totalExercises ?? null,
      totalSets: result?.totalSets ?? null,
      totalExerciseTypes: result?.totalExerciseTypes ?? null,
      errors: error
        ? JSON.stringify([
            error instanceof Error ? error.message : "Unknown error",
          ])
        : null,
    })
    .where(eq(wlSyncMetadata.id, syncId));
}
