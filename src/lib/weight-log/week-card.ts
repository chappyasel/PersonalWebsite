import { type WeekRowColors, weekTableColors } from "./color-scale";
import { addDays, weekStartOf } from "./phases";
import type { WeightLog } from "./schema";
import { bareRow, phaseHolding, withWeeks } from "./sheet";
import {
  type WeekTableRow,
  buildWeekTable,
  weekNumber,
  weeklyAverage,
} from "./week-table";

/**
 * The Log Weight card's rows of the weekly table: up to five weeks before
 * the asked-about date's week, that week, and up to five after. Each row is
 * the one the editor's Weeks table shows for that week, with its colors
 * computed over the table that holds it, so a week in another phase gets
 * that phase's scales.
 */

/** How many weeks the card shows on each side of the date's week. */
export const WEEKS_BEFORE = 5;
export const WEEKS_AFTER = 5;

type Phase = WeightLog["phases"][number];

export interface WeekCardRow {
  row: WeekTableRow;
  colors: WeekRowColors;
  /** The `#` column: the week's number in its phase, or none outside one. */
  number: number | null;
  /** The phase whose table holds the row, or none outside every phase. */
  phase: Pick<Phase, "id" | "label" | "kind"> | null;
}

export interface WeekCard {
  /** The day asked about, which the card marks as today. */
  date: string;
  /** Oldest first. The date's week is always among them. */
  rows: WeekCardRow[];
}

/** The row of the week holding the card's date. */
export function currentRow(card: WeekCard): WeekCardRow {
  const monday = weekStartOf(card.date);
  return card.rows.find((item) => item.row.week === monday)!;
}

/** How many weeks the card's day grid shows, ending with the date's. */
export const GRID_WEEKS = 3;

/**
 * The day grid's rows, oldest first: the date's week and the two before
 * it, each where the card has a row for it, so the log's first weeks show
 * only the weeks it has.
 */
export function gridRows(card: WeekCard): WeekCardRow[] {
  const monday = weekStartOf(card.date);
  const first = addDays(monday, -7 * (GRID_WEEKS - 1));
  return card.rows.filter(
    (item) => item.row.week >= first && item.row.week <= monday,
  );
}

const EMPTY_WEEK = [null, null, null, null, null, null, null];

/**
 * `runningId` is the phase with no end date, which holds weeks past its
 * plan, as the editor's `phases` query reports it.
 */
export function weekCard(
  log: Pick<WeightLog, "phases" | "weeks">,
  date: string,
  runningId: string | null,
): WeekCard {
  const current = weekStartOf(date);
  const logged = new Map(log.weeks.map((week) => [week.date, week]));
  const first = log.weeks.reduce<string | null>(
    (earliest, week) =>
      earliest === null || week.date < earliest ? week.date : earliest,
    null,
  );

  // A week the log has is in its phase's table, or outside every phase when
  // the loader found none. A week it lacks joins the table of the phase that
  // holds it, as the editor adds this week before anything is in it.
  const phaseOf = (monday: string) => {
    const week = logged.get(monday);
    if (week) return log.phases.find((item) => item.id === week.phaseId);
    return phaseHolding(monday, log.phases, runningId);
  };
  // The row the editor builds for a week its table lacks.
  const bare = (monday: string) => {
    const week = logged.get(monday);
    const before = logged.get(addDays(monday, -7));
    return bareRow({
      week: monday,
      weights: week?.weights ?? EMPTY_WEEK,
      excludedDays: week
        ? week.weights.flatMap((weight, day) =>
            weight !== null && !week.averageDays.includes(day) ? [day] : [],
          )
        : [],
      previousAverage: before ? weeklyAverage(before) : null,
    });
  };

  // The date's week always shows. A week the log has shows. An earlier week
  // the log lacks shows while a phase holds it and the log has begun, so a
  // week without weigh-ins reads as one. A later week the log lacks is past
  // the plan, where the editor has no row for it.
  const shown = (monday: string) =>
    monday === current ||
    logged.has(monday) ||
    (monday < current &&
      first !== null &&
      monday >= first &&
      phaseOf(monday) !== undefined);
  const weeks = Array.from(
    { length: WEEKS_BEFORE + 1 + WEEKS_AFTER },
    (_, index) => addDays(current, (index - WEEKS_BEFORE) * 7),
  ).filter(shown);

  // Each phase's table, and outside every phase, a table of the one week:
  // the editor shows a week no phase holds on its own unless the owner has
  // also gone to another.
  const tables = new Map<
    string,
    { rows: WeekTableRow[]; colors: WeekRowColors[] }
  >();
  const tableOf = (monday: string, phase: Phase | undefined) => {
    const key = phase ? `phase:${phase.id}` : `outside:${monday}`;
    const cached = tables.get(key);
    if (cached) return cached;
    const rows = phase
      ? withWeeks(
          buildWeekTable(log, phase.id),
          weeks.filter((week) => phaseOf(week)?.id === phase.id).map(bare),
        )
      : [bare(monday)];
    const table = { rows, colors: weekTableColors(rows) };
    tables.set(key, table);
    return table;
  };

  return {
    date,
    rows: weeks.map((monday) => {
      const phase = phaseOf(monday);
      const { rows, colors } = tableOf(monday, phase);
      const index = rows.findIndex((row) => row.week === monday);
      return {
        row: rows[index]!,
        colors: colors[index]!,
        number: phase ? weekNumber(monday, phase.start) : null,
        phase: phase
          ? { id: phase.id, label: phase.label, kind: phase.kind }
          : null,
      };
    }),
  };
}
