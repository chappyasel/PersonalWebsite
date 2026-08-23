import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import "server-only";

import { effectiveDaysInYear } from "~/lib/stats/yoy";
import {
  WEIGHTLIFTING_ACTIVITY_TAG,
  WEIGHTLIFTING_REVALIDATE,
  WEIGHTLIFTING_TAG,
} from "~/lib/weightlifting/cache";
import { db } from "~/server/db";
import { wlExercises, wlSets, wlWorkouts } from "~/server/db/schema";

export const getCachedActivityMosaic = unstable_cache(
  async (months: number) => {
    const rows = await db.execute<{
      start_date: string;
      end_date: string;
      date: string;
      workout_count: number;
      duration_seconds: number;
      set_count: number;
      volume: number;
      categories: Record<string, number> | null;
    }>(sql`
      WITH bounds AS (
        SELECT
          DATE(MAX(${wlWorkouts.date})) AS end_day,
          (
            DATE(MAX(${wlWorkouts.date})) -
            (${months}::int || ' months')::interval +
            interval '1 day'
          )::date AS start_day
        FROM ${wlWorkouts}
      ),
      workouts_by_day AS (
        SELECT
          DATE(${wlWorkouts.date}) AS day,
          COUNT(*) AS workout_count,
          COALESCE(SUM(${wlWorkouts.durationSeconds}), 0) AS duration_seconds
        FROM ${wlWorkouts}
        CROSS JOIN bounds b
        WHERE ${wlWorkouts.date} >= b.start_day
          AND ${wlWorkouts.date} < b.end_day + interval '1 day'
        GROUP BY day
      ),
      sets_by_day AS (
        SELECT
          DATE(w.date) AS day,
          COUNT(s.id) AS set_count,
          COALESCE(SUM(s.volume), 0) AS volume
        FROM ${wlSets} s
        INNER JOIN ${wlExercises} e ON s.exercise_id = e.id
        INNER JOIN ${wlWorkouts} w ON e.workout_id = w.id
        CROSS JOIN bounds b
        WHERE w.date >= b.start_day
          AND w.date < b.end_day + interval '1 day'
        GROUP BY day
      ),
      categories_by_day AS (
        SELECT
          day,
          jsonb_object_agg(category, exercise_count ORDER BY category) AS categories
        FROM (
          SELECT
            DATE(w.date) AS day,
            e.category AS category,
            COUNT(DISTINCT e.id) AS exercise_count
          FROM ${wlExercises} e
          INNER JOIN ${wlWorkouts} w ON e.workout_id = w.id
          CROSS JOIN bounds b
          WHERE w.date >= b.start_day
            AND w.date < b.end_day + interval '1 day'
          GROUP BY day, e.category
        ) category_counts
        GROUP BY day
      )
      SELECT
        TO_CHAR(b.start_day, 'YYYY-MM-DD') AS start_date,
        TO_CHAR(b.end_day, 'YYYY-MM-DD') AS end_date,
        TO_CHAR(w.day, 'YYYY-MM-DD') AS date,
        w.workout_count,
        w.duration_seconds,
        COALESCE(s.set_count, 0) AS set_count,
        COALESCE(s.volume, 0) AS volume,
        COALESCE(c.categories, '{}'::jsonb) AS categories
      FROM workouts_by_day w
      CROSS JOIN bounds b
      LEFT JOIN sets_by_day s USING (day)
      LEFT JOIN categories_by_day c USING (day)
      ORDER BY w.day
    `);

    const startDate = rows[0]?.start_date ?? null;
    const endDate = rows[0]?.end_date ?? null;
    const days = rows.map((row) => ({
      date: row.date,
      workoutCount: Number(row.workout_count),
      durationSeconds: Number(row.duration_seconds),
      setCount: Number(row.set_count),
      volume: Number(row.volume),
      categories: row.categories ?? {},
    }));

    const categoryTotals: Record<string, number> = {};
    for (const day of days) {
      for (const [category, count] of Object.entries(day.categories)) {
        categoryTotals[category] = (categoryTotals[category] ?? 0) + count;
      }
    }

    return {
      months,
      startDate,
      endDate,
      days,
      activeDays: days.length,
      totalWorkouts: days.reduce((sum, day) => sum + day.workoutCount, 0),
      maxVolume: Math.max(0, ...days.map((day) => day.volume)),
      topCategory:
        Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ??
        null,
    };
  },
  ["weightlifting-activity-mosaic"],
  {
    revalidate: WEIGHTLIFTING_REVALIDATE,
    tags: [WEIGHTLIFTING_TAG, WEIGHTLIFTING_ACTIVITY_TAG],
  },
);

export const getCachedWeightliftingStats = unstable_cache(
  async () => {
    const [
      [workoutCount],
      [setCount],
      [totalVolume],
      [totalDuration],
      [earliest],
    ] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(wlWorkouts),
      db.select({ count: sql<number>`COUNT(*)` }).from(wlSets),
      db.select({ total: sql<number>`COALESCE(SUM(volume), 0)` }).from(wlSets),
      db
        .select({
          total: sql<number>`COALESCE(SUM(${wlWorkouts.durationSeconds}), 0)`,
        })
        .from(wlWorkouts),
      db
        .select({
          earliest: sql<
            string | null
          >`TO_CHAR(MIN(${wlWorkouts.date}), 'YYYY-MM-DD')`,
        })
        .from(wlWorkouts),
    ]);

    return {
      totalWorkouts: Number(workoutCount?.count ?? 0),
      totalSets: Number(setCount?.count ?? 0),
      totalVolume: Number(totalVolume?.total ?? 0),
      totalDurationSeconds: Number(totalDuration?.total ?? 0),
      earliestWorkout: earliest?.earliest ?? null,
    };
  },
  ["wl-stats"],
  { revalidate: WEIGHTLIFTING_REVALIDATE, tags: [WEIGHTLIFTING_TAG] },
);

