import { pounds } from "./format";
import { roundTenth } from "./sheet";
import { addDays, weekStartOf } from "./phases";
import type { WeightLog } from "./schema";
import { buildWeekTable, weeklyAverage } from "./week-table";
import type { SaveStatus } from "./weigh-ins";

/**
 * How the owner's week is going, for the Log Weight Shortcut's notification
 * line. Every number comes from the weekly table (`buildWeekTable`), so the
 * line agrees with `/weight-log/edit`. The card draws the table's rows
 * itself (`week-card.ts`).
 */
export interface WeekSummary {
  /** Weigh-ins that count toward the weekly average. */
  counted: number;
  /** The weekly average so far: the trimmed mean of the counted weigh-ins. */
  average: number | null;
  target: number | null;
  /** The average minus the target. */
  gapToTarget: number | null;
  /** The previous calendar week's average, in any phase. */
  lastWeek: number | null;
}

/** The week holding `date`, with nothing in it when the log has no row. */
export function weekSummary(log: WeightLog, date: string): WeekSummary {
  const week = weekStartOf(date);
  const logWeek = log.weeks.find((item) => item.date === week);
  const row = logWeek
    ? buildWeekTable(log, logWeek.phaseId).find((item) => item.week === week)
    : undefined;
  const previous = log.weeks.find((item) => item.date === addDays(week, -7));
  return {
    counted: row
      ? row.weights.filter(
          (weight, day) => weight !== null && !row.excludedDays.includes(day),
        ).length
      : 0,
    average: row?.average ?? null,
    target: row?.target ?? null,
    gapToTarget: row?.gapToTarget ?? null,
    lastWeek: previous ? weeklyAverage(previous) : null,
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

/**
 * The week in one line: "Week avg 182.3 (3 of 7), target 182.0, 0.3 over.
 * Last week 181.6."
 */
export function weekLine(summary: WeekSummary) {
  const parts: string[] = [];
  if (summary.average === null) {
    parts.push("No weigh-ins count toward this week yet.");
  } else {
    const average = `Week avg ${pounds(summary.average)} (${summary.counted} of 7)`;
    if (summary.target === null || summary.gapToTarget === null) {
      parts.push(`${average}, no target this week.`);
    } else {
      const gap = roundTenth(summary.gapToTarget);
      const offBy =
        gap === 0
          ? "on target"
          : `${pounds(Math.abs(gap))} ${gap > 0 ? "over" : "under"}`;
      parts.push(`${average}, target ${pounds(summary.target)}, ${offBy}.`);
    }
  }
  if (summary.lastWeek !== null) {
    parts.push(`Last week ${pounds(summary.lastWeek)}.`);
  }
  return parts.join(" ");
}

/**
 * The notification line after a save: what happened, then the week, when
 * the week could be read. On `exists` nothing was saved, and `question` is
 * what the Shortcut asks before replacing. When the date's weigh-in is left
 * out of the weekly average, both say so, since a replace keeps the flag
 * (decision 39).
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
): { summary: string; question?: string } {
  const week = summary ? ` ${weekLine(summary)}` : "";
  const before = previous === null ? "" : pounds(previous);
  switch (status) {
    case "saved":
      return { summary: `${pounds(sent)} saved.${week}` };
    case "replaced":
      return {
        summary: `${pounds(sent)} saved, replacing ${before}.${excluded ? " It stays left out of the weekly average." : ""}${week}`,
      };
    case "unchanged":
      return {
        summary: `${pounds(sent)} was already saved.${excluded ? " It is left out of the weekly average." : ""}${week}`,
      };
    case "exists": {
      const kept = excluded
        ? `${before}, which is left out of the weekly average`
        : before;
      return {
        summary: `Kept ${kept}.${week}`,
        question: `${shortDate(date)} already has ${kept}. Replace it with ${pounds(sent)}?${excluded ? " The new value stays left out." : ""}`,
      };
    }
  }
}
