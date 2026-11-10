import { weekTableColors } from "./color-scale";
import { addDays, weekStartOf } from "./phases";
import type { WeightLog } from "./schema";
import { buildWeekTable, weeklyAverage } from "./week-table";
import type { SaveStatus } from "./weigh-ins";

/**
 * How the owner's week is going, for the Log Weight Shortcut's card and
 * notification line. Every number comes from the weekly table
 * (`buildWeekTable`), and every color from the editor's scales over the
 * whole phase (`weekTableColors`), so the card agrees with `/weight-log/edit`.
 */

/** A filled cell on the card, which is always light. */
export interface Fill {
  background: string;
  text: string;
}

export interface WeekDay {
  date: string;
  pounds: number | null;
  /** Kept on record but left out of the weekly average. */
  excluded: boolean;
  fill: Fill | null;
}

export interface WeekSummary {
  /** The day asked about, which the card marks as today. */
  date: string;
  /** The week's Monday. */
  week: string;
  /** The derived name of the phase holding the week, if any. */
  phase: string | null;
  /** Monday to Sunday. */
  days: WeekDay[];
  /** Weigh-ins that count toward the weekly average. */
  counted: number;
  /** The weekly average so far: the trimmed mean of the counted weigh-ins. */
  average: number | null;
  target: number | null;
  /** The average minus the target. */
  gapToTarget: number | null;
  /** The previous calendar week's average, in any phase. */
  lastWeek: number | null;
  /** The average minus last week's. */
  change: number | null;
  fills: {
    average: Fill | null;
    target: Fill | null;
    gapToTarget: Fill | null;
    change: Fill | null;
  };
}

/** The week holding `date`, with nothing in it when the log has no row. */
export function weekSummary(log: WeightLog, date: string): WeekSummary {
  const week = weekStartOf(date);
  const logWeek = log.weeks.find((item) => item.date === week);
  const rows = logWeek ? buildWeekTable(log, logWeek.phaseId) : [];
  const index = rows.findIndex((row) => row.week === week);
  const row = rows[index];
  const colors = row ? weekTableColors(rows)[index] : undefined;
  const phase =
    log.phases.find((item) => item.id === logWeek?.phaseId) ??
    // A week with no row yet still sits in the phase whose dates cover it.
    (logWeek
      ? undefined
      : log.phases.find((item) => item.start <= date && date <= item.end));
  const previous = log.weeks.find((item) => item.date === addDays(week, -7));

  const days = Array.from({ length: 7 }, (_, day) => {
    const pounds = row?.weights[day] ?? null;
    return {
      date: addDays(week, day),
      pounds,
      excluded: pounds !== null && !!row?.excludedDays.includes(day),
      fill: colors?.days[day]?.light ?? null,
    };
  });

  return {
    date,
    week,
    phase: phase?.label ?? null,
    days,
    counted: days.filter((day) => day.pounds !== null && !day.excluded).length,
    average: row?.average ?? null,
    target: row?.target ?? null,
    gapToTarget: row?.gapToTarget ?? null,
    lastWeek: previous ? weeklyAverage(previous) : null,
    change: row?.change ?? null,
    fills: {
      average: colors?.average?.light ?? null,
      target: colors?.target?.light ?? null,
      gapToTarget: colors?.gapToTarget?.light ?? null,
      change: colors?.change?.light ?? null,
    },
  };
}

/** Pounds to one decimal place, as the editor shows them. */
export function pounds(value: number) {
  return (Math.round(value * 10) / 10).toFixed(1);
}

/** A signed difference to one decimal place, such as +0.4 or −0.2. */
export function signed(value: number) {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0.0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}`;
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
      const gap = Math.round(summary.gapToTarget * 10) / 10;
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
