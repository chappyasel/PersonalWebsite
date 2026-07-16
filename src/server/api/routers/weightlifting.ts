import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { revalidateTag, unstable_cache } from "next/cache";
import { z } from "zod";

import { syncWeightlifting } from "~/lib/weightlifting/sync";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  wlExercises,
  wlSets,
  wlSyncMetadata,
  wlWorkouts,
} from "~/server/db/schema";

const WEIGHTLIFTING_ACTIVITY_TAG = "weightlifting-activity";

const getCachedActivityMosaic = unstable_cache(
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
    const days = rows.map((r) => ({
      date: r.date,
      workoutCount: Number(r.workout_count),
      durationSeconds: Number(r.duration_seconds),
      setCount: Number(r.set_count),
      volume: Number(r.volume),
      categories: r.categories ?? {},
    }));

    const categoryTotals: Record<string, number> = {};
    for (const day of days) {
      for (const [category, count] of Object.entries(day.categories)) {
        categoryTotals[category] = (categoryTotals[category] ?? 0) + count;
      }
    }

    const topCategory =
      Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      null;

    return {
      months,
      startDate,
      endDate,
      days,
      activeDays: days.length,
      totalWorkouts: days.reduce((sum, day) => sum + day.workoutCount, 0),
      maxVolume: Math.max(0, ...days.map((day) => day.volume)),
      topCategory,
    };
  },
  ["weightlifting-activity-mosaic"],
  {
    revalidate: 60 * 60 * 6,
    tags: [WEIGHTLIFTING_ACTIVITY_TAG],
  },
);

