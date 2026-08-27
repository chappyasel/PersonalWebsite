import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import "server-only";

import {
  WEIGHTLIFTING_REVALIDATE,
  WEIGHTLIFTING_TAG,
} from "~/lib/weightlifting/cache";
import { db } from "~/server/db";

import {
  getChartSelectableExercises,
  loadChartSelectableExercises,
} from "./weightliftingExercises";
import { buildSlugMap } from "~/app/weightlifting/lib/exerciseSlug";

/** The display-name derivation every weightlifting query shares. */
const DISPLAY_NAME_SQL = sql`
  CASE
    WHEN e.iteration IS NOT NULL AND e.iteration != ''
    THEN e.iteration || ' ' || e.name
    ELSE e.name
  END`;

export type ExerciseIndexEntry = {
  slug: string;
  displayName: string;
  /** Base exercise name without the iteration prefix; entries sharing a
   *  name are iterations (variants) of the same exercise type. */
  name: string;
  category: string;
  setCount: number;
  bestOneRM: number;
};

/**
 * Every exercise that gets its own page: reps×weight lifts with at least 10
 * sets carrying an est. 1RM — the same universe the dashboard's exercise
 * picker shows. (setCount counts those 1RM-bearing sets, not all logged
 * sets; the detail page's totalSets is the true count.)
 */
async function buildExerciseIndex(
  load: (
    minSets: number,
  ) => Promise<
    Awaited<ReturnType<typeof getChartSelectableExercises>>
  > = getChartSelectableExercises,
): Promise<ExerciseIndexEntry[]> {
  const exercises = await load(10);

  // Historical category drift can yield two rows with the same display name
  // (the picker query groups by category too). Merge them here: one page per
  // display name, category taken from the row with more sets — otherwise
  // both rows would look up the same suffixed slug and 404.
  const byName = new Map<string, (typeof exercises)[number]>();
  for (const e of exercises) {
    const existing = byName.get(e.displayName);
    if (!existing) {
      byName.set(e.displayName, { ...e });
    } else {
      byName.set(e.displayName, {
        ...(e.setCount > existing.setCount ? e : existing),
        setCount: existing.setCount + e.setCount,
        bestOneRM: Math.max(existing.bestOneRM, e.bestOneRM),
      });
    }
  }

  const merged = [...byName.values()];
  // Alphabetical slug-map input keeps collision suffixes stable across
  // data changes (the picker query orders by current best 1RM, which moves)
  const slugs = buildSlugMap(
    merged.map((e) => e.displayName).sort((a, b) => a.localeCompare(b)),
  );
  return merged.map((e) => ({
    slug: slugs.get(e.displayName)!,
    displayName: e.displayName,
    name: e.name,
    category: e.category,
    setCount: e.setCount,
    bestOneRM: e.bestOneRM,
  }));
}

export const getCachedExerciseIndex = unstable_cache(
  () => buildExerciseIndex(),
  ["wl-exercise-index"],
  { revalidate: WEIGHTLIFTING_REVALIDATE, tags: [WEIGHTLIFTING_TAG] },
);

/**
 * Uncached fallback for the page's 404 path: after a sync, the tag-invalidated
 * index can still serve one stale read (stale-while-revalidate), which would
 * 404 a newly eligible exercise. A direct read costs one 1.2s-capped query
 * and only runs when the cached index misses.
 */
export const getFreshExerciseIndex = () =>
  buildExerciseIndex(loadChartSelectableExercises);

export type ExerciseSet = {
  reps: number | null;
  weight: number | null;
  oneRM: number | null;
  volume: number | null;
};

export type ExerciseInstance = {
  /** YYYY-MM-DD, UTC */
  date: string;
  /** Full workout start "YYYY-MM-DDTHH:MI", UTC — orders same-day sessions */
  ts: string;
  /** The containing workout's name, e.g. "Morning Workout" */
  workoutName: string;
  /** The containing workout's app-side uuid — opens the workout preview
   *  overlay. Serial ids are reassigned on every sync (full replace), so
   *  a cached payload must never carry them; the uuid is stable. */
  workoutUuid: string;
  sets: ExerciseSet[];
};

export type ExerciseDetail = {
  displayName: string;
  category: string;
  instanceCount: number;
  totalSets: number;
  totalVolume: number;
  firstPerformed: string;
  lastPerformed: string;
  best: { weight: number; reps: number; oneRM: number; date: string } | null;
  /** Every logged instance with its sets, chronological. The client derives
   *  graphs, podiums, and per-instance metrics from this one payload. */
  instances: ExerciseInstance[];
};

