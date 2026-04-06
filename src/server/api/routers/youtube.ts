import { desc, sql } from "drizzle-orm";
import { z } from "zod";

import { env } from "~/env";
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
const PLAYBACK_SPEED = 2;

export const youtubeRouter = createTRPCRouter({
  /** Verify content password */
  verifyPassword: publicProcedure
    .input(z.object({ password: z.string() }))
    .mutation(({ input }) => {
      const valid = input.password === env.DAD_CONTENT_PASSWORD;
      return { valid };
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

  /** Watch time aggregated by week, month, or quarter — returns avg hrs/day */
  getWatchTimeOverTime: cookieProtectedProcedure
    .input(
      z.object({
        groupBy: z.enum(["week", "month", "quarter"]).default("week"),
      }),
    )
    .query(async ({ input }) => {
      const truncExpr =
        input.groupBy === "week"
          ? sql`DATE_TRUNC('week', ${ytWatchHistory.watchedAt})`
          : input.groupBy === "month"
            ? sql`DATE_TRUNC('month', ${ytWatchHistory.watchedAt})`
            : sql`DATE_TRUNC('quarter', ${ytWatchHistory.watchedAt})`;

      const rows = await db
        .select({
          period: sql<string>`TO_CHAR(${truncExpr}, 'YYYY-MM-DD')`.as(
            "period",
          ),
          totalSeconds: sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds}), 0)`,
          videoCount: sql<number>`COUNT(*)`,
        })
        .from(ytWatchHistory)
        .groupBy(sql`${truncExpr}`)
        .orderBy(sql`${truncExpr}`);

      return rows.map((r) => {
        const totalHours =
          Number(r.totalSeconds) / 3600 / PLAYBACK_SPEED;
        const periodStart = new Date(r.period + "T00:00:00Z");
        let daysInPeriod: number;
        if (input.groupBy === "week") {
          daysInPeriod = 7;
        } else if (input.groupBy === "month") {
          daysInPeriod = new Date(
            periodStart.getUTCFullYear(),
            periodStart.getUTCMonth() + 1,
            0,
          ).getDate();
        } else {
          // quarter: days from quarter start to quarter end
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
        return {
          period: r.period,
          avgHoursPerDay: totalHours / daysInPeriod,
          totalHours,
          videoCount: Number(r.videoCount),
        };
      });
    }),

  /** Top channels by total watch time */
  getTopChannels: cookieProtectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(15),
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
          videoCount: sql<number>`COUNT(*)`,
        })
        .from(ytWatchHistory)
        .groupBy(ytWatchHistory.channelName)
        .orderBy(
          sql`COALESCE(SUM(${ytWatchHistory.durationSeconds}), 0) DESC`,
        )
        .limit(input.limit);

      return rows.map((r) => ({
        channelName: r.channelName,
        totalHours: Number(r.totalSeconds) / 3600 / PLAYBACK_SPEED,
        videoCount: Number(r.videoCount),
      }));
    }),

  /** Calendar heatmap data: watch hours per day for a given year */
  getCalendarData: cookieProtectedProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          date: sql<string>`TO_CHAR(${ytWatchHistory.watchedAt}, 'YYYY-MM-DD')`.as(
            "day",
          ),
          totalSeconds: sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds}), 0)`,
          videoCount: sql<number>`COUNT(*)`,
        })
        .from(ytWatchHistory)
        .where(
          sql`EXTRACT(YEAR FROM ${ytWatchHistory.watchedAt}) = ${input.year}`,
        )
        .groupBy(
          sql`TO_CHAR(${ytWatchHistory.watchedAt}, 'YYYY-MM-DD')`,
        )
        .orderBy(
          sql`TO_CHAR(${ytWatchHistory.watchedAt}, 'YYYY-MM-DD')`,
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
