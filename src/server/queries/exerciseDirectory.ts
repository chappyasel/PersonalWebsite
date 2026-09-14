import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { createHash } from "node:crypto";
import "server-only";

import {
  WEIGHTLIFTING_REVALIDATE,
  WEIGHTLIFTING_TAG,
} from "~/lib/weightlifting/cache";
import { db } from "~/server/db";
import type { wlSets } from "~/server/db/schema";

import {
  getCachedExerciseIndex,
  getFreshExerciseIndex,
} from "./weightliftingExercise";
import { exerciseSlug } from "~/app/weightlifting/lib/exerciseSlug";

const displayName = sql`CASE WHEN e.iteration IS NOT NULL AND e.iteration <> ''
  THEN e.iteration || ' ' || e.name ELSE e.name END`;

// The tilde keeps these routes separate from existing chart slugs. The hash
// distinguishes names whose punctuation produces the same readable slug.
function directorySlug(name: string, scope: "exercise" | "all") {
  return `${scope}~${exerciseSlug(name)}-${createHash("sha256").update(name).digest("hex").slice(0, 12)}`;
}
export const exerciseHistorySlug = (name: string) =>
  directorySlug(name, "exercise");
export const allVariantsSlug = (name: string) => directorySlug(name, "all");

/** Count exercise occurrences, not joined sets or only chart-eligible lifts. */
const loadExerciseDirectory = async (loadIndex = getCachedExerciseIndex) => {
  const [rows, index] = await Promise.all([
    db.execute<{
      display_name: string;
      category: string;
      name: string;
      style: string;
      instance_count: number | string;
      last_performed: string;
    }>(sql`
      SELECT ${displayName} AS display_name,
        MODE() WITHIN GROUP (ORDER BY e.name) AS name,
        MODE() WITHIN GROUP (ORDER BY e.style) AS style,
        MODE() WITHIN GROUP (ORDER BY e.category) AS category,
        COUNT(*) AS instance_count,
        TO_CHAR(MAX(w.date) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS last_performed
      FROM wl_exercises e
      INNER JOIN wl_workouts w ON w.id = e.workout_id
      GROUP BY ${displayName}
      ORDER BY last_performed DESC, display_name
    `),
    // A charts-index failure must not hide the exercise history.
    loadIndex().catch(() => []),
  ]);
  const slugs = new Map(
    index.map((exercise) => [exercise.displayName, exercise.slug]),
  );
  return rows.map((row) => ({
    displayName: row.display_name,
    name: row.name,
    style: row.style,
    allVariantsSlug: allVariantsSlug(row.name),
    category: row.category,
    instanceCount: Number(row.instance_count),
    lastPerformed: row.last_performed,
    slug: slugs.get(row.display_name) ?? exerciseHistorySlug(row.display_name),
  }));
};

export const getFreshExerciseDirectory = () =>
  loadExerciseDirectory(getFreshExerciseIndex);

export const getCachedExerciseDirectory = unstable_cache(
  () => loadExerciseDirectory(),
  ["weightlifting-exercise-directory-v2"],
  {
    revalidate: WEIGHTLIFTING_REVALIDATE,
    tags: [WEIGHTLIFTING_TAG],
  },
);

export type ExerciseDirectoryEntry = Awaited<
  ReturnType<typeof getCachedExerciseDirectory>
>[number];
type HistorySet = Pick<
  typeof wlSets.$inferSelect,
  "reps" | "weight" | "durationSeconds" | "distance" | "calories" | "custom"
>;

/** Fetch set details only for the exercise the visitor opens. */
export const getCachedExerciseOccurrences = unstable_cache(
  async (name: string, offset: number, allVariants?: boolean) => {
    const rows = await db.execute<{
      display_name: string;
      workout_uuid: string;
      workout_name: string | null;
      ts: string;
      exercise_order: number;
      style: string;
      sets: HistorySet[];
    }>(sql`
    WITH occurrences AS (
      SELECT e.id, e.exercise_order, e.style, ${displayName} AS display_name, w.uuid, w.name, w.date
      FROM wl_exercises e
      INNER JOIN wl_workouts w ON w.id = e.workout_id
      WHERE ${allVariants ? sql`e.name` : displayName} = ${name}
      ORDER BY w.date DESC, w.uuid DESC, e.exercise_order DESC
      LIMIT 11 OFFSET ${offset}
    )
    SELECT o.display_name, o.uuid AS workout_uuid, o.name AS workout_name,
      TO_CHAR(o.date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS ts,
      o.exercise_order, o.style,
      COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
        'reps', s.reps, 'weight', s.weight, 'durationSeconds', s.duration_seconds,
        'distance', s.distance, 'calories', s.calories, 'custom', s.custom
      ) ORDER BY s.set_order) FILTER (WHERE s.id IS NOT NULL), '[]'::jsonb) AS sets
    FROM occurrences o
    LEFT JOIN wl_sets s ON s.exercise_id = o.id
    GROUP BY o.display_name, o.id, o.uuid, o.name, o.date, o.exercise_order, o.style
    ORDER BY o.date DESC, o.uuid DESC, o.exercise_order DESC
  `);
    return {
      hasMore: rows.length > 10,
      instances: rows.slice(0, 10).map((row) => ({
        displayName: row.display_name,
        workoutUuid: row.workout_uuid,
        workoutName: row.workout_name?.trim() ? row.workout_name : "Workout",
        ts: row.ts,
        order: row.exercise_order,
        style: row.style,
        sets: row.sets,
      })),
    };
  },
  ["weightlifting-exercise-occurrences-v2"],
  {
    revalidate: WEIGHTLIFTING_REVALIDATE,
    tags: [WEIGHTLIFTING_TAG],
  },
);
