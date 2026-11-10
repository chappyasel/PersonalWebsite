import { zonedDate } from "~/lib/booking/zones";

import { pounds } from "./format";
import { weekStartOf } from "./phases";
import { OWNER_TIME_ZONE } from "./records";
import type { WeightLog } from "./schema";
import { roundTenth } from "./sheet";
import { buildWeekTable } from "./week-table";
import type { SaveStatus } from "./weigh-ins";

/**
 * How the owner's week is going, for the Log Weight Shortcut's notification.
 * Every number comes from the weekly table (`buildWeekTable`), so the line
 * agrees with `/weight-log/edit`. The card draws the table's rows itself
 * (`week-card.ts`).
 */
export interface WeekSummary {
  /** The weekly average so far: the trimmed mean of the counted weigh-ins. */
  average: number | null;
  target: number | null;
  /** The average minus the target. */
  gapToTarget: number | null;
}

/** The week holding `date`, with nothing in it when the log has no row. */
export function weekSummary(log: WeightLog, date: string): WeekSummary {
  const week = weekStartOf(date);
  const logWeek = log.weeks.find((item) => item.date === week);
  const row = logWeek
    ? buildWeekTable(log, logWeek.phaseId).find((item) => item.week === week)
    : undefined;
  return {
    average: row?.average ?? null,
    target: row?.target ?? null,
    gapToTarget: row?.gapToTarget ?? null,
  };
}

/** "Mon, Nov 9" for a `YYYY-MM-DD` date. */
export function shortDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Today's date where the owner lives, which names the day in `question`. */
export const ownerToday = (now = new Date()) =>
  zonedDate(now.getTime(), OWNER_TIME_ZONE);

/** Shown when no weigh-in counts toward the week yet. */
export const NO_AVERAGE = "No average yet";
/** Shown when the save worked but the week could not be read. */
export const NO_WEEK = "Week unavailable";

/**
 * The week in one short line: "Avg 182.3 · 0.3 over target", or "Avg 182.3"
 * past the plan's end. It is never empty, because the first Log Weight
 * Shortcut treats an empty `summary` as a failed request.
 */
export function weekLine(summary: WeekSummary | null) {
  if (!summary) return NO_WEEK;
  if (summary.average === null) return NO_AVERAGE;
  const average = `Avg ${pounds(summary.average)}`;
  if (summary.gapToTarget === null) return average;
  const gap = roundTenth(summary.gapToTarget);
  if (gap === 0) return `${average} · on target`;
  return `${average} · ${pounds(Math.abs(gap))} ${gap > 0 ? "over" : "under"} target`;
}

/** Marks a weigh-in left out of the weekly average (decision 39). */
const EXCLUDED = " · excluded";

/**
 * What the notification says after a save. `title` is the outcome:
 * "✓ 221.0" saved, "↻ 221.0, was 220.0" replaced, "= 221.0" already saved,
 * and "Kept 220.0" when nothing was saved, each with " · excluded" when the
 * date's weigh-in is left out of the weekly average, since a replace keeps
 * the flag (decision 39). `summary` is the week (`weekLine`). On `exists`,
 * `question` is what the Shortcut asks before replacing. It says "Today"
 * only when the date is today in the owner's time zone; otherwise it names
 * the date, because the server can't know the phone's date.
 */
export function saveSummary(
  {
    status,
    date,
    pounds: sent,
    previous,
    excluded,
  }: {
    status: SaveStatus;
    date: string;
    pounds: number;
    previous: number | null;
    excluded: boolean;
  },
  summary: WeekSummary | null,
  today: string,
): { title: string; summary: string; question?: string } {
  const week = weekLine(summary);
  const before = previous === null ? "" : pounds(previous);
  const flag = excluded ? EXCLUDED : "";
  switch (status) {
    case "saved":
      return { title: `✓ ${pounds(sent)}${flag}`, summary: week };
    case "replaced":
      return {
        title: `↻ ${pounds(sent)}, was ${before}${flag}`,
        summary: week,
      };
    case "unchanged":
      return { title: `= ${pounds(sent)}${flag}`, summary: week };
    case "exists": {
      const day = date === today ? "Today" : shortDate(date);
      return {
        title: `Kept ${before}${flag}`,
        summary: week,
        question: excluded
          ? `${day} has ${before}, excluded. Replace with ${pounds(sent)}? It stays excluded.`
          : `${day} has ${before}. Replace with ${pounds(sent)}?`,
      };
    }
  }
}
