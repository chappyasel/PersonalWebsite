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
 * The Log Weight card's two rows of the weekly table: the previous calendar
 * week and the week holding the asked-about date. Each row is the one the
 * editor's Weeks table shows for that week, with its colors computed over
 * the table that holds it, so a week in another phase gets that phase's
 * scales.
 */

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
  /** The previous week first, when it has a row, then the date's week. */
  rows: WeekCardRow[];
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
  const previous = addDays(current, -7);
  const logged = new Map(log.weeks.map((week) => [week.date, week]));

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

  const weeks = [
    ...(logged.has(previous) || phaseOf(previous) ? [previous] : []),
    current,
  ];
  const tables = new Map<
    string | null,
    { rows: WeekTableRow[]; colors: WeekRowColors[] }
  >();
  const tableOf = (phase: Phase | undefined) => {
    const id = phase?.id ?? null;
    const cached = tables.get(id);
    if (cached) return cached;
    const extras = weeks
      .filter((monday) => (phaseOf(monday)?.id ?? null) === id)
      .map(bare);
    // Outside every phase, the editor's table holds only the weeks it was
    // asked for.
    const rows = phase
      ? withWeeks(buildWeekTable(log, phase.id), extras)
      : extras;
    const table = { rows, colors: weekTableColors(rows) };
    tables.set(id, table);
    return table;
  };

  return {
    date,
    rows: weeks.map((monday) => {
      const phase = phaseOf(monday);
      const { rows, colors } = tableOf(phase);
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
