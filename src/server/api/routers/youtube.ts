import { desc, sql } from "drizzle-orm";
import { z } from "zod";

import { env } from "~/env";
import { CATEGORY_VALUES } from "~/lib/youtube/categories";
import { syncYouTube } from "~/lib/youtube/sync";
import {
  createTRPCRouter,
  cookieProtectedProcedure,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import { ytSyncMetadata, ytWatchHistory } from "~/server/db/schema";

/** Average playback speed — divides raw duration to estimate actual watch time */
const PLAYBACK_SPEED = 2.1;

/** Viewer's local timezone. Day/week/month buckets are computed in this zone,
 *  not UTC — evening viewing (e.g. after 5pm Pacific) crosses UTC midnight and
 *  would otherwise spill onto the next calendar day, inflating it. */
const DISPLAY_TIME_ZONE = "America/Los_Angeles";

/** `watched_at` (a timestamptz, an absolute instant) rendered as local
 *  wall-clock time, so calendar bucketing aligns to the viewer's days. */
const localWatchedAt = sql`(${ytWatchHistory.watchedAt} AT TIME ZONE ${DISPLAY_TIME_ZONE})`;

const timeRangeSchema = z.enum(["30d", "90d", "1y", "3y", "all"]).default("all");

function timeRangeWhere(range: z.infer<typeof timeRangeSchema>) {
  if (range === "all") return sql`TRUE`;
  const days = range === "30d" ? 30 : range === "90d" ? 90 : range === "1y" ? 365 : 1095;
  return sql`${ytWatchHistory.watchedAt} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`;
}

/** Enumerate period-start keys (YYYY-MM-DD, UTC) from start to end inclusive,
 *  stepping by the group size — used to fill zero-watch gaps in time series so
 *  days with no watching graph as 0 rather than being skipped. */
function enumeratePeriods(
  start: string,
  end: string,
  groupBy: "day" | "week" | "month" | "quarter",
): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  const endDate = new Date(end + "T00:00:00Z");
  let guard = 0;
  while (d <= endDate && guard++ < 20000) {
    out.push(d.toISOString().slice(0, 10));
    if (groupBy === "day") d.setUTCDate(d.getUTCDate() + 1);
    else if (groupBy === "week") d.setUTCDate(d.getUTCDate() + 7);
    else if (groupBy === "month") d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCMonth(d.getUTCMonth() + 3);
  }
  return out;
}

/** SQL CASE for computing weighted productive seconds from categoryId */
/** Heuristic weight from YouTube category (fallback when no LLM score) */
const heuristicWeightCase = sql`CASE ${ytWatchHistory.categoryId} ${sql.join(
  Object.entries(CATEGORY_VALUES).map(
    ([id, w]) => sql`WHEN ${Number(id)} THEN ${sql.raw(String(w))}`,
  ),
  sql` `,
)} ELSE 0 END`;

/** Quality score: prefer LLM score, fall back to heuristic */
const qualityScoreExpr = sql`COALESCE(${ytWatchHistory.llmQualityScore}, ${heuristicWeightCase})`;

/** Quality tier: prefer LLM-based tiers, fall back to category-based */
const qualityTierExpr = sql`CASE
  WHEN COALESCE(${ytWatchHistory.llmQualityScore}, ${heuristicWeightCase}) >= 0.5 THEN 'high'
  WHEN COALESCE(${ytWatchHistory.llmQualityScore}, ${heuristicWeightCase}) >= 0.15 THEN 'medium'
  ELSE 'low'
END`;

