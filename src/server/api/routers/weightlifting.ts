import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { z } from "zod";

import {
  computeDailyTraining,
  computeTrainingAnalytics,
} from "~/lib/weightlifting/analytics";
import {
  WEIGHTLIFTING_ACTIVITY_TAG,
  WEIGHTLIFTING_REVALIDATE,
  WEIGHTLIFTING_TAG,
} from "~/lib/weightlifting/cache";
import { getWldLastModified } from "~/lib/weightlifting/s3";
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
import {
  getCachedActivityMosaic,
  getCachedWeightliftingStats,
} from "~/server/queries/weightlifting";
import { getCachedExerciseIndex } from "~/server/queries/weightliftingExercise";
import { getChartSelectableExercises } from "~/server/queries/weightliftingExercises";

const getCachedPersonalRecords = unstable_cache(
  async () => {
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
      INNER JOIN wl_workouts w ON e.workout_id = w.id
      WHERE s.one_rm IS NOT NULL AND s.one_rm > 0
      -- newest wins equal 1RMs, matching the exercise pages' podium
      ORDER BY display_name, s.one_rm DESC, w.date DESC
    `);

    // Link each record to its exercise page where one exists (the index
    // covers reps×weight lifts with 10+ sets; anything else gets no link).
    // An index failure only drops the links — never the whole records card
    let slugByName = new Map<string, string>();
    try {
      const index = await getCachedExerciseIndex();
      slugByName = new Map(index.map((e) => [e.displayName, e.slug]));
    } catch (error) {
      console.error("exercise index unavailable for PR links:", error);
    }

    return rows.map((r) => ({
      exerciseName: r.display_name,
      category: r.category,
      bestOneRM: Number(r.best_one_rm),
      reps: Number(r.best_reps),
      weight: Number(r.best_weight),
      instanceCount: Number(r.instance_count),
      slug: slugByName.get(r.display_name) ?? null,
    }));
  },
  ["wl-personal-records"],
  { revalidate: WEIGHTLIFTING_REVALIDATE, tags: [WEIGHTLIFTING_TAG] },
);

const getCachedCalendarData = unstable_cache(
  async (year: number) => {
    const startDate = new Date(`${year}-01-01T00:00:00Z`);
    const endDate = new Date(`${year + 1}-01-01T00:00:00Z`);

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
  },
  ["wl-calendar"],
  { revalidate: WEIGHTLIFTING_REVALIDATE, tags: [WEIGHTLIFTING_TAG] },
);

const getCachedStrengthProgression = unstable_cache(
  async (exercises: string[]) => {
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
          exercises.map((ex) => sql`${ex}`),
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
  },
  ["wl-strength-progression"],
  { revalidate: WEIGHTLIFTING_REVALIDATE, tags: [WEIGHTLIFTING_TAG] },
);

// When the phone last uploaded its backup (S3 HeadObject). Cached so page
// loads don't hit S3; refreshes on sync revalidation or the 6h TTL, so a
// fresh upload shows here even before the next cron ingests it.
const getCachedPhoneSyncedAt = unstable_cache(
  async () => {
    try {
      return await getWldLastModified();
    } catch (error) {
      console.error("Failed to read wld LastModified:", error);
      return null; // an S3 hiccup shouldn't break the status endpoint
    }
  },
  ["wl-file-last-modified"],
  { revalidate: WEIGHTLIFTING_REVALIDATE, tags: [WEIGHTLIFTING_TAG] },
);

// One row per workout with volume/set aggregates. Cached as ISO strings
// (unstable_cache JSON-serializes, so Dates would flap between types);
// consumers convert with `new Date()` after retrieval.
const getCachedTrainingRows = unstable_cache(
  async () => {
    const rows = await db.execute<{
      date: string;
      duration_seconds: number;
      volume: number | string;
      sets: number | string;
    }>(sql`
      SELECT
        TO_CHAR(w.date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS date,
        w.duration_seconds,
        COALESCE(SUM(s.volume), 0) AS volume,
        COUNT(s.id) AS sets
      FROM wl_workouts w
      LEFT JOIN wl_exercises e ON e.workout_id = w.id
      LEFT JOIN wl_sets s ON s.exercise_id = e.id
      GROUP BY w.id
      ORDER BY w.date
    `);

    return rows.map((r) => ({
      date: r.date,
      durationSeconds: Number(r.duration_seconds),
      volume: Number(r.volume),
      sets: Number(r.sets),
    }));
  },
  ["weightlifting-training-rows"],
  { revalidate: WEIGHTLIFTING_REVALIDATE, tags: [WEIGHTLIFTING_TAG] },
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
    return getCachedWeightliftingStats();
  }),

  /** Best estimated 1RM per exercise, with the reps×weight that produced it */
  getPersonalRecords: publicProcedure.query(async () => {
    return getCachedPersonalRecords();
  }),

  /** Calendar heatmap data: categories per day for a given year */
  getCalendarData: publicProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input }) => {
      return getCachedCalendarData(input.year);
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
      return getCachedStrengthProgression(input.exercises);
    }),

  /** Top exercises with meaningful 1RM data for exercise selector */
  getTopExercises: publicProcedure
    .input(
      z.object({
        minSets: z.number().min(1).default(10),
      }),
    )
    .query(async ({ input }) => {
      return getChartSelectableExercises(input.minSets);
    }),

  /** Weekly/monthly/yearly training buckets + lifetime totals */
  getTrainingAnalytics: publicProcedure.query(async () => {
    const rows = await getCachedTrainingRows();
    return computeTrainingAnalytics(
      rows.map((r) => ({ ...r, date: new Date(r.date) })),
    );
  }),

  /** Per-day training volume for one year (stats popover heatmap) */
  getDailyTraining: publicProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2100) }))
    .query(async ({ input }) => {
      const rows = await getCachedTrainingRows();
      return computeDailyTraining(
        rows.map((r) => ({ ...r, date: new Date(r.date) })),
        input.year,
      );
    }),

  /** Manual sync trigger */
  triggerSync: protectedProcedure.mutation(async () => {
    const result = await syncWeightlifting("manual");
    revalidateTag(WEIGHTLIFTING_TAG, "max");
    revalidateTag(WEIGHTLIFTING_ACTIVITY_TAG, "max");
    revalidatePath("/");
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
    // When the current data actually arrived: the phone uploads ~weekly, so
    // most cron syncs are hash-skip no-ops. The first successful sync with
    // the current file hash is the moment new data landed.
    const dataReceived = lastSuccess?.fileHash
      ? await db.query.wlSyncMetadata.findFirst({
          where: and(
            eq(wlSyncMetadata.status, "success"),
            eq(wlSyncMetadata.fileHash, lastSuccess.fileHash),
          ),
          orderBy: asc(wlSyncMetadata.syncStartedAt),
        })
      : null;
    // Data freshness as the user experiences it: the newest workout in the
    // data (the file can arrive days after the last workout it contains).
    // ISO-formatted in SQL so new Date() parses it in every browser.
    const [latestWorkout] = await db
      .select({
        latest: sql<
          string | null
        >`TO_CHAR(MAX(${wlWorkouts.date}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
      })
      .from(wlWorkouts);
    return {
      latest: latest ?? null,
      lastSuccess: lastSuccess ?? null,
      dataReceivedAt:
        dataReceived?.syncCompletedAt ?? lastSuccess?.syncCompletedAt ?? null,
      latestWorkoutAt: latestWorkout?.latest ?? null,
      phoneSyncedAt: await getCachedPhoneSyncedAt(),
    };
  }),
});