export const weightliftingRouter = createTRPCRouter({
  /** Paginated workout list with date range filter */
  getWorkouts: publicProcedure
    .input(
      z.object({
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const conditions = [];
      if (input.startDate) {
        conditions.push(gte(wlWorkouts.date, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(wlWorkouts.date, new Date(input.endDate)));
      }

      const workouts = await db.query.wlWorkouts.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
          exercises: {
            orderBy: asc(wlExercises.exerciseOrder),
            with: {
              sets: {
                orderBy: asc(wlSets.setOrder),
              },
            },
          },
        },
        orderBy: desc(wlWorkouts.date),
        limit: input.limit,
        offset: input.offset,
      });

      return workouts;
    }),

  /** Aggregate stats */
  getStats: publicProcedure.query(async () => {
    const [workoutCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(wlWorkouts);

    const [setCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(wlSets);

    const [totalVolume] = await db
      .select({ total: sql<number>`COALESCE(SUM(volume), 0)` })
      .from(wlSets);

    const [totalDuration] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${wlWorkouts.durationSeconds}), 0)`,
      })
      .from(wlWorkouts);

    const [earliest] = await db
      .select({
        earliest: sql<string>`MIN(${wlWorkouts.date})`,
      })
      .from(wlWorkouts);

    return {
      totalWorkouts: Number(workoutCount?.count ?? 0),
      totalSets: Number(setCount?.count ?? 0),
      totalVolume: Number(totalVolume?.total ?? 0),
      totalDurationSeconds: Number(totalDuration?.total ?? 0),
      earliestWorkout: earliest?.earliest ?? null,
    };
  }),

  /** Best estimated 1RM per exercise, with the reps×weight that produced it */
  getPersonalRecords: publicProcedure.query(async () => {
    const rows = await db.execute<{
      display_name: string;
      category: string;
      best_one_rm: number;
      best_reps: number;
      best_weight: number;
      instance_count: number;
    }>(sql`
      SELECT DISTINCT ON (display_name)
        CASE
          WHEN e.iteration IS NOT NULL AND e.iteration != ''
          THEN e.iteration || ' ' || e.name
          ELSE e.name
        END AS display_name,
        e.category,
        s.one_rm AS best_one_rm,
        s.reps AS best_reps,
        s.weight AS best_weight,
        (SELECT COUNT(DISTINCT e2.id)
         FROM wl_exercises e2
         WHERE e2.name = e.name
           AND COALESCE(e2.iteration, '') = COALESCE(e.iteration, '')) AS instance_count
      FROM wl_sets s
      INNER JOIN wl_exercises e ON s.exercise_id = e.id
      WHERE s.one_rm IS NOT NULL AND s.one_rm > 0
      ORDER BY display_name, s.one_rm DESC
    `);

    return rows.map((r) => ({
      exerciseName: r.display_name,
      category: r.category,
      bestOneRM: Number(r.best_one_rm),
      reps: Number(r.best_reps),
      weight: Number(r.best_weight),
      instanceCount: Number(r.instance_count),
    }));
  }),

  /** Calendar heatmap data: categories per day for a given year */
  getCalendarData: publicProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input }) => {
      const startDate = new Date(`${input.year}-01-01T00:00:00Z`);
      const endDate = new Date(`${input.year + 1}-01-01T00:00:00Z`);

      const rows = await db
        .select({
          date: sql<string>`DATE(${wlWorkouts.date})`.as("day"),
          category: wlExercises.category,
          count: sql<number>`COUNT(DISTINCT ${wlExercises.id})`,
        })
        .from(wlExercises)
        .innerJoin(wlWorkouts, eq(wlExercises.workoutId, wlWorkouts.id))
        .where(
          and(gte(wlWorkouts.date, startDate), lte(wlWorkouts.date, endDate)),
        )
        .groupBy(sql`DATE(${wlWorkouts.date})`, wlExercises.category)
        .orderBy(sql`DATE(${wlWorkouts.date})`);

      // Group by date
      const dayMap: Record<string, Record<string, number>> = {};
      for (const row of rows) {
        const d = row.date;
        dayMap[d] ??= {};
        dayMap[d][row.category] = Number(row.count);
      }

      return Object.entries(dayMap).map(([date, categories]) => ({
        date,
        categories,
      }));
    }),

  /** Lightweight rolling activity mosaic for the homepage */
  getActivityMosaic: publicProcedure
    .input(
      z.object({
        months: z.number().min(1).max(24).default(12),
      }),
    )
    .query(async ({ input }) => {
      return getCachedActivityMosaic(input.months);
    }),

  /** Per-workout best 1RM per exercise for strength progression chart */
  getStrengthProgression: publicProcedure
    .input(
      z.object({
        exercises: z.array(z.string()).min(1).max(20),
      }),
    )
    .query(async ({ input }) => {
      const rows = await db.execute<{
        date: string;
        exercise: string;
        best_one_rm: number;
      }>(sql`
        SELECT
          TO_CHAR(w.date, 'YYYY-MM-DD') AS date,
          CASE
            WHEN e.iteration IS NOT NULL AND e.iteration != ''
            THEN e.iteration || ' ' || e.name
            ELSE e.name
          END AS exercise,
          MAX(s.one_rm) AS best_one_rm
        FROM wl_sets s
        INNER JOIN wl_exercises e ON s.exercise_id = e.id
        INNER JOIN wl_workouts w ON e.workout_id = w.id
        WHERE s.one_rm IS NOT NULL
          AND s.one_rm > 0
          AND e.style = 'reps_weight'
          AND (CASE
            WHEN e.iteration IS NOT NULL AND e.iteration != ''
            THEN e.iteration || ' ' || e.name
            ELSE e.name
          END) IN (${sql.join(
            input.exercises.map((ex) => sql`${ex}`),
            sql`, `,
          )})
        GROUP BY date, exercise
        ORDER BY date
      `);

      return rows.map((r) => ({
        date: r.date,
        exercise: r.exercise,
        bestOneRM: Number(r.best_one_rm),
      }));
    }),

  /** Top exercises with meaningful 1RM data for exercise selector */
  getTopExercises: publicProcedure
    .input(
      z.object({
        minSets: z.number().min(1).default(10),
      }),
    )
    .query(async ({ input }) => {
      const rows = await db.execute<{
        display_name: string;
        name: string;
        category: string;
        set_count: number;
        best_one_rm: number;
      }>(sql`
        SELECT
          CASE
            WHEN e.iteration IS NOT NULL AND e.iteration != ''
            THEN e.iteration || ' ' || e.name
            ELSE e.name
          END AS display_name,
          e.name,
          e.category,
          COUNT(s.id) AS set_count,
          MAX(s.one_rm) AS best_one_rm
        FROM wl_sets s
        INNER JOIN wl_exercises e ON s.exercise_id = e.id
        WHERE s.one_rm IS NOT NULL
          AND s.one_rm > 0
          AND e.style = 'reps_weight'
        GROUP BY display_name, e.name, e.category
        HAVING COUNT(s.id) >= ${input.minSets}
        ORDER BY best_one_rm DESC
      `);

      return rows.map((r) => ({
        displayName: r.display_name,
        name: r.name,
        category: r.category,
        setCount: Number(r.set_count),
        bestOneRM: Number(r.best_one_rm),
      }));
    }),

  /** Manual sync trigger */
  triggerSync: protectedProcedure.mutation(async () => {
    const result = await syncWeightlifting("manual");
    revalidateTag(WEIGHTLIFTING_ACTIVITY_TAG, "max");
    return result;
  }),

  /** Last sync status: most recent attempt + most recent success */
  getSyncStatus: publicProcedure.query(async () => {
    const latest = await db.query.wlSyncMetadata.findFirst({
      orderBy: desc(wlSyncMetadata.syncStartedAt),
    });
    const lastSuccess =
      latest?.status === "success"
        ? latest
        : await db.query.wlSyncMetadata.findFirst({
            where: eq(wlSyncMetadata.status, "success"),
            orderBy: desc(wlSyncMetadata.syncStartedAt),
          });
    return { latest: latest ?? null, lastSuccess: lastSuccess ?? null };
  }),
});
