import type { SeriesGroupBy } from "./series";

/** Viewer's local timezone. Day/week/month buckets are computed in this zone,
 *  not UTC — evening viewing (e.g. after 5pm Pacific) crosses UTC midnight and
 *  would otherwise spill onto the next calendar day, inflating it. */
export const DISPLAY_TIME_ZONE = "America/Los_Angeles";

/** A "watch day" runs 4am→4am local, so a late-night session (e.g. 1am) counts
 *  toward the day it started rather than rolling onto the next calendar date. */
export const DAY_BOUNDARY_HOUR = 4;

const DAY_MS = 86_400_000;

const wallClock = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** The local wall-clock reading of an instant, as if it were UTC. */
function wallClockMs(instant: Date): number {
  const parts = wallClock.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
}

/** `YYYY-MM-DD` → `YYYY-MM-DD` shifted by whole days. */
export function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** The watch-day an instant falls on: its local date, counting the hours
 *  before 4am toward the day before. Matches `watchDayFrame` in SQL. */
export function watchDayOf(instant: Date): string {
  return new Date(wallClockMs(instant) - DAY_BOUNDARY_HOUR * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

/** The instant a watch-day opens, which is also when the one before it closes:
 *  4am local on that date. 4am never falls inside a daylight-saving jump, so
 *  the instant is always unambiguous. */
export function watchDayOpensAt(day: string): Date {
  const wall = Date.parse(`${day}T00:00:00Z`) + DAY_BOUNDARY_HOUR * 3_600_000;
  // The zone's offset depends on the instant being solved for, so settle it
  // twice: the first guess can sit on the far side of a 2am transition.
  let instant = wall;
  for (let i = 0; i < 2; i++) {
    instant = wall - (wallClockMs(new Date(instant)) - instant);
  }
  return new Date(instant);
}

/** The period a watch-day buckets into, keyed by its first day. Matches
 *  Postgres `DATE_TRUNC`: weeks open on Monday, quarters in Jan/Apr/Jul/Oct. */
export function periodKeyOf(day: string, groupBy: SeriesGroupBy): string {
  if (groupBy === "day") return day;
  if (groupBy === "week") {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    return shiftDay(day, -((weekday + 6) % 7));
  }
  const [year, month] = day.split("-").map(Number) as [number, number];
  const first =
    groupBy === "month" ? month : Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${String(first).padStart(2, "0")}-01`;
}

/**
 * Where a view of the history opens and closes, measured from Coverage Through.
 *
 * Every bounded range ends on the last covered watch-day rather than on today,
 * so "last 30 days" means the last 30 days the data actually covers. Windows
 * that ended at now would quietly shrink as the export aged: the header would
 * compare 25 days of watching against a full prior 30, and the comparison
 * would drift with the export schedule instead of with what Chappy watched.
 */
export type CoverageWindow = {
  /** Last watch-day the ingested history covers from 4am to 4am, or null
   *  before any ingest. */
  lastCoveredDay: string | null;
  /** First watch-day of the range, or null for the full history. */
  firstDay: string | null;
  /** When the range opens, or null for the full history. */
  opensAt: Date | null;
  /** When the last covered watch-day ends. A bounded range stops here, so
   *  the Watch Events of a partly exported day stay out of it until the next
   *  export completes that day. */
  closesAt: Date;
};

export function coverageWindow({
  coverageThrough,
  now,
  days,
}: {
  /** Coverage Through, or null when nothing has been ingested. */
  coverageThrough: Date | null;
  /** Stands in for Coverage Through while nothing has been ingested. */
  now: Date;
  /** Whole watch-days in the range, or null for the full history. */
  days: number | null;
}): CoverageWindow {
  // The watch-day holding Coverage Through runs past it, so the export saw
  // only part of that day. It is not yet exported, like every day after it.
  const lastDay = shiftDay(watchDayOf(coverageThrough ?? now), -1);
  const firstDay = days === null ? null : shiftDay(lastDay, -(days - 1));
  return {
    lastCoveredDay: coverageThrough ? lastDay : null,
    firstDay,
    opensAt: firstDay === null ? null : watchDayOpensAt(firstDay),
    closesAt: watchDayOpensAt(shiftDay(lastDay, 1)),
  };
}

/** Window a chart should span, as period keys: where the selected range opens,
 *  and the last period the data can speak for. Either may be null (full
 *  history, or nothing ingested yet), in which case the series falls back to
 *  its own extent. */
export function seriesBounds(
  window: CoverageWindow,
  groupBy: SeriesGroupBy,
): { rangeStartKey: string | null; coverageKey: string | null } {
  return {
    rangeStartKey:
      window.firstDay === null ? null : periodKeyOf(window.firstDay, groupBy),
    coverageKey:
      window.lastCoveredDay === null
        ? null
        : periodKeyOf(window.lastCoveredDay, groupBy),
  };
}
