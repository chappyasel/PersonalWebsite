import { TRPCError } from "@trpc/server";
import { type SQL, desc, eq, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { z } from "zod";

import { CATEGORY_VALUES } from "~/lib/youtube/categories";
import { smoothInformationDietTrend } from "~/lib/youtube/dashboard";
import { type SeriesGroupBy, seriesPeriods } from "~/lib/youtube/series";
import { syncYouTube } from "~/lib/youtube/sync";
import {
  cookieProtectedProcedure,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  ytCalibrationMembers,
  ytManualOverrides,
  ytSyncMetadata,
  ytWatchHistory,
} from "~/server/db/schema";

import { env } from "~/env";

/** Average playback speed — divides raw duration to estimate actual watch time */
const PLAYBACK_SPEED = 2.2;

/** Viewer's local timezone. Day/week/month buckets are computed in this zone,
 *  not UTC — evening viewing (e.g. after 5pm Pacific) crosses UTC midnight and
 *  would otherwise spill onto the next calendar day, inflating it. */
const DISPLAY_TIME_ZONE = "America/Los_Angeles";

/** A "watch day" runs 4am→4am local, so a late-night session (e.g. 1am) counts
 *  toward the day it started rather than rolling onto the next calendar date. */
const DAY_BOUNDARY_HOUR = 4;

/** `watched_at` (a timestamptz, an absolute instant) rendered in the local
 *  "watch day" frame: local wall-clock time minus the 4am boundary, so
 *  DATE_TRUNC('day', …) yields the watch-day start date. Used for all calendar
 *  bucketing.
 *
 *  The timezone is inlined as a raw literal (not a bound parameter) on purpose:
 *  this fragment is reused in SELECT, WHERE, GROUP BY and ORDER BY, and Drizzle
 *  re-numbers a bound `${DISPLAY_TIME_ZONE}` parameter at each embed ($1, $2,
 *  …). Postgres then treats `watched_at AT TIME ZONE $1` and `… $2` as distinct
 *  expressions, so GROUP BY no longer matches SELECT and the query fails with
 *  "column watched_at must appear in the GROUP BY clause". A raw literal keeps
 *  the expression textually identical everywhere. Safe because the value is a
 *  hardcoded constant, never user input. */
const watchDayLocal = sql`((${ytWatchHistory.watchedAt} AT TIME ZONE ${sql.raw(`'${DISPLAY_TIME_ZONE}'`)}) - INTERVAL '${sql.raw(String(DAY_BOUNDARY_HOUR))} hours')`;

const timeRangeSchema = z
  .enum(["30d", "90d", "1y", "3y", "all"])
  .default("all");

type TimeRange = z.infer<typeof timeRangeSchema>;

/** Length of a bounded range in days; null for the full history. */
function rangeDays(range: TimeRange): number | null {
  if (range === "all") return null;
  return range === "30d"
    ? 30
    : range === "90d"
      ? 90
      : range === "1y"
        ? 365
        : 1095;
}

function timeRangeWhere(range: TimeRange) {
  const days = rangeDays(range);
  if (days === null) return sql`TRUE`;
  return sql`${ytWatchHistory.watchedAt} >= ${rangeStartInstant(days)}`;
}

/** Coverage Through: the instant the ingested history is complete to, which is
 *  when Google built the newest archive we have successfully ingested. A day
 *  between the last watch event and this instant was genuinely checked and
 *  found empty; a day after it simply has not been exported yet. Clamped up to
 *  the newest watch event, because an older archive cannot un-know a watch,
 *  and down to now. NULL until a sync has recorded an export time, in which
 *  case callers fall back to the last watch event. */
const coverageThroughExpr = sql`(
  SELECT CASE WHEN bound.through IS NULL THEN NULL ELSE LEAST(NOW(), bound.through) END
  FROM (
    SELECT GREATEST(
      (SELECT MAX(${ytSyncMetadata.exportCreatedAt}) FROM yt_sync_metadata WHERE status = 'success'),
      (SELECT MAX(watched_at) FROM yt_watch_events)
    ) AS through
  ) bound
)`;

/** Every bounded time range ends at Coverage Through rather than at now, so
 *  "last 30 days" means the last 30 days the data actually covers. Windows
 *  that ended at now would quietly shrink as the export aged: the header would
 *  compare 25 days of watching against a full prior 30, and the comparison
 *  would drift with the export schedule instead of with what Chappy watched. */
const coverageAnchor = sql`COALESCE(${coverageThroughExpr}, NOW())`;

/** Local watch-day frame for an instant: wall-clock time in the display zone,
 *  shifted back past the 4am boundary. */
function watchDayFrame(instant: SQL) {
  return sql`((${instant} AT TIME ZONE ${sql.raw(`'${DISPLAY_TIME_ZONE}'`)}) - INTERVAL '${sql.raw(String(DAY_BOUNDARY_HOUR))} hours')`;
}

/** Start of a window spanning `days` whole watch-days and ending on the
 *  Coverage Through day. Counting whole days rather than raw hours back from
 *  an instant is what makes "last 30 days" exactly thirty buckets on a chart,
 *  instead of thirty-one with a sliver of a day at the open end. */
function rangeStartInstant(days: number): SQL {
  return sql`((DATE_TRUNC('day', ${watchDayFrame(coverageAnchor)})
    - INTERVAL '${sql.raw(String(days - 1))} days'
    + INTERVAL '${sql.raw(String(DAY_BOUNDARY_HOUR))} hours')
    AT TIME ZONE ${sql.raw(`'${DISPLAY_TIME_ZONE}'`)})`;
}

/** Bucket an instant into a watch-day period key, using the same expression
 *  the aggregates group on so the keys line up exactly. */
function periodKeyExpr(instant: SQL, groupBy: SeriesGroupBy) {
  return sql`TO_CHAR(DATE_TRUNC(${sql.raw(`'${groupBy}'`)}, ${watchDayFrame(instant)}), 'YYYY-MM-DD')`;
}

/** Window a chart should span: where the selected range opens, and the last
 *  period the data can speak for. Either may be null (full history, or nothing
 *  ingested yet), in which case the series falls back to its own extent. */
async function seriesBounds(
  groupBy: SeriesGroupBy,
  days: number | null,
): Promise<{ rangeStartKey: string | null; coverageKey: string | null }> {
  const rangeStart =
    days === null ? sql`NULL::timestamptz` : rangeStartInstant(days);
  const rows = await db.execute(sql`
    SELECT ${periodKeyExpr(rangeStart, groupBy)} AS range_start_key,
           ${periodKeyExpr(coverageThroughExpr, groupBy)} AS coverage_key
  `);
  const row = rows[0];
  return {
    rangeStartKey: dbNullableString(row?.range_start_key),
    coverageKey: dbNullableString(row?.coverage_key),
  };
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

/** The runs whose judgments the dashboard shows. */
const activeRunsCte = sql`
  SELECT
    MAX(id) FILTER (WHERE dimension = 'learning_value') AS learning_run_id,
    MAX(id) FILTER (WHERE dimension = 'positivity') AS positivity_run_id
  FROM yt_classifier_runs
  WHERE status = 'active'
`;

/** Every join needed to hang a video's accepted scores off a watch event.
 *  Shared by the summary, the trend, and the percentiles so all three read the
 *  same numbers; a divergence here surfaces as a headline that contradicts the
 *  chart underneath it. Expects an `active_runs` CTE in scope and exposes the
 *  aliases `event`, `video`, `learning`, `positivity`, and the two overrides. */
const scoredEventJoins = sql`
  FROM yt_watch_events event
  JOIN yt_videos video ON video.video_id = event.video_id
  CROSS JOIN active_runs
  LEFT JOIN yt_classifications learning
    ON learning.video_id = video.video_id
    AND learning.run_id = active_runs.learning_run_id
    AND learning.status = 'scored'
  LEFT JOIN yt_classifications positivity
    ON positivity.video_id = video.video_id
    AND positivity.run_id = active_runs.positivity_run_id
    AND positivity.status = 'scored'
  LEFT JOIN yt_manual_overrides learning_override
    ON learning_override.video_id = video.video_id
    AND learning_override.dimension = 'learning_value'
  LEFT JOIN yt_manual_overrides positivity_override
    ON positivity_override.video_id = video.video_id
    AND positivity_override.dimension = 'positivity'
`;

const eventExposure = sql`GREATEST(COALESCE(video.duration_seconds, 0), 0)::double precision / ${PLAYBACK_SPEED}`;
const eventLearningScore = sql`COALESCE(learning_override.score, learning.score)`;
const eventPositivityScore = sql`COALESCE(positivity_override.score, positivity.score)`;

function dbNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  return null;
}

function dbString(value: unknown, fallback = ""): string {
  return dbNullableString(value) ?? fallback;
}

function assertDevelopmentOnly(): void {
  if (process.env.NODE_ENV === "production") {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
}

/** The window every header tile speaks for: the headline numbers, the
 *  sparklines, and the stretches the percentiles compare against are all this
 *  many days, so the three readings on a tile describe one period. */
const DIET_WINDOW_DAYS = 30;
/** Smoothing on the score sparklines, which also sets how much lead-in the
 *  series query needs so the leftmost point is a real seven-day average rather
 *  than a single day pretending to be one. */
const DIET_SMOOTHING_DAYS = 7;

export type DietSparklinePoint = {
  date: string;
  /** Watch hours on that day. Zero is a reading, not a gap. */
  hours: number;
  /** Trailing seven-day scores. Null while nothing scored falls in the window. */
  learningValue: number | null;
  positivity: number | null;
};

/**
 * The header's three sparklines. Watch hours are per day; the two scores are
 * trailing seven-day averages, because a daily score is undefined on every day
 * with no watching and a line full of holes reads as broken rather than quiet.
 * The query reaches back an extra six days so the leftmost smoothed point has a
 * full window behind it, then drops that lead-in.
 */
async function dailyDietSeries(): Promise<DietSparklinePoint[]> {
  const days = DIET_WINDOW_DAYS + DIET_SMOOTHING_DAYS - 1;
  const rows = await db.execute(sql`
    WITH active_runs AS (${activeRunsCte}), scored_events AS (
      SELECT
        DATE_TRUNC('day', ${watchDayFrame(sql`event.watched_at`)}) AS period,
        ${eventExposure} AS exposure,
        ${eventLearningScore} AS learning_score,
        ${eventPositivityScore} AS positivity_score
      ${scoredEventJoins}
      WHERE event.watched_at >= ${rangeStartInstant(days)}
    )
    SELECT
      TO_CHAR(period, 'YYYY-MM-DD') AS period,
      SUM(exposure) / 3600 AS hours,
      SUM(exposure * learning_score) FILTER (WHERE learning_score IS NOT NULL)
        / NULLIF(SUM(exposure) FILTER (WHERE learning_score IS NOT NULL), 0) AS learning_value,
      SUM(exposure) FILTER (WHERE learning_score IS NOT NULL)
        / NULLIF(SUM(exposure), 0) AS learning_coverage,
      SUM(exposure * positivity_score) FILTER (WHERE positivity_score IS NOT NULL)
        / NULLIF(SUM(exposure) FILTER (WHERE positivity_score IS NOT NULL), 0) AS positivity,
      SUM(exposure) FILTER (WHERE positivity_score IS NOT NULL)
        / NULLIF(SUM(exposure), 0) AS positivity_coverage
    FROM scored_events
    GROUP BY period
    ORDER BY period
  `);

  const byPeriod = new Map(rows.map((row) => [String(row.period), row]));
  const { rangeStartKey, coverageKey } = await seriesBounds("day", days);
  const periods = seriesPeriods({
    dataPeriods: rows.map((row) => String(row.period)),
    groupBy: "day",
    rangeStartKey,
    coverageKey,
  }).map((date) => {
    const row = byPeriod.get(date);
    return {
      date,
      estimatedExposureHours: Number(row?.hours ?? 0),
      learningValue:
        row?.learning_value == null ? null : Number(row.learning_value),
      learningCoverage:
        row?.learning_coverage == null ? null : Number(row.learning_coverage),
      positivity: row?.positivity == null ? null : Number(row.positivity),
      positivityCoverage:
        row?.positivity_coverage == null
          ? null
          : Number(row.positivity_coverage),
    };
  });

  const smoothed = smoothInformationDietTrend(periods, DIET_SMOOTHING_DAYS);
  return periods.slice(-DIET_WINDOW_DAYS).map((period, index) => {
    const smooth = smoothed[smoothed.length - DIET_WINDOW_DAYS + index];
    return {
      date: period.date,
      hours: period.estimatedExposureHours,
      learningValue: smooth?.learningValueSmoothed ?? null,
      positivity: smooth?.positivitySmoothed ?? null,
    };
  });
}

export type DietPercentiles = {
  /** Share of complete 30-day stretches in the whole history at or below the
   *  current one. Null when there is not enough history to compare against. */
  watchHours: number | null;
  learningValue: number | null;
  positivity: number | null;
  /** How many complete 30-day stretches the comparison drew on. */
  sampleSize: number;
};

/**
 * Where the current 30 days sit against every other 30-day stretch Chappy has
 * on record. The comparison rolls day by day, so consecutive stretches overlap
 * by 29 days and are heavily correlated; read a percentile as "this stretch
 * against all the others", not as a draw from independent samples.
 *
 * Cached because it walks the full daily history on every call, and the answer
 * can only move when a sync lands.
 */
export async function computeDietPercentiles(): Promise<DietPercentiles> {
  const rows = await db.execute(sql`
      WITH active_runs AS (${activeRunsCte}), scored_events AS (
        SELECT
          DATE_TRUNC('day', ${watchDayFrame(sql`event.watched_at`)}) AS day,
          ${eventExposure} AS exposure,
          ${eventLearningScore} AS learning_score,
          ${eventPositivityScore} AS positivity_score
        ${scoredEventJoins}
      ), daily AS (
        SELECT
          day,
          SUM(exposure) AS exposure,
          SUM(exposure) FILTER (WHERE learning_score IS NOT NULL) AS learning_exposure,
          SUM(exposure * learning_score) FILTER (WHERE learning_score IS NOT NULL) AS learning_weighted,
          SUM(exposure) FILTER (WHERE positivity_score IS NOT NULL) AS positivity_exposure,
          SUM(exposure * positivity_score) FILTER (WHERE positivity_score IS NOT NULL) AS positivity_weighted
        FROM scored_events
        GROUP BY day
      ), bounds AS (
        SELECT
          MIN(day) AS first_day,
          DATE_TRUNC('day', ${watchDayFrame(coverageAnchor)}) AS last_day
        FROM daily
      ), calendar AS (
        -- Dense days, so a rolling window spans 30 dates rather than 30 rows
        -- that happen to have watching in them.
        SELECT generate_series(first_day, last_day, INTERVAL '1 day') AS day
        FROM bounds
      ), dense AS (
        SELECT
          calendar.day,
          COALESCE(daily.exposure, 0) AS exposure,
          COALESCE(daily.learning_exposure, 0) AS learning_exposure,
          COALESCE(daily.learning_weighted, 0) AS learning_weighted,
          COALESCE(daily.positivity_exposure, 0) AS positivity_exposure,
          COALESCE(daily.positivity_weighted, 0) AS positivity_weighted
        FROM calendar
        LEFT JOIN daily ON daily.day = calendar.day
      ), rolling AS (
        SELECT
          day,
          ROW_NUMBER() OVER (ORDER BY day) AS n,
          SUM(exposure) OVER w / 3600 AS hours,
          SUM(learning_weighted) OVER w / NULLIF(SUM(learning_exposure) OVER w, 0) AS learning_value,
          SUM(positivity_weighted) OVER w / NULLIF(SUM(positivity_exposure) OVER w, 0) AS positivity
        FROM dense
        WINDOW w AS (ORDER BY day ROWS BETWEEN ${sql.raw(String(DIET_WINDOW_DAYS - 1))} PRECEDING AND CURRENT ROW)
      ), windows AS (
        SELECT * FROM rolling WHERE n >= ${DIET_WINDOW_DAYS}
      ), current AS (
        SELECT * FROM windows ORDER BY day DESC LIMIT 1
      )
      SELECT
        (SELECT COUNT(*) FROM windows) AS sample_size,
        (SELECT AVG((w.hours <= c.hours)::int)::double precision
           FROM windows w, current c) AS watch_hours,
        (SELECT AVG((w.learning_value <= c.learning_value)::int)::double precision
           FROM windows w, current c
          WHERE w.learning_value IS NOT NULL AND c.learning_value IS NOT NULL) AS learning_value,
        (SELECT AVG((w.positivity <= c.positivity)::int)::double precision
           FROM windows w, current c
          WHERE w.positivity IS NOT NULL AND c.positivity IS NOT NULL) AS positivity
    `);
  const row = rows[0];
  const asPercentile = (value: unknown) =>
    value == null ? null : Number(value);
  return {
    watchHours: asPercentile(row?.watch_hours),
    learningValue: asPercentile(row?.learning_value),
    positivity: asPercentile(row?.positivity),
    sampleSize: Number(row?.sample_size ?? 0),
  };
}

const getCachedDietPercentiles = unstable_cache(
  computeDietPercentiles,
  ["yt-diet-percentiles"],
  { revalidate: 900 },
);

/** Percentiles are context on a tile, never the tile itself. Outside a Next
 *  request there is no incremental cache to read, so fall through to the query;
 *  if that fails too the header renders without them rather than 500ing. */
async function dietPercentiles(): Promise<DietPercentiles> {
  for (const source of [getCachedDietPercentiles, computeDietPercentiles]) {
    try {
      return await source();
    } catch (error) {
      console.error("Diet percentiles unavailable, falling back:", error);
    }
  }
  return {
    watchHours: null,
    learningValue: null,
    positivity: null,
    sampleSize: 0,
  };
}

export const youtubeRouter = createTRPCRouter({
  /** Verify content password */
  verifyPassword: publicProcedure
    .input(z.object({ password: z.string() }))
    .mutation(({ input }) => {
      const valid = input.password === env.DAD_CONTENT_PASSWORD;
      return { valid };
    }),

  /** Canonical 30-day information-diet scores and independent coverage. */
  getInformationDietSummary: cookieProtectedProcedure.query(async () => {
    const rows = await db.execute(sql`
      WITH active_runs AS (${activeRunsCte}), scored_events AS (
        SELECT
          CASE WHEN event.watched_at >= ${rangeStartInstant(30)}
            THEN 'current' ELSE 'prior' END AS period,
          ${eventExposure} AS exposure,
          ${eventLearningScore} AS learning_score,
          ${eventPositivityScore} AS positivity_score
        ${scoredEventJoins}
        WHERE event.watched_at >= ${rangeStartInstant(60)}
      )
      SELECT
        period,
        SUM(exposure) AS exposure_seconds,
        SUM(exposure * learning_score) FILTER (WHERE learning_score IS NOT NULL)
          / NULLIF(SUM(exposure) FILTER (WHERE learning_score IS NOT NULL), 0) AS learning_value,
        SUM(exposure) FILTER (WHERE learning_score IS NOT NULL)
          / NULLIF(SUM(exposure), 0) AS learning_coverage,
        SUM(exposure * positivity_score) FILTER (WHERE positivity_score IS NOT NULL)
          / NULLIF(SUM(exposure) FILTER (WHERE positivity_score IS NOT NULL), 0) AS positivity,
        SUM(exposure) FILTER (WHERE positivity_score IS NOT NULL)
          / NULLIF(SUM(exposure), 0) AS positivity_coverage
      FROM scored_events
      GROUP BY period
    `);
    const result = {
      current: {
        exposureSeconds: 0,
        learningValue: null as number | null,
        learningCoverage: null as number | null,
        positivity: null as number | null,
        positivityCoverage: null as number | null,
      },
      prior: {
        exposureSeconds: 0,
        learningValue: null as number | null,
        learningCoverage: null as number | null,
        positivity: null as number | null,
        positivityCoverage: null as number | null,
      },
    };
    for (const row of rows) {
      const key = String(row.period) === "current" ? "current" : "prior";
      result[key] = {
        exposureSeconds: Number(row.exposure_seconds ?? 0),
        learningValue:
          row.learning_value === null ? null : Number(row.learning_value),
        learningCoverage:
          row.learning_coverage === null ? null : Number(row.learning_coverage),
        positivity: row.positivity === null ? null : Number(row.positivity),
        positivityCoverage:
          row.positivity_coverage === null
            ? null
            : Number(row.positivity_coverage),
      };
    }
    const [daily, percentiles] = await Promise.all([
      dailyDietSeries(),
      dietPercentiles(),
    ]);

    return {
      ...result,
      daily,
      percentiles,
      learningDelta:
        result.current.learningValue !== null &&
        result.prior.learningValue !== null
          ? result.current.learningValue - result.prior.learningValue
          : null,
      positivityDelta:
        result.current.positivity !== null && result.prior.positivity !== null
          ? result.current.positivity - result.prior.positivity
          : null,
    };
  }),

  /** Watch-time-first trend with independent Learning Value and Positivity. */
  getInformationDietTrend: cookieProtectedProcedure
    .input(
      z.object({
        groupBy: z.enum(["day", "week", "month", "quarter"]).default("week"),
        timeRange: timeRangeSchema,
      }),
    )
    .query(async ({ input }) => {
      const period =
        input.groupBy === "day"
          ? "day"
          : input.groupBy === "week"
            ? "week"
            : input.groupBy === "month"
              ? "month"
              : "quarter";
      const where =
        input.timeRange === "all"
          ? sql`TRUE`
          : sql`event.watched_at >= ${rangeStartInstant(rangeDays(input.timeRange)!)}`;
      const rows = await db.execute(sql`
        WITH active_runs AS (${activeRunsCte}), scored_events AS (
          SELECT
            DATE_TRUNC(${sql.raw(`'${period}'`)}, ${watchDayFrame(sql`event.watched_at`)}) AS period,
            ${eventExposure} AS exposure,
            ${eventLearningScore} AS learning_score,
            ${eventPositivityScore} AS positivity_score
          ${scoredEventJoins}
          WHERE ${where}
        )
        SELECT
          TO_CHAR(period, 'YYYY-MM-DD') AS period,
          SUM(exposure) / 3600 AS estimated_exposure_hours,
          COUNT(*) AS video_count,
          SUM(exposure * learning_score) FILTER (WHERE learning_score IS NOT NULL)
            / NULLIF(SUM(exposure) FILTER (WHERE learning_score IS NOT NULL), 0) AS learning_value,
          SUM(exposure) FILTER (WHERE learning_score IS NOT NULL)
            / NULLIF(SUM(exposure), 0) AS learning_coverage,
          SUM(exposure * positivity_score) FILTER (WHERE positivity_score IS NOT NULL)
            / NULLIF(SUM(exposure) FILTER (WHERE positivity_score IS NOT NULL), 0) AS positivity,
          SUM(exposure) FILTER (WHERE positivity_score IS NOT NULL)
            / NULLIF(SUM(exposure), 0) AS positivity_coverage
        FROM scored_events
        GROUP BY period
        ORDER BY period
      `);
      const trend = rows.map((row) => ({
        period: String(row.period),
        estimatedExposureHours: Number(row.estimated_exposure_hours),
        videoCount: Number(row.video_count),
        learningValue:
          row.learning_value === null ? null : Number(row.learning_value),
        learningCoverage:
          row.learning_coverage === null ? null : Number(row.learning_coverage),
        positivity: row.positivity === null ? null : Number(row.positivity),
        positivityCoverage:
          row.positivity_coverage === null
            ? null
            : Number(row.positivity_coverage),
      }));

      const { rangeStartKey, coverageKey } = await seriesBounds(
        input.groupBy,
        rangeDays(input.timeRange),
      );
      const byPeriod = new Map(trend.map((row) => [row.period, row]));
      return seriesPeriods({
        dataPeriods: trend.map((row) => row.period),
        groupBy: input.groupBy,
        rangeStartKey,
        coverageKey,
      }).map(
        (period) =>
          byPeriod.get(period) ?? {
            period,
            estimatedExposureHours: 0,
            videoCount: 0,
            learningValue: null,
            learningCoverage: null,
            positivity: null,
            positivityCoverage: null,
          },
      );
    }),

  /** Exposure-weighted channel aggregates, shared by the list and matrix. */
  getInformationDietChannels: cookieProtectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(500).default(100),
        timeRange: timeRangeSchema,
      }),
    )
    .query(async ({ input }) => {
      const where =
        input.timeRange === "all"
          ? sql`TRUE`
          : sql`event.watched_at >= NOW() - INTERVAL '${sql.raw(
              String(
                input.timeRange === "30d"
                  ? 30
                  : input.timeRange === "90d"
                    ? 90
                    : input.timeRange === "1y"
                      ? 365
                      : 1095,
              ),
            )} days'`;
      const rows = await db.execute(sql`
        WITH active_runs AS (
          SELECT
            MAX(id) FILTER (WHERE dimension = 'learning_value') AS learning_run_id,
            MAX(id) FILTER (WHERE dimension = 'positivity') AS positivity_run_id
          FROM yt_classifier_runs WHERE status = 'active'
        ), channel_events AS (
          SELECT
            channel.id AS channel_id,
            COALESCE(channel.name, 'Unknown') AS channel_name,
            channel.thumbnail_url,
            video.video_id,
            GREATEST(COALESCE(video.duration_seconds, 0), 0)::double precision / ${PLAYBACK_SPEED} AS exposure,
            COALESCE(learning_override.score, learning.score) AS learning_score,
            COALESCE(positivity_override.score, positivity.score) AS positivity_score
          FROM yt_watch_events event
          JOIN yt_videos video ON video.video_id = event.video_id
          LEFT JOIN yt_channels channel ON channel.id = video.channel_id
          CROSS JOIN active_runs
          LEFT JOIN yt_classifications learning
            ON learning.video_id = video.video_id
            AND learning.run_id = active_runs.learning_run_id
            AND learning.status = 'scored'
          LEFT JOIN yt_classifications positivity
            ON positivity.video_id = video.video_id
            AND positivity.run_id = active_runs.positivity_run_id
            AND positivity.status = 'scored'
          LEFT JOIN yt_manual_overrides learning_override
            ON learning_override.video_id = video.video_id
            AND learning_override.dimension = 'learning_value'
          LEFT JOIN yt_manual_overrides positivity_override
            ON positivity_override.video_id = video.video_id
            AND positivity_override.dimension = 'positivity'
          WHERE ${where}
        )
        SELECT
          channel_id,
          channel_name,
          thumbnail_url,
          SUM(exposure) / 3600 AS estimated_exposure_hours,
          COUNT(*) AS watch_events,
          COUNT(DISTINCT video_id) AS distinct_videos,
          SUM(exposure * learning_score) FILTER (WHERE learning_score IS NOT NULL)
            / NULLIF(SUM(exposure) FILTER (WHERE learning_score IS NOT NULL), 0) AS learning_value,
          SUM(exposure) FILTER (WHERE learning_score IS NOT NULL)
            / NULLIF(SUM(exposure), 0) AS learning_coverage,
          SUM(exposure * positivity_score) FILTER (WHERE positivity_score IS NOT NULL)
            / NULLIF(SUM(exposure) FILTER (WHERE positivity_score IS NOT NULL), 0) AS positivity,
          SUM(exposure) FILTER (WHERE positivity_score IS NOT NULL)
            / NULLIF(SUM(exposure), 0) AS positivity_coverage
        FROM channel_events
        GROUP BY channel_id, channel_name, thumbnail_url
        ORDER BY estimated_exposure_hours DESC
        LIMIT ${input.limit}
      `);
      return rows.map((row) => ({
        channelId:
          row.channel_id === null
            ? `unknown:${dbString(row.channel_name, "Unknown")}`
            : dbString(row.channel_id),
        channelName: dbString(row.channel_name, "Unknown"),
        thumbnailUrl: dbNullableString(row.thumbnail_url),
        estimatedExposureHours: Number(row.estimated_exposure_hours),
        watchEvents: Number(row.watch_events),
        distinctVideos: Number(row.distinct_videos),
        learningValue:
          row.learning_value === null ? null : Number(row.learning_value),
        learningCoverage:
          row.learning_coverage === null ? null : Number(row.learning_coverage),
        positivity: row.positivity === null ? null : Number(row.positivity),
        positivityCoverage:
          row.positivity_coverage === null
            ? null
            : Number(row.positivity_coverage),
      }));
    }),

  getChannelVideos: cookieProtectedProcedure
    .input(
      z.object({
        channelId: z.number().int().positive(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
    )
    .query(async ({ input }) => {
      const rows = await db.execute(sql`
        WITH active_runs AS (
          SELECT
            MAX(id) FILTER (WHERE dimension = 'learning_value') AS learning_run_id,
            MAX(id) FILTER (WHERE dimension = 'positivity') AS positivity_run_id
          FROM yt_classifier_runs WHERE status = 'active'
        )
        SELECT
          video.video_id,
          video.title,
          video.thumbnail_url,
          MAX(event.watched_at) AS watched_at,
          COALESCE(learning_override.score, learning.score) AS learning_value,
          COALESCE(positivity_override.score, positivity.score) AS positivity
        FROM yt_videos video
        JOIN yt_watch_events event ON event.video_id = video.video_id
        CROSS JOIN active_runs
        LEFT JOIN yt_classifications learning
          ON learning.video_id = video.video_id
          AND learning.run_id = active_runs.learning_run_id
          AND learning.status = 'scored'
        LEFT JOIN yt_classifications positivity
          ON positivity.video_id = video.video_id
          AND positivity.run_id = active_runs.positivity_run_id
          AND positivity.status = 'scored'
        LEFT JOIN yt_manual_overrides learning_override
          ON learning_override.video_id = video.video_id
          AND learning_override.dimension = 'learning_value'
        LEFT JOIN yt_manual_overrides positivity_override
          ON positivity_override.video_id = video.video_id
          AND positivity_override.dimension = 'positivity'
        WHERE video.channel_id = ${input.channelId}
        GROUP BY
          video.video_id, video.title, video.thumbnail_url,
          learning_override.score, learning.score,
          positivity_override.score, positivity.score
        ORDER BY watched_at DESC
        LIMIT ${input.limit}
      `);
      return rows.map((row) => ({
        videoId: dbString(row.video_id),
        title: dbString(row.title, "Unavailable video"),
        thumbnailUrl: dbNullableString(row.thumbnail_url),
        watchedAt: dbString(row.watched_at),
        learningValue:
          row.learning_value === null ? null : Number(row.learning_value),
        positivity: row.positivity === null ? null : Number(row.positivity),
      }));
    }),

  getCalibrationVideos: cookieProtectedProcedure.query(async () => {
    assertDevelopmentOnly();
    const rows = await db.execute(sql`
      WITH current_members AS (
        SELECT *
        FROM yt_calibration_members
        ORDER BY position DESC
        LIMIT 20
      )
      SELECT
        member.position,
        video.video_id,
        video.title,
        video.thumbnail_url,
        channel.name AS channel_name,
        MAX(event.watched_at) AS watched_at,
        learning_override.score AS learning_override,
        learning_override.updated_at AS learning_override_at,
        positivity_override.score AS positivity_override,
        positivity_override.updated_at AS positivity_override_at,
        learning.score AS learning_guess,
        learning.run_completed_at AS learning_run_at,
        positivity.score AS positivity_guess,
        positivity.run_completed_at AS positivity_run_at
      FROM current_members member
      JOIN yt_videos video ON video.video_id = member.video_id
      LEFT JOIN yt_channels channel ON channel.id = video.channel_id
      LEFT JOIN yt_watch_events event ON event.video_id = video.video_id
      LEFT JOIN yt_manual_overrides learning_override
        ON learning_override.video_id = video.video_id
        AND learning_override.dimension = 'learning_value'
      LEFT JOIN yt_manual_overrides positivity_override
        ON positivity_override.video_id = video.video_id
        AND positivity_override.dimension = 'positivity'
      LEFT JOIN LATERAL (
        SELECT classification.score, run.completed_at AS run_completed_at
        FROM yt_classifications classification
        JOIN yt_classifier_runs run ON run.id = classification.run_id
        WHERE classification.video_id = video.video_id
          AND run.dimension = 'learning_value'
          AND run.status IN ('complete', 'active')
        ORDER BY run.completed_at DESC NULLS LAST, run.id DESC
        LIMIT 1
      ) learning ON TRUE
      LEFT JOIN LATERAL (
        SELECT classification.score, run.completed_at AS run_completed_at
        FROM yt_classifications classification
        JOIN yt_classifier_runs run ON run.id = classification.run_id
        WHERE classification.video_id = video.video_id
          AND run.dimension = 'positivity'
          AND run.status IN ('complete', 'active')
        ORDER BY run.completed_at DESC NULLS LAST, run.id DESC
        LIMIT 1
      ) positivity ON TRUE
      GROUP BY
        member.position, video.video_id, video.title, video.thumbnail_url,
        channel.name, learning_override.score, learning_override.updated_at,
        positivity_override.score, positivity_override.updated_at,
        learning.score, learning.run_completed_at,
        positivity.score, positivity.run_completed_at
      ORDER BY member.position
    `);
    return rows.map((row) => {
      const valueForRound = (
        override: unknown,
        overrideAt: unknown,
        guess: unknown,
        runAt: unknown,
      ) => {
        if (override == null) return guess;
        if (guess == null || runAt == null) return override;
        const overrideTime = new Date(dbString(overrideAt)).getTime();
        const runTime = new Date(dbString(runAt)).getTime();
        return overrideTime >= runTime ? override : guess;
      };
      const learningValue = valueForRound(
        row.learning_override,
        row.learning_override_at,
        row.learning_guess,
        row.learning_run_at,
      );
      const positivity = valueForRound(
        row.positivity_override,
        row.positivity_override_at,
        row.positivity_guess,
        row.positivity_run_at,
      );
      return {
        position: Number(row.position),
        videoId: dbString(row.video_id),
        title: dbString(row.title, "Unavailable video"),
        thumbnailUrl: dbNullableString(row.thumbnail_url),
        channelName: dbString(row.channel_name, "Unknown"),
        watchedAt: dbString(row.watched_at),
        learningValue: learningValue == null ? null : Number(learningValue),
        positivity: positivity == null ? null : Number(positivity),
        learningEdited: row.learning_override !== null,
        positivityEdited: row.positivity_override !== null,
      };
    });
  }),

  saveCalibrationScore: cookieProtectedProcedure
    .input(
      z.object({
        videoId: z.string().min(1).max(20),
        dimension: z.enum(["learning_value", "positivity"]),
        score: z.number().int().min(0).max(10),
      }),
    )
    .mutation(async ({ input }) => {
      assertDevelopmentOnly();
      await db.transaction(async (tx) => {
        await tx
          .insert(ytManualOverrides)
          .values(input)
          .onConflictDoUpdate({
            target: [ytManualOverrides.videoId, ytManualOverrides.dimension],
            set: { score: input.score, updatedAt: new Date() },
          });
        const overrides = await tx.execute(sql`
          SELECT COUNT(DISTINCT dimension) AS count
          FROM yt_manual_overrides
          WHERE video_id = ${input.videoId}
        `);
        if (Number(overrides[0]?.count ?? 0) === 2) {
          await tx
            .update(ytCalibrationMembers)
            .set({ reviewedAt: new Date() })
            .where(sql`${ytCalibrationMembers.videoId} = ${input.videoId}`);
        }
      });
      return { saved: true };
    }),

  saveCalibrationScores: cookieProtectedProcedure
    .input(
      z.object({
        scores: z
          .array(
            z.object({
              videoId: z.string().min(1).max(20),
              learningValue: z.number().int().min(0).max(10).nullable(),
              positivity: z.number().int().min(0).max(10).nullable(),
            }),
          )
          .min(1)
          .max(200),
      }),
    )
    .mutation(async ({ input }) => {
      assertDevelopmentOnly();
      const overrides = input.scores.flatMap((score) => {
        const values: Array<{
          videoId: string;
          dimension: "learning_value" | "positivity";
          score: number;
        }> = [];
        if (score.learningValue !== null) {
          values.push({
            videoId: score.videoId,
            dimension: "learning_value",
            score: score.learningValue,
          });
        }
        if (score.positivity !== null) {
          values.push({
            videoId: score.videoId,
            dimension: "positivity",
            score: score.positivity,
          });
        }
        return values;
      });
      await db.transaction(async (tx) => {
        if (overrides.length > 0) {
          await tx
            .insert(ytManualOverrides)
            .values(overrides)
            .onConflictDoUpdate({
              target: [ytManualOverrides.videoId, ytManualOverrides.dimension],
              set: { score: sql`excluded.score`, updatedAt: new Date() },
            });
        }
        const reviewed = input.scores.filter(
          (score) => score.learningValue !== null && score.positivity !== null,
        );
        if (reviewed.length > 0) {
          await tx
            .update(ytCalibrationMembers)
            .set({ reviewedAt: new Date() })
            .where(
              sql`${ytCalibrationMembers.videoId} IN (${sql.join(
                reviewed.map((score) => sql`${score.videoId}`),
                sql`, `,
              )})`,
            );
        }
      });
      return { saved: input.scores.length };
    }),

  /** Quality score: productivity % for last 30d vs prior 30d */
  getQualityScore: cookieProtectedProcedure.query(async () => {
    const rows = await db
      .select({
        period:
          sql<string>`CASE WHEN ${ytWatchHistory.watchedAt} >= NOW() - INTERVAL '30 days' THEN 'current' ELSE 'prior' END`.as(
            "period",
          ),
        totalSeconds: sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds}), 0)`,
        productiveSeconds: sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds} * ${qualityScoreExpr}), 0)`,
      })
      .from(ytWatchHistory)
      .where(sql`${ytWatchHistory.watchedAt} >= NOW() - INTERVAL '60 days'`)
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
    const rows = await db.execute(sql`
      SELECT
        COUNT(*) AS event_count,
        COALESCE(SUM(GREATEST(COALESCE(video.duration_seconds, 0), 0)), 0)::double precision
          / ${PLAYBACK_SPEED} AS exposure_seconds,
        MIN(event.watched_at) AS earliest,
        MAX(event.watched_at) AS latest,
        COUNT(DISTINCT video.channel_id) AS channel_count
      FROM yt_watch_events event
      JOIN yt_videos video ON video.video_id = event.video_id
    `);
    const row = rows[0];
    return {
      totalVideos: Number(row?.event_count ?? 0),
      totalDurationSeconds: Number(row?.exposure_seconds ?? 0),
      totalEstimatedExposureSeconds: Number(row?.exposure_seconds ?? 0),
      earliestWatch: dbNullableString(row?.earliest),
      latestWatch: dbNullableString(row?.latest),
      uniqueChannels: Number(row?.channel_count ?? 0),
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
          ? sql`DATE_TRUNC('day', ${watchDayLocal})`
          : input.groupBy === "week"
            ? sql`DATE_TRUNC('week', ${watchDayLocal})`
            : input.groupBy === "month"
              ? sql`DATE_TRUNC('month', ${watchDayLocal})`
              : sql`DATE_TRUNC('quarter', ${watchDayLocal})`;

      const rows = await db
        .select({
          period: sql<string>`TO_CHAR(${truncExpr}, 'YYYY-MM-DD')`.as("period"),
          totalSeconds: sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds}), 0)`,
          productiveSeconds: sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds} * ${qualityScoreExpr}), 0)`,
          videoCount: sql<number>`COUNT(*)`,
        })
        .from(ytWatchHistory)
        .where(timeRangeWhere(input.timeRange))
        .groupBy(sql`${truncExpr}`)
        .orderBy(sql`${truncExpr}`);

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

      // Zero-fill every period in the window so empty stretches graph as 0
      // instead of the line jumping across them. Quality % is left null on
      // no-watch days (it's undefined when nothing was watched) and the line
      // connects across those gaps.
      const { rangeStartKey, coverageKey } = await seriesBounds(
        input.groupBy,
        rangeDays(input.timeRange),
      );
      const byPeriod = new Map(rows.map((r) => [r.period, r]));
      const periods = seriesPeriods({
        dataPeriods: rows.map((r) => r.period),
        groupBy: input.groupBy,
        rangeStartKey,
        coverageKey,
      });

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
        .orderBy(sql`COALESCE(SUM(${ytWatchHistory.durationSeconds}), 0) DESC`)
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
          ? sql`DATE_TRUNC('day', ${watchDayLocal})`
          : input.groupBy === "week"
            ? sql`DATE_TRUNC('week', ${watchDayLocal})`
            : input.groupBy === "month"
              ? sql`DATE_TRUNC('month', ${watchDayLocal})`
              : sql`DATE_TRUNC('quarter', ${watchDayLocal})`;

      const rowsWithScore = await db
        .select({
          period: sql<string>`TO_CHAR(${truncExpr}, 'YYYY-MM-DD')`.as("period"),
          score: sql<number>`COALESCE(${ytWatchHistory.llmQualityScore}, ${heuristicWeightCase})`,
          totalSeconds: sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds}), 0)`,
        })
        .from(ytWatchHistory)
        .where(timeRangeWhere(input.timeRange))
        .groupBy(
          sql`${truncExpr}`,
          ytWatchHistory.llmQualityScore,
          ytWatchHistory.categoryId,
        )
        .orderBy(sql`${truncExpr}`);

      type SubTiers = {
        deepLearning: number; // 0.75-1.0
        education: number; // 0.50-0.75
        growth: number; // 0.35-0.50
        informational: number; // 0.15-0.35
        lowValue: number; // 0.05-0.15
        brainRot: number; // 0.00-0.05
      };

      const periodMap = new Map<string, SubTiers>();

      for (const r of rowsWithScore) {
        if (!periodMap.has(r.period)) {
          periodMap.set(r.period, {
            deepLearning: 0,
            education: 0,
            growth: 0,
            informational: 0,
            lowValue: 0,
            brainRot: 0,
          });
        }
        const entry = periodMap.get(r.period)!;
        const hrs = Number(r.totalSeconds) / 3600 / PLAYBACK_SPEED;
        const score = Number(r.score);
        if (score >= 0.75) entry.deepLearning += hrs;
        else if (score >= 0.5) entry.education += hrs;
        else if (score >= 0.35) entry.growth += hrs;
        else if (score >= 0.15) entry.informational += hrs;
        else if (score >= 0.05) entry.lowValue += hrs;
        else entry.brainRot += hrs;
      }

      const { rangeStartKey, coverageKey } = await seriesBounds(
        input.groupBy,
        rangeDays(input.timeRange),
      );
      const emptyTiers: SubTiers = {
        deepLearning: 0,
        education: 0,
        growth: 0,
        informational: 0,
        lowValue: 0,
        brainRot: 0,
      };
      return seriesPeriods({
        dataPeriods: [...periodMap.keys()],
        groupBy: input.groupBy,
        rangeStartKey,
        coverageKey,
      }).map((period) => {
        const d = periodMap.get(period) ?? emptyTiers;
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
            Math.round((qEnd.getTime() - periodStart.getTime()) / 86400000) + 1;
        }
        const total =
          d.deepLearning +
          d.education +
          d.growth +
          d.informational +
          d.lowValue +
          d.brainRot;
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

  /** Calendar heatmap data: watch hours per day for a given year, plus the
   *  day the ingested history runs out — past it a blank cell means "not
   *  exported yet", not "watched nothing". */
  getCalendarData: cookieProtectedProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          date: sql<string>`TO_CHAR(${watchDayLocal}, 'YYYY-MM-DD')`.as("day"),
          totalSeconds: sql<number>`COALESCE(SUM(${ytWatchHistory.durationSeconds}), 0)`,
          videoCount: sql<number>`COUNT(*)`,
        })
        .from(ytWatchHistory)
        .where(sql`EXTRACT(YEAR FROM ${watchDayLocal}) = ${input.year}`)
        .groupBy(sql`TO_CHAR(${watchDayLocal}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${watchDayLocal}, 'YYYY-MM-DD')`);

      const { coverageKey } = await seriesBounds("day", null);
      return {
        days: rows.map((r) => ({
          date: r.date,
          totalHours: Number(r.totalSeconds) / 3600 / PLAYBACK_SPEED,
          videoCount: Number(r.videoCount),
        })),
        coveredThrough: coverageKey,
      };
    }),

  /** Manual sync trigger — pass path to watch-history.json */
  triggerSync: protectedProcedure
    .input(z.object({ filePath: z.string() }))
    .mutation(async ({ input }) => {
      const result = await syncYouTube("manual", input.filePath);
      return result;
    }),

  /** Freshness: the most recent sync attempt, the most recent success, and
   *  how far the ingested history actually reaches. */
  getSyncStatus: cookieProtectedProcedure.query(async () => {
    const latest = await db.query.ytSyncMetadata.findFirst({
      orderBy: desc(ytSyncMetadata.syncStartedAt),
    });
    const lastSuccess =
      latest?.status === "success"
        ? latest
        : ((await db.query.ytSyncMetadata.findFirst({
            where: eq(ytSyncMetadata.status, "success"),
            orderBy: desc(ytSyncMetadata.syncStartedAt),
          })) ?? null);

    // Read the boundary straight from the data rather than from the last
    // success, so a later sync of an older archive cannot walk it backwards.
    // ISO-formatted in SQL so new Date() parses it in every browser.
    const rows = await db.execute(sql`
      SELECT
        TO_CHAR(${coverageThroughExpr} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS covered_through,
        TO_CHAR(MAX(watched_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS latest_watch
      FROM yt_watch_events
    `);

    return {
      latest: latest ?? null,
      lastSuccess,
      ingestedAt: lastSuccess?.syncCompletedAt ?? null,
      exportCreatedAt: lastSuccess?.exportCreatedAt ?? null,
      sourceFile: lastSuccess?.sourceFile ?? null,
      coveredThrough: dbNullableString(rows[0]?.covered_through),
      latestWatchAt: dbNullableString(rows[0]?.latest_watch),
    };
  }),
});