/**
 * The homepage placard intentionally carries only the three records it shows
 * and one count per year. The full exercise history remains on the dedicated
 * weightlifting route.
 */
export const getCachedWeightliftingPlacard = unstable_cache(
  async () => {
    const [stats, yearlyRows, recordRows] = await Promise.all([
      getCachedWeightliftingStats(),
      db.execute<{
        year: number;
        workouts: number;
      }>(sql`
        SELECT
          EXTRACT(YEAR FROM ${wlWorkouts.date})::int AS year,
          COUNT(*)::int AS workouts
        FROM ${wlWorkouts}
        GROUP BY 1
        ORDER BY 1
      `),
      db.execute<{
        key: "bench" | "squat" | "deadlift";
        label: string;
        exercise_name: string;
        category: string | null;
        best_one_rm: number | null;
        reps: number | null;
        weight: number | null;
      }>(sql`
        WITH target_lifts(key, label, exercise_name, lift_order) AS (
          VALUES
            ('bench', 'Bench', 'Flat Barbell Bench Press', 1),
            ('squat', 'Squat', 'Back Squats', 2),
            ('deadlift', 'Deadlift', 'Conventional Deadlifts', 3)
        )
        SELECT
          target.key,
          target.label,
          target.exercise_name,
          record.category,
          record.best_one_rm,
          record.reps,
          record.weight
        FROM target_lifts target
        LEFT JOIN LATERAL (
          SELECT
            ${wlExercises.category} AS category,
            ${wlSets.oneRM} AS best_one_rm,
            ${wlSets.reps} AS reps,
            ${wlSets.weight} AS weight
          FROM ${wlSets}
          INNER JOIN ${wlExercises}
            ON ${wlExercises.id} = ${wlSets.exerciseId}
          WHERE ${wlSets.oneRM} IS NOT NULL
            AND CASE
              WHEN ${wlExercises.iteration} IS NOT NULL
                AND ${wlExercises.iteration} <> ''
              THEN ${wlExercises.iteration} || ' ' || ${wlExercises.name}
              ELSE ${wlExercises.name}
            END = target.exercise_name
          ORDER BY ${wlSets.oneRM} DESC
          LIMIT 1
        ) record ON true
        ORDER BY target.lift_order
      `),
    ]);

    const currentYear = new Date().getUTCFullYear();
    const firstYear = yearlyRows[0]?.year ?? currentYear;
    const counts = new Map(
      yearlyRows.map((row) => [Number(row.year), Number(row.workouts)]),
    );
    const currentYearWorkouts = counts.get(currentYear) ?? 0;
    const daysInCurrentYear = Math.round(
      (Date.UTC(currentYear + 1, 0, 1) - Date.UTC(currentYear, 0, 1)) /
        86_400_000,
    );
    const elapsedFraction =
      effectiveDaysInYear(String(currentYear), new Date()) / daysInCurrentYear;
    const projectedRemainder =
      elapsedFraction > 0 && elapsedFraction < 1
        ? (currentYearWorkouts * (1 - elapsedFraction)) / elapsedFraction
        : 0;

    return {
      stats,
      yearly: Array.from(
        { length: Math.max(1, currentYear - firstYear + 1) },
        (_, index) => {
          const year = firstYear + index;
          return {
            year,
            workouts: counts.get(year) ?? 0,
            projectedRemainder: year === currentYear ? projectedRemainder : 0,
          };
        },
      ),
      records: recordRows.map((record) => ({
        key: record.key,
        label: record.label,
        exerciseName: record.exercise_name,
        category: record.category,
        bestOneRM:
          record.best_one_rm === null ? null : Number(record.best_one_rm),
        reps: record.reps === null ? null : Number(record.reps),
        weight: record.weight === null ? null : Number(record.weight),
      })),
    };
  },
  ["weightlifting-homepage-placard"],
  { revalidate: WEIGHTLIFTING_REVALIDATE, tags: [WEIGHTLIFTING_TAG] },
);

export type ActivityMosaicData = Awaited<
  ReturnType<typeof getCachedActivityMosaic>
>;
export type WeightliftingStatsData = Awaited<
  ReturnType<typeof getCachedWeightliftingStats>
>;
export type WeightliftingPlacardData = Awaited<
  ReturnType<typeof getCachedWeightliftingPlacard>
>;

/**
 * Neutral values for callers that would rather render without training data
 * than fail. Both mirror what the queries return against an empty database,
 * so the placard and mosaic take their own no-data paths instead of meeting a
 * shape they were never typed for. They are typed against the query returns,
 * so a column added above breaks these until they are updated too.
 */
export function emptyActivityMosaic(months: number): ActivityMosaicData {
  return {
    months,
    startDate: null,
    endDate: null,
    days: [],
    activeDays: 0,
    totalWorkouts: 0,
    maxVolume: 0,
    topCategory: null,
  };
}

export const EMPTY_WEIGHTLIFTING_PLACARD: WeightliftingPlacardData = {
  stats: {
    totalWorkouts: 0,
    totalSets: 0,
    totalVolume: 0,
    totalDurationSeconds: 0,
    earliestWorkout: null,
  },
  yearly: [],
  records: [],
};