const loadExerciseDetail = async (
  displayName: string,
): Promise<ExerciseDetail | null> => {
  // One repeatable-read transaction: sync fully replaces the tables in its
  // own transaction, so three independent statements could otherwise read
  // different data generations and cache the mismatch for six hours
  const [summaryRows, bestRows, setRows] = await db.transaction(
    async (tx) =>
      Promise.all([
        tx.execute<{
          category: string;
          instance_count: number;
          total_sets: number;
          total_volume: number | string;
          first_performed: string;
          last_performed: string;
        }>(sql`
          SELECT
            -- most-frequent category, matching the index's drift handling
            MODE() WITHIN GROUP (ORDER BY e.category) AS category,
            COUNT(DISTINCT e.id) AS instance_count,
            COUNT(s.id) AS total_sets,
            COALESCE(SUM(s.volume), 0) AS total_volume,
            TO_CHAR(MIN(w.date) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS first_performed,
            TO_CHAR(MAX(w.date) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS last_performed
          FROM wl_exercises e
          INNER JOIN wl_workouts w ON e.workout_id = w.id
          LEFT JOIN wl_sets s ON s.exercise_id = e.id
          WHERE ${DISPLAY_NAME_SQL} = ${displayName}
        `),
        tx.execute<{
          weight: number;
          reps: number;
          one_rm: number;
          date: string;
        }>(sql`
          SELECT s.weight, s.reps, s.one_rm,
            TO_CHAR(w.date AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date
          FROM wl_sets s
          INNER JOIN wl_exercises e ON s.exercise_id = e.id
          INNER JOIN wl_workouts w ON e.workout_id = w.id
          WHERE ${DISPLAY_NAME_SQL} = ${displayName}
            AND s.one_rm IS NOT NULL AND s.one_rm > 0
          ORDER BY s.one_rm DESC, w.date DESC
          LIMIT 1
        `),
        tx.execute<{
          exercise_id: number;
          set_id: number | null;
          date: string;
          ts: string;
          workout_name: string | null;
          workout_uuid: string;
          reps: number | null;
          weight: number | null;
          one_rm: number | null;
          volume: number | string | null;
        }>(sql`
          SELECT
            e.id AS exercise_id,
            s.id AS set_id,
            TO_CHAR(w.date AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
            TO_CHAR(w.date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS ts,
            w.name AS workout_name,
            w.uuid AS workout_uuid,
            s.reps, s.weight, s.one_rm, s.volume
          FROM wl_exercises e
          INNER JOIN wl_workouts w ON e.workout_id = w.id
          LEFT JOIN wl_sets s ON s.exercise_id = e.id
          WHERE ${DISPLAY_NAME_SQL} = ${displayName}
          ORDER BY w.date, e.id, s.set_order
        `),
      ]),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );

  const summary = summaryRows[0];
  if (!summary || Number(summary.instance_count) === 0) return null;

  const instances: ExerciseInstance[] = [];
  let currentId: number | null = null;
  for (const row of setRows) {
    if (row.exercise_id !== currentId) {
      currentId = row.exercise_id;
      instances.push({
        date: row.date,
        ts: row.ts,
        workoutName: row.workout_name ?? "",
        workoutUuid: row.workout_uuid,
        sets: [],
      });
    }
    // set_id is null ONLY for the LEFT JOIN placeholder of a set-less
    // instance; a real set with all-null metrics is still a set
    if (row.set_id == null) continue;
    instances[instances.length - 1]!.sets.push({
      reps: row.reps == null ? null : Number(row.reps),
      weight: row.weight == null ? null : Number(row.weight),
      oneRM: row.one_rm == null ? null : Number(row.one_rm),
      volume: row.volume == null ? null : Number(row.volume),
    });
  }

  const best = bestRows[0];
  return {
    displayName,
    category: summary.category,
    instanceCount: Number(summary.instance_count),
    totalSets: Number(summary.total_sets),
    totalVolume: Number(summary.total_volume),
    firstPerformed: summary.first_performed,
    lastPerformed: summary.last_performed,
    best: best
      ? {
          weight: Number(best.weight),
          reps: Number(best.reps),
          oneRM: Number(best.one_rm),
          date: best.date,
        }
      : null,
    instances,
  };
};

export const getCachedExerciseDetail = unstable_cache(
  loadExerciseDetail,
  ["wl-exercise-detail"],
  { revalidate: WEIGHTLIFTING_REVALIDATE, tags: [WEIGHTLIFTING_TAG] },
);
