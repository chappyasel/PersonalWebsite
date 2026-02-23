import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
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
      exercise_name: string;
      category: string;
      best_one_rm: number;
      best_reps: number;
      best_weight: number;
    }>(sql`
      SELECT DISTINCT ON (e.name)
        e.name AS exercise_name,
        e.category,
        s.one_rm AS best_one_rm,
        s.reps AS best_reps,
        s.weight AS best_weight
      FROM wl_sets s
      INNER JOIN wl_exercises e ON s.exercise_id = e.id
      WHERE s.one_rm IS NOT NULL AND s.one_rm > 0
      ORDER BY e.name, s.one_rm DESC
    `);

    return rows.map((r) => ({
      exerciseName: r.exercise_name,
      category: r.category,
      bestOneRM: Number(r.best_one_rm),
      reps: Number(r.best_reps),
      weight: Number(r.best_weight),
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

  /** Manual sync trigger */
  triggerSync: protectedProcedure.mutation(async () => {
    const result = await syncWeightlifting("manual");
    return result;
  }),

  /** Last sync status */
  getSyncStatus: publicProcedure.query(async () => {
    return db.query.wlSyncMetadata.findFirst({
      orderBy: desc(wlSyncMetadata.syncStartedAt),
    });
  }),
});
