/**
 * Reading-time analytics computed from book lengths.
 *
 * Pure functions — no DB access — so the logic is unit-testable and
 * reusable by future UI.
 */

import type {
  DailyReadingDay,
  ReadingAnalytics,
  ReadingAnalyticsBucket,
} from "./types";

/** Audiobook playback speed — wall-clock hours = runtime / LISTENING_SPEED */
export const LISTENING_SPEED = 2.0;

/** Estimated reading pace for page-count-only books (already wall-clock) */
export const PAGES_PER_HOUR = 35;

export type AnalyticsRow = {
  started: Date | null;
  finished: Date | null;
  audioLengthMin: number | null;
  pageCount: number | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Truncate a date to its UTC day start (Notion dates are date-only) */
function utcDay(date: Date): number {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
}

/** ISO week bucket key: the Monday of the day's week, as YYYY-MM-DD */
function weekKey(dayMs: number): string {
  const dayOfWeek = new Date(dayMs).getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return new Date(dayMs - daysSinceMonday * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

function monthKey(dayMs: number): string {
  return new Date(dayMs).toISOString().slice(0, 7); // YYYY-MM
}

function yearKey(dayMs: number): string {
  return new Date(dayMs).toISOString().slice(0, 4); // YYYY
}

function round(hours: number): number {
  return Math.round(hours * 100) / 100;
}

/**
 * Compute reading-time analytics from finished books.
 *
 * - Estimated content hours: audio runtime when present, else
 *   pageCount / PAGES_PER_HOUR. Books with neither are excluded
 *   (reported via excludedCount).
 * - Wall-clock hours: audio runtime / LISTENING_SPEED; page-based
 *   estimates are already wall-clock.
 * - Hours are spread evenly per day across started → finished. Missing
 *   started (or started > finished) attributes everything to the finish
 *   date. Unfinished books contribute nothing.
 * - Bucket `books` counts finishes in that bucket.
 */
export function computeReadingAnalytics(
  rows: AnalyticsRow[],
): ReadingAnalytics {
  const weekly = new Map<string, ReadingAnalyticsBucket>();
  const monthly = new Map<string, ReadingAnalyticsBucket>();
  const yearly = new Map<string, ReadingAnalyticsBucket>();

  const totals = { books: 0, wallClockHours: 0, contentHours: 0, pages: 0 };
  let excludedCount = 0;

  const accumulate = (
    buckets: Map<string, ReadingAnalyticsBucket>,
    period: string,
    wallClockHours: number,
    contentHours: number,
    pages: number,
    finishes: number,
  ) => {
    const bucket = buckets.get(period) ?? {
      period,
      wallClockHours: 0,
      contentHours: 0,
      pages: 0,
      books: 0,
    };
    bucket.wallClockHours += wallClockHours;
    bucket.contentHours += contentHours;
    bucket.pages += pages;
    bucket.books += finishes;
    buckets.set(period, bucket);
  };

  for (const row of rows) {
    if (!row.finished) continue; // In-progress books contribute zero

    const contentHours =
      row.audioLengthMin != null
        ? row.audioLengthMin / 60
        : row.pageCount != null
          ? row.pageCount / PAGES_PER_HOUR
          : null;

    if (contentHours == null) {
      excludedCount++;
      continue;
    }

    const wallClockHours =
      row.audioLengthMin != null
        ? contentHours / LISTENING_SPEED
        : contentHours;

    const pages = row.pageCount ?? 0;

    const finishDay = utcDay(row.finished);
    const startDay =
      row.started && utcDay(row.started) <= finishDay
        ? utcDay(row.started)
        : finishDay;

    const spanDays = Math.round((finishDay - startDay) / MS_PER_DAY) + 1;
    const wallClockPerDay = wallClockHours / spanDays;
    const contentPerDay = contentHours / spanDays;
    const pagesPerDay = pages / spanDays;

    for (let day = startDay; day <= finishDay; day += MS_PER_DAY) {
      const finishes = day === finishDay ? 1 : 0;
      accumulate(weekly, weekKey(day), wallClockPerDay, contentPerDay, pagesPerDay, finishes);
      accumulate(monthly, monthKey(day), wallClockPerDay, contentPerDay, pagesPerDay, finishes);
      accumulate(yearly, yearKey(day), wallClockPerDay, contentPerDay, pagesPerDay, finishes);
    }

    totals.books++;
    totals.wallClockHours += wallClockHours;
    totals.contentHours += contentHours;
    totals.pages += pages;
  }

  const toSortedBuckets = (buckets: Map<string, ReadingAnalyticsBucket>) =>
    [...buckets.values()]
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((b) => ({
        ...b,
        wallClockHours: round(b.wallClockHours),
        contentHours: round(b.contentHours),
        pages: Math.round(b.pages),
      }));

  return {
    weekly: toSortedBuckets(weekly),
    monthly: toSortedBuckets(monthly),
    yearly: toSortedBuckets(yearly),
    totals: {
      books: totals.books,
      wallClockHours: round(totals.wallClockHours),
      contentHours: round(totals.contentHours),
      pages: Math.round(totals.pages),
    },
    excludedCount,
  };
}

/**
 * Per-day wall-clock reading hours for one year (heatmap data). Same spread
 * model as computeReadingAnalytics: hours distributed evenly across
 * started → finished, clipped to the requested year. Days with no reading
 * are omitted.
 */
export function computeDailyReading(
  rows: AnalyticsRow[],
  year: number,
): DailyReadingDay[] {
  const days = new Map<string, DailyReadingDay>();
  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year + 1, 0, 1); // exclusive

  for (const row of rows) {
    if (!row.finished) continue;

    const contentHours =
      row.audioLengthMin != null
        ? row.audioLengthMin / 60
        : row.pageCount != null
          ? row.pageCount / PAGES_PER_HOUR
          : null;
    if (contentHours == null) continue;

    const wallClockHours =
      row.audioLengthMin != null
        ? contentHours / LISTENING_SPEED
        : contentHours;

    const finishDay = utcDay(row.finished);
    const startDay =
      row.started && utcDay(row.started) <= finishDay
        ? utcDay(row.started)
        : finishDay;

    if (finishDay < yearStart || startDay >= yearEnd) continue;

    const spanDays = Math.round((finishDay - startDay) / MS_PER_DAY) + 1;
    const perDay = wallClockHours / spanDays;

    const from = Math.max(startDay, yearStart);
    const to = Math.min(finishDay, yearEnd - MS_PER_DAY);
    for (let day = from; day <= to; day += MS_PER_DAY) {
      const key = new Date(day).toISOString().slice(0, 10);
      const bucket = days.get(key) ?? {
        date: key,
        wallClockHours: 0,
        finishes: 0,
      };
      bucket.wallClockHours += perDay;
      bucket.finishes += day === finishDay ? 1 : 0;
      days.set(key, bucket);
    }
  }

  return [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...d, wallClockHours: round(d.wallClockHours) }));
}
