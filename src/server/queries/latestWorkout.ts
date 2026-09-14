import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import "server-only";

import {
  WEIGHTLIFTING_REVALIDATE,
  WEIGHTLIFTING_TAG,
} from "~/lib/weightlifting/cache";
import { db } from "~/server/db";
import type { wlSets } from "~/server/db/schema";

export type LatestWorkoutExercise = {
  order: number;
  displayName: string;
  category: string;
  style: string;
  sets: Pick<
    typeof wlSets.$inferSelect,
    | "reps"
    | "weight"
    | "volume"
    | "durationSeconds"
    | "distance"
    | "calories"
    | "custom"
  >[];
};

/** Select one session before aggregating, including multiple sessions on a day. */
export const getCachedLatestWorkout = unstable_cache(
  async () => {
    const [row] = await db.execute<{
      uuid: string;
      name: string | null;
      date: string;
      duration_seconds: number | null;
      set_count: number | string;
      volume: number | string;
      categories: string[];
      supersets: string[];
      exercises: LatestWorkoutExercise[];
    }>(sql`
      WITH latest AS (
        SELECT id, uuid, name, date, duration_seconds, supersets
        FROM wl_workouts
        ORDER BY date DESC, uuid DESC
        LIMIT 1
      )
      SELECT w.uuid, w.name, w.supersets,
        COALESCE((
          SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
            'order', ex.exercise_order,
            'displayName', CASE WHEN ex.iteration IS NOT NULL AND ex.iteration <> ''
              THEN ex.iteration || ' ' || ex.name ELSE ex.name END,
            'category', ex.category, 'style', ex.style,
            'sets', COALESCE((
              SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                'reps', st.reps, 'weight', st.weight, 'volume', st.volume,
                'durationSeconds', st.duration_seconds, 'distance', st.distance,
                'calories', st.calories, 'custom', st.custom
              ) ORDER BY st.set_order)
              FROM wl_sets st WHERE st.exercise_id = ex.id
            ), '[]'::jsonb)
          ) ORDER BY ex.exercise_order)
          FROM wl_exercises ex WHERE ex.workout_id = w.id
        ), '[]'::jsonb) AS exercises,
        TO_CHAR(w.date AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
        w.duration_seconds,
        COUNT(s.id) AS set_count,
        COALESCE(SUM(s.volume), 0) AS volume,
        COALESCE(ARRAY_AGG(DISTINCT e.category ORDER BY e.category)
          FILTER (WHERE e.category IS NOT NULL AND e.category <> ''), '{}') AS categories
      FROM latest w
      LEFT JOIN wl_exercises e ON e.workout_id = w.id
      LEFT JOIN wl_sets s ON s.exercise_id = e.id
      GROUP BY w.id, w.uuid, w.name, w.date, w.duration_seconds, w.supersets
    `);
    if (!row) return null;
    const name = row.name?.trim();
    return {
      uuid: row.uuid,
      name: name?.length ? name : "Workout",
      date: row.date,
      durationSeconds: row.duration_seconds,
      setCount: Number(row.set_count),
      volume: Number(row.volume),
      categories: row.categories,
      exercises: row.exercises,
      supersets: row.supersets.map((group) =>
        group
          .split(" ")
          .filter((token) => token !== "")
          .map(Number)
          .filter((order) => Number.isInteger(order) && order >= 0),
      ),
    };
  },
  ["weightlifting-latest-workout-v2"],
  { revalidate: WEIGHTLIFTING_REVALIDATE, tags: [WEIGHTLIFTING_TAG] },
);

export type LatestWorkoutData = NonNullable<
  Awaited<ReturnType<typeof getCachedLatestWorkout>>
>;