export const youtubeRouter = createTRPCRouter({
  /** Verify content password */
  verifyPassword: publicProcedure
    .input(z.object({ password: z.string() }))
    .mutation(({ input }) => {
      const valid = input.password === env.DAD_CONTENT_PASSWORD;
      return { valid };
    }),

  /** Quality score: productivity % for last 30d vs prior 30d */
  getQualityScore: cookieProtectedProcedure.query(async () => {
    const rows = await db
      .select({
        period:
          sql<string>`CASE WHEN ${ytWatchHistory.watchedAt} >= NOW() - INTERVAL '30 days' THEN 'current' ELSE 'prior' END`.as(
            "period",
          ),
        totalSeconds:
          sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds}), 0)`,
        productiveSeconds:
          sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds} * ${qualityScoreExpr}), 0)`,
      })
      .from(ytWatchHistory)
      .where(
        sql`${ytWatchHistory.watchedAt} >= NOW() - INTERVAL '60 days'`,
      )
      .groupBy(
        sql`CASE WHEN ${ytWatchHistory.watchedAt} >= NOW() - INTERVAL '30 days' THEN 'current' ELSE 'prior' END`,
      );

    let currentPct = 0;
    let priorPct = 0;
    for (const r of rows) {
      const pct =
        Number(r.totalSeconds) > 0
          ? (Number(r.productiveSeconds) / Number(r.totalSeconds)) * 100
          : 0;
      if (r.period === "current") currentPct = pct;
      else priorPct = pct;
    }

    return {
      currentPct,
      priorPct,
      deltaPct: currentPct - priorPct,
    };
  }),

  /** Aggregate stats */
  getStats: cookieProtectedProcedure.query(async () => {
    const [videoCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(ytWatchHistory);

    const [totalDuration] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds}), 0)`,
      })
      .from(ytWatchHistory);

    const [dateRange] = await db
      .select({
        earliest: sql<string>`MIN(${ytWatchHistory.watchedAt})`,
        latest: sql<string>`MAX(${ytWatchHistory.watchedAt})`,
      })
      .from(ytWatchHistory);

    const [uniqueChannels] = await db
      .select({
        count: sql<number>`COUNT(DISTINCT ${ytWatchHistory.channelName})`,
      })
      .from(ytWatchHistory);

    return {
      totalVideos: Number(videoCount?.count ?? 0),
      totalDurationSeconds:
        Number(totalDuration?.total ?? 0) / PLAYBACK_SPEED,
      earliestWatch: dateRange?.earliest ?? null,
      latestWatch: dateRange?.latest ?? null,
      uniqueChannels: Number(uniqueChannels?.count ?? 0),
    };
  }),

  /** Watch time aggregated by day, week, month, or quarter — returns avg hrs/day + quality % */
  getWatchTimeOverTime: cookieProtectedProcedure
    .input(
      z.object({
        groupBy: z.enum(["day", "week", "month", "quarter"]).default("week"),
        timeRange: timeRangeSchema,
      }),
    )
    .query(async ({ input }) => {
      const truncExpr =
        input.groupBy === "day"
          ? sql`DATE_TRUNC('day', ${localWatchedAt})`
          : input.groupBy === "week"
            ? sql`DATE_TRUNC('week', ${localWatchedAt})`
            : input.groupBy === "month"
              ? sql`DATE_TRUNC('month', ${localWatchedAt})`
              : sql`DATE_TRUNC('quarter', ${localWatchedAt})`;

      const rows = await db
        .select({
          period: sql<string>`TO_CHAR(${truncExpr}, 'YYYY-MM-DD')`.as(
            "period",
          ),
          totalSeconds: sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds}), 0)`,
          productiveSeconds: sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds} * ${qualityScoreExpr}), 0)`,
          videoCount: sql<number>`COUNT(*)`,
        })
        .from(ytWatchHistory)
        .where(timeRangeWhere(input.timeRange))
        .groupBy(sql`${truncExpr}`)
        .orderBy(sql`${truncExpr}`);

      if (rows.length === 0) return [];

      const daysIn = (period: string): number => {
        const periodStart = new Date(period + "T00:00:00Z");
        if (input.groupBy === "day") return 1;
        if (input.groupBy === "week") return 7;
        if (input.groupBy === "month") {
          return new Date(
            periodStart.getUTCFullYear(),
            periodStart.getUTCMonth() + 1,
            0,
          ).getDate();
        }
        const qEnd = new Date(
          periodStart.getUTCFullYear(),
          periodStart.getUTCMonth() + 3,
          0,
        );
        return (
          Math.round((qEnd.getTime() - periodStart.getTime()) / 86400000) + 1
        );
      };

      // Zero-fill every period between the first and last watched period so
      // empty stretches graph as 0 instead of the line jumping across them.
      // Quality % is left null on no-watch days (it's undefined when nothing
      // was watched) and the line connects across those gaps.
      const byPeriod = new Map(rows.map((r) => [r.period, r]));
      const periods = enumeratePeriods(
        rows[0]!.period,
        rows[rows.length - 1]!.period,
        input.groupBy,
      );

      return periods.map((period) => {
        const r = byPeriod.get(period);
        if (!r) {
          return {
            period,
            avgHoursPerDay: 0,
            totalHours: 0,
            videoCount: 0,
            productivityPct: null as number | null,
          };
        }
        const totalHours = Number(r.totalSeconds) / 3600 / PLAYBACK_SPEED;
        const productivityPct: number | null =
          Number(r.totalSeconds) > 0
            ? (Number(r.productiveSeconds) / Number(r.totalSeconds)) * 100
            : null;
        return {
          period,
          avgHoursPerDay: totalHours / daysIn(period),
          totalHours,
          videoCount: Number(r.videoCount),
          productivityPct,
        };
      });
    }),

  /** Top channels by total watch time, with quality score stats */
  getTopChannels: cookieProtectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        timeRange: timeRangeSchema,
      }),
    )
    .query(async ({ input }) => {
      const rows = await db
        .select({
          channelName:
            sql<string>`COALESCE(${ytWatchHistory.channelName}, 'Unknown')`.as(
              "channel_name",
            ),
          totalSeconds: sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds}), 0)`,
          productiveSeconds: sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds} * ${qualityScoreExpr}), 0)`,
          videoCount: sql<number>`COUNT(*)`,
          qualityMean: sql<number>`COALESCE(AVG(${ytWatchHistory.llmQualityScore}), 0)`,
          qualityStddev: sql<number>`COALESCE(STDDEV_POP(${ytWatchHistory.llmQualityScore}), 0)`,
          qualityMin: sql<number>`COALESCE(MIN(${ytWatchHistory.llmQualityScore}), 0)`,
          qualityMax: sql<number>`COALESCE(MAX(${ytWatchHistory.llmQualityScore}), 0)`,
        })
        .from(ytWatchHistory)
        .where(timeRangeWhere(input.timeRange))
        .groupBy(ytWatchHistory.channelName)
        .orderBy(
          sql`COALESCE(SUM(${ytWatchHistory.durationSeconds}), 0) DESC`,
        )
        .limit(input.limit);

      return rows.map((r) => ({
        channelName: r.channelName,
        totalHours: Number(r.totalSeconds) / 3600 / PLAYBACK_SPEED,
        videoCount: Number(r.videoCount),
        qualityScore:
          Number(r.totalSeconds) > 0
            ? Number(r.productiveSeconds) / Number(r.totalSeconds)
            : 0,
        qualityMean: Number(r.qualityMean),
        qualityStddev: Number(r.qualityStddev),
        qualityMin: Number(r.qualityMin),
        qualityMax: Number(r.qualityMax),
      }));
    }),

  /** Category breakdown by quality tier per time period */
  getCategoryBreakdown: cookieProtectedProcedure
    .input(
      z.object({
        groupBy: z.enum(["day", "week", "month", "quarter"]).default("month"),
        timeRange: timeRangeSchema,
      }),
    )
    .query(async ({ input }) => {
      const truncExpr =
        input.groupBy === "day"
          ? sql`DATE_TRUNC('day', ${localWatchedAt})`
          : input.groupBy === "week"
            ? sql`DATE_TRUNC('week', ${localWatchedAt})`
            : input.groupBy === "month"
              ? sql`DATE_TRUNC('month', ${localWatchedAt})`
              : sql`DATE_TRUNC('quarter', ${localWatchedAt})`;

      const rows = await db
        .select({
          period: sql<string>`TO_CHAR(${truncExpr}, 'YYYY-MM-DD')`.as(
            "period",
          ),
          totalSeconds: sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds}), 0)`,
          videoCount: sql<number>`COUNT(*)`,
        })
        .from(ytWatchHistory)
        .where(timeRangeWhere(input.timeRange))
        .groupBy(sql`${truncExpr}`, ytWatchHistory.llmQualityScore, ytWatchHistory.categoryId)
        .orderBy(sql`${truncExpr}`);

      // We need the per-row score to bucket into sub-tiers.
      // Since we GROUP BY llmQualityScore + categoryId, each row has a unique score.
      // Reconstruct the score from the group key by re-querying with score included.
      // Actually — since we group by llmQualityScore, we can just select it directly.
      const rowsWithScore = await db
        .select({
          period: sql<string>`TO_CHAR(${truncExpr}, 'YYYY-MM-DD')`.as("period"),
          score: sql<number>`COALESCE(${ytWatchHistory.llmQualityScore}, ${heuristicWeightCase})`,
          totalSeconds: sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds}), 0)`,
        })
        .from(ytWatchHistory)
        .where(timeRangeWhere(input.timeRange))
        .groupBy(sql`${truncExpr}`, ytWatchHistory.llmQualityScore, ytWatchHistory.categoryId)
        .orderBy(sql`${truncExpr}`);

      type SubTiers = {
        deepLearning: number; // 0.75-1.0
        education: number;    // 0.50-0.75
        growth: number;       // 0.35-0.50
        informational: number; // 0.15-0.35
        lowValue: number;     // 0.05-0.15
        brainRot: number;     // 0.00-0.05
      };

      const periodMap = new Map<string, SubTiers>();

      for (const r of rowsWithScore) {
        if (!periodMap.has(r.period)) {
          periodMap.set(r.period, {
            deepLearning: 0, education: 0, growth: 0,
            informational: 0, lowValue: 0, brainRot: 0,
          });
        }
        const entry = periodMap.get(r.period)!;
        const hrs = Number(r.totalSeconds) / 3600 / PLAYBACK_SPEED;
        const score = Number(r.score);
        if (score >= 0.75) entry.deepLearning += hrs;
        else if (score >= 0.50) entry.education += hrs;
        else if (score >= 0.35) entry.growth += hrs;
        else if (score >= 0.15) entry.informational += hrs;
        else if (score >= 0.05) entry.lowValue += hrs;
        else entry.brainRot += hrs;
      }

      return [...periodMap.entries()].map(([period, d]) => {
        const periodStart = new Date(period + "T00:00:00Z");
        let daysInPeriod: number;
        if (input.groupBy === "day") {
          daysInPeriod = 1;
        } else if (input.groupBy === "week") {
          daysInPeriod = 7;
        } else if (input.groupBy === "month") {
          daysInPeriod = new Date(
            periodStart.getUTCFullYear(),
            periodStart.getUTCMonth() + 1,
            0,
          ).getDate();
        } else {
          const qEnd = new Date(
            periodStart.getUTCFullYear(),
            periodStart.getUTCMonth() + 3,
            0,
          );
          daysInPeriod =
            Math.round(
              (qEnd.getTime() - periodStart.getTime()) / 86400000,
            ) + 1;
        }
        const total = d.deepLearning + d.education + d.growth + d.informational + d.lowValue + d.brainRot;
        return {
          period,
          deepLearning: d.deepLearning / daysInPeriod,
          education: d.education / daysInPeriod,
          growth: d.growth / daysInPeriod,
          informational: d.informational / daysInPeriod,
          lowValue: d.lowValue / daysInPeriod,
          brainRot: d.brainRot / daysInPeriod,
          totalHours: total / daysInPeriod,
        };
      });
    }),

  /** Calendar heatmap data: watch hours per day for a given year */
  getCalendarData: cookieProtectedProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          date: sql<string>`TO_CHAR(${localWatchedAt}, 'YYYY-MM-DD')`.as(
            "day",
          ),
          totalSeconds: sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds}), 0)`,
          videoCount: sql<number>`COUNT(*)`,
        })
        .from(ytWatchHistory)
        .where(
          sql`EXTRACT(YEAR FROM ${localWatchedAt}) = ${input.year}`,
        )
        .groupBy(
          sql`TO_CHAR(${localWatchedAt}, 'YYYY-MM-DD')`,
        )
        .orderBy(
          sql`TO_CHAR(${localWatchedAt}, 'YYYY-MM-DD')`,
        );

      return rows.map((r) => ({
        date: r.date,
        totalHours: Number(r.totalSeconds) / 3600 / PLAYBACK_SPEED,
        videoCount: Number(r.videoCount),
      }));
    }),

  /** Manual sync trigger — pass path to watch-history.json */
  triggerSync: protectedProcedure
    .input(z.object({ filePath: z.string() }))
    .mutation(async ({ input }) => {
      const result = await syncYouTube("manual", input.filePath);
      return result;
    }),

  /** Last sync status */
  getSyncStatus: cookieProtectedProcedure.query(async () => {
    return db.query.ytSyncMetadata.findFirst({
      orderBy: desc(ytSyncMetadata.syncStartedAt),
    });
  }),
});
