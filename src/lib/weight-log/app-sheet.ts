import { PHASE_COLORS } from "./chart";
import {
  type CellColor,
  type WeekRowColors,
  weekTableColors,
} from "./color-scale";
import { pounds, weekLabel } from "./format";
import { addDays, cycleNumbers, weekStartOf } from "./phases";
import type { WeightLog } from "./schema";
import { bareRow, dayEditable, phaseHolding, planEditable, withWeeks } from "./sheet";
import { type WeekCard, gridRows } from "./week-card";
import { SUMMARY_COLUMNS } from "./week-columns";
import {
  type WeekTableRow,
  buildWeekTable,
  currentPhase,
  weekNumber,
  weeklyAverage,
} from "./week-table";

/**
 * The Weeks table as the iOS app draws it (`ios/Chappy/WeightLog/`). The
 * server assembles what the web editor assembles in `WeekSheet.tsx`: which
 * phase shows, this week's row before it has data, the rows outside every
 * phase, each cell's text and workbook color, and which cells take an edit.
 * The app renders it and sends the same `weightLog.*` mutations, so the
 * formatting and color rules stay in this one codebase.
 */

export interface AppCell {
  /** What the cell reads, as the web table writes it ("—" when empty). */
  text: string;
  /** The raw value behind it, unrounded, or null. */
  value: number | null;
  color: CellColor | null;
}

export interface AppDay extends AppCell {
  date: string;
  /** Left out of the weekly average: drawn struck through, never filled. */
  excluded: boolean;
  isToday: boolean;
  /** Takes a weigh-in: on or before today. */
  editable: boolean;
}

export interface AppRow {
  week: string;
  /** The `#` column: the week's number in its phase, or none outside one. */
  number: number | null;
  /** The Week column's month over day, without a year: "Nov", "23". */
  month: string;
  day: string;
  /** "Nov 23", with the year when it isn't today's, for messages. */
  label: string;
  days: AppDay[];
  /** One per `SUMMARY_COLUMNS` entry, in order. */
  summary: AppCell[];
  /** The week's target and lbs/w take an edit. */
  planEditable: boolean;
}

export interface AppSection {
  /** "Outside every phase", or the phase's label. */
  title: string;
  phaseId: string | null;
  rows: AppRow[];
}

export interface AppSheet {
  today: string;
  /** The phase the table shows, or null before any phase exists. */
  phaseId: string | null;
  phases: {
    id: string;
    label: string;
    kind: string;
    start: string;
    end: string;
    cycle: number;
    color: string;
  }[];
  runningId: string | null;
  columns: { key: string; label: string; hint: string }[];
  /** The loose rows first, then the shown phase's table. */
  sections: AppSection[];
  /**
   * The latest counted weigh-in before today, which today's empty cell
   * starts from, as the web table and the Shortcut do.
   */
  carried: { date: string; pounds: number } | null;
}

const EMPTY_WEEK = [null, null, null, null, null, null, null];

/** A week's weigh-ins left out of its average, by day index. */
const excludedOf = (week: WeightLog["weeks"][number]) =>
  week.weights.flatMap((weight, day) =>
    weight !== null && !week.averageDays.includes(day) ? [day] : [],
  );

/** The row the web editor builds for a week its tables lack. */
function bareWeek(log: Pick<WeightLog, "weeks">, monday: string) {
  const week = log.weeks.find((item) => item.date === monday);
  const before = log.weeks.find((item) => item.date === addDays(monday, -7));
  return bareRow({
    week: monday,
    weights: week?.weights ?? EMPTY_WEEK,
    excludedDays: week ? excludedOf(week) : [],
    previousAverage: before ? weeklyAverage(before) : null,
  });
}

/** The latest weigh-in before `today` that counts toward its week. */
export function carriedWeighIn(
  log: Pick<WeightLog, "weeks">,
  today: string,
): { date: string; pounds: number } | null {
  let best: { date: string; pounds: number } | null = null;
  for (const week of log.weeks) {
    for (const day of week.averageDays) {
      const pounds = week.weights[day];
      const date = addDays(week.date, day);
      if (pounds === null || pounds === undefined || date >= today) continue;
      if (!best || date > best.date) best = { date, pounds };
    }
  }
  return best;
}

export function appRow(
  row: WeekTableRow,
  colors: WeekRowColors,
  number: number | null,
  today: string,
): AppRow {
  const [month = "", day = ""] = weekLabel(row.week, row.week, {
    year: false,
  }).split(" ");
  return {
    week: row.week,
    number,
    month,
    day,
    label: weekLabel(row.week, today),
    days: row.weights.map((weight, index) => {
      const date = addDays(row.week, index);
      return {
        date,
        text: weight === null ? "" : pounds(weight),
        value: weight,
        color: colors.days[index] ?? null,
        excluded: row.excludedDays.includes(index),
        isToday: date === today,
        editable: dayEditable(date, today),
      };
    }),
    summary: SUMMARY_COLUMNS.map((column) => ({
      text: column.format(row[column.key]),
      value: row[column.key],
      color: colors[column.key] ?? null,
    })),
    planEditable: planEditable(row),
  };
}

export function appSheet(
  log: Pick<WeightLog, "phases" | "weeks">,
  {
    today,
    phaseId,
    runningId,
  }: { today: string; phaseId: string | null; runningId: string | null },
): AppSheet {
  const cycles = cycleNumbers(log.phases);
  const currentWeek = weekStartOf(today);
  const todayPhase = phaseHolding(today, log.phases, runningId);
  const latest = currentPhase(log.phases) ?? null;
  const shownId = log.phases.some((phase) => phase.id === phaseId)
    ? phaseId
    : (todayPhase?.id ?? latest?.id ?? null);
  const shown = log.phases.find((phase) => phase.id === shownId) ?? null;

  const sections: AppSection[] = [];
  const currentHolder = phaseHolding(currentWeek, log.phases, runningId);
  const hasCurrent = log.weeks.some((week) => week.date === currentWeek);
  // This week shows before anything is in it: in the phase that holds it,
  // or on its own when no phase does.
  if (!currentHolder && !hasCurrent) {
    const rows = [bareWeek(log, currentWeek)];
    const colors = weekTableColors(rows);
    sections.push({
      title: "Outside every phase",
      phaseId: null,
      rows: rows.map((row, index) => appRow(row, colors[index]!, null, today)),
    });
  }
  if (shown) {
    const extras =
      currentHolder?.id === shown.id ? [bareWeek(log, currentWeek)] : [];
    const rows = withWeeks(buildWeekTable(log, shown.id), extras);
    const colors = weekTableColors(rows);
    sections.push({
      title: shown.label,
      phaseId: shown.id,
      rows: rows.map((row, index) =>
        appRow(row, colors[index]!, weekNumber(row.week, shown.start), today),
      ),
    });
  }

  return {
    today,
    phaseId: shownId,
    phases: [...log.phases].reverse().map((phase) => ({
      id: phase.id,
      label: phase.label,
      kind: phase.kind,
      start: phase.start,
      end: phase.end,
      cycle: cycles.get(phase.id) ?? 0,
      color: PHASE_COLORS[phase.kind],
    })),
    runningId,
    columns: SUMMARY_COLUMNS.map(({ key, label, hint }) => ({
      key,
      label,
      hint,
    })),
    sections,
    carried: carriedWeighIn(log, today),
  };
}

/** The Log Weight card's three weeks of days, as app rows. */
export function appCardRows(card: WeekCard): AppRow[] {
  return gridRows(card).map((item) =>
    appRow(item.row, item.colors, item.number, card.date),
  );
}
