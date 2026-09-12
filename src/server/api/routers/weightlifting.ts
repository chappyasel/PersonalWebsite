import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { z } from "zod";

import { computeTrainingAnalytics } from "~/lib/weightlifting/analytics";
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
import { getCachedWeightliftingPareto } from "~/server/queries/weightliftingPareto";

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

/** Volume per UTC month per category — the stacked composition of the
 *  Over the Years chart. Yearly buckets derive client-side. */
const getCachedCategoryVolume = unstable_cache(
  async () => {
    const rows = await db.execute<{
      period: string;
      category: string;
      volume: number | string;
    }>(sql`
      SELECT
        TO_CHAR(w.date AT TIME ZONE 'UTC', 'YYYY-MM') AS period,
        e.category,
        SUM(s.volume) AS volume
      FROM wl_sets s
      INNER JOIN wl_exercises e ON s.exercise_id = e.id
      INNER JOIN wl_workouts w ON e.workout_id = w.id
      WHERE s.volume IS NOT NULL AND s.volume > 0
      GROUP BY period, e.category
      ORDER BY period
    `);
    return rows.map((r) => ({
      period: r.period,
      category: r.category,
      volume: Math.round(Number(r.volume)),
    }));
  },
  ["wl-category-volume"],
  { revalidate: WEIGHTLIFTING_REVALIDATE, tags: [WEIGHTLIFTING_TAG] },
);

/**
 * Composition splits for Training History: training hours per
 * month per day-of-week, and workout counts per month per time-of-day.
 *
 * Sync normalizes export dates to Pacific wall time in the UTC fields.
 * Reading UTC here preserves that reporting zone for every workout,
 * including workouts logged while traveling.
 *
 * Time-of-day buckets use the normalized START hour, not the app's
 * default workout names — renamed workouts used to fall into "Other".
 * Bucket edges are the owner's: Early Morning 1–7, Morning 7–11,
 * Mid-Day 11–16, Evening 16–20, Dusk 20–1.
 */
const getCachedTrainingSplits = unstable_cache(
  async () => {
    const [dowRows, todRows] = await Promise.all([
      db.execute<{ period: string; dow: number; hours: number | string }>(sql`
        SELECT
          TO_CHAR(w.date AT TIME ZONE 'UTC', 'YYYY-MM') AS period,
          EXTRACT(ISODOW FROM w.date AT TIME ZONE 'UTC')::int AS dow,
          SUM(w.duration_seconds) / 3600.0 AS hours
        FROM wl_workouts w
        GROUP BY period, dow
        ORDER BY period
      `),
      db.execute<{
        period: string;
        bucket: string;
        workouts: number | string;
      }>(sql`
        SELECT
          TO_CHAR(w.date AT TIME ZONE 'UTC', 'YYYY-MM') AS period,
          CASE
            WHEN EXTRACT(HOUR FROM w.date AT TIME ZONE 'UTC') BETWEEN 1 AND 6
              THEN 'Early Morning'
            WHEN EXTRACT(HOUR FROM w.date AT TIME ZONE 'UTC') BETWEEN 7 AND 10
              THEN 'Morning'
            WHEN EXTRACT(HOUR FROM w.date AT TIME ZONE 'UTC') BETWEEN 11 AND 15
              THEN 'Mid-Day'
            WHEN EXTRACT(HOUR FROM w.date AT TIME ZONE 'UTC') BETWEEN 16 AND 19
              THEN 'Evening'
            ELSE 'Dusk'
          END AS bucket,
          COUNT(*)::int AS workouts
        FROM wl_workouts w
        GROUP BY period, bucket
        ORDER BY period
      `),
    ]);
    return {
      hoursByDow: dowRows.map((r) => ({
        period: r.period,
        dow: Number(r.dow),
        hours: Math.round(Number(r.hours) * 100) / 100,
      })),
      workoutsByTime: todRows.map((r) => ({
        period: r.period,
        bucket: r.bucket,
        workouts: Number(r.workouts),
      })),
    };
  },
  ["wl-training-splits-pacific-v3"],
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
  getBodyweightPareto: publicProcedure
    .input(z.object({ displayName: z.string().min(1).max(511) }))
    .query(({ input }) => getCachedWeightliftingPareto(input.displayName)),
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

  /** One day's workouts with exercises, sets, superset groups, and page
   *  slugs — feeds the workout preview overlay (opened from an exercise
   *  page's instance rows or a calendar day). Looked up by workout id or by
   *  UTC date; a date can hold several workouts, so this returns a list. */
  getWorkoutPreview: publicProcedure
    .input(
      z.union([
        z.strictObject({ workoutUuid: z.string().min(1).max(255) }),
        z.strictObject({
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            // ISO parsing rejects impossible dates like 2026-02-31
            .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`))),
        }),
      ]),
    )
    .query(async ({ input }) => {
      const where =
        "workoutUuid" in input
          ? eq(wlWorkouts.uuid, input.workoutUuid)
          : and(
              gte(wlWorkouts.date, new Date(`${input.date}T00:00:00Z`)),
              lte(wlWorkouts.date, new Date(`${input.date}T23:59:59.999Z`)),
            );

      const workouts = await db.query.wlWorkouts.findMany({
        where,
        with: {
          exercises: {
            orderBy: asc(wlExercises.exerciseOrder),
            with: { sets: { orderBy: asc(wlSets.setOrder) } },
          },
        },
        orderBy: asc(wlWorkouts.date),
      });

      // Exercise-page links; an index failure only drops the links
      let slugByName = new Map<string, string>();
      try {
        const index = await getCachedExerciseIndex();
        slugByName = new Map(index.map((e) => [e.displayName, e.slug]));
      } catch {}

      return workouts.map((w) => ({
        id: w.id,
        name: w.name,
        /** UTC — matches every other weightlifting date on the site */
        ts: w.date.toISOString().slice(0, 16),
        durationSeconds: w.durationSeconds,
        /** Space-separated exerciseOrder groups, e.g. ["0 1", "2"] */
        supersets: w.supersets.map((group) =>
          group
            .split(" ")
            .filter((token) => token !== "")
            .map((token) => Number(token))
            .filter((n) => Number.isInteger(n) && n >= 0),
        ),
        exercises: w.exercises.map((e) => {
          const displayName = e.iteration ? `${e.iteration} ${e.name}` : e.name;
          return {
            order: e.exerciseOrder,
            displayName,
            category: e.category,
            style: e.style,
            slug: slugByName.get(displayName) ?? null,
            sets: e.sets.map((s) => ({
              reps: s.reps,
              weight: s.weight,
              oneRM: s.oneRM,
              volume: s.volume,
              durationSeconds: s.durationSeconds,
              distance: s.distance,
              calories: s.calories,
              custom: s.custom,
            })),
          };
        }),
      }));
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
  /** Monthly volume split by category for the Over the Years stacks */
  getCategoryVolume: publicProcedure.query(async () => {
    return getCachedCategoryVolume();
  }),

  /** Monthly hours-by-weekday and workouts-by-time-of-day splits */
  getTrainingSplits: publicProcedure.query(async () => {
    return getCachedTrainingSplits();
  }),

  getTrainingAnalytics: publicProcedure.query(async () => {
    const rows = await getCachedTrainingRows();
    return computeTrainingAnalytics(
      rows.map((r) => ({ ...r, date: new Date(r.date) })),
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
