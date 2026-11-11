import { addDays } from "./phases";
import { MAX_POUNDS_PER_WEEK, MAX_TARGET, cleanTarget } from "./plan-edits";
import { type WeekTableRow, weeklyAverage } from "./week-table";

/**
 * The owner's Weeks table as a spreadsheet: which cells take a number, what a
 * typed number becomes, and how to undo it. The page calls the same
 * `api.weightLog.*` mutations the server already checks; this module only
 * decides what to send.
 */

/** The heaviest weigh-in the server takes, matching the table's check. */
export const MAX_WEIGH_IN = 1500;

/**
 * One editable cell: a day's weigh-in, or a week's target or lb/wk. A week's
 * target and lb/wk are two views of one plan edit (decision 11).
 */
export type SheetCell =
  | { kind: "day"; date: string }
  | { kind: "target"; week: string }
  | { kind: "rate"; week: string };

export const cellKey = (cell: SheetCell) =>
  cell.kind === "day" ? `day:${cell.date}` : `${cell.kind}:${cell.week}`;

/** What committing a cell sends, if anything. */
export type SheetEdit =
  | { type: "none" }
  | { type: "invalid"; message: string }
  | { type: "saveWeighIn"; date: string; pounds: number }
  | { type: "deleteWeighIn"; date: string }
  | { type: "changeRate"; week: string; poundsPerWeek: number };

const NONE: SheetEdit = { type: "none" };

export const roundTenth = (value: number) => Math.round(value * 10) / 10;
export const roundHundredth = (value: number) => Math.round(value * 100) / 100;

/**
 * A typed number. Accepts a comma for the decimal point and the minus sign
 * the table prints, and nothing else: "1e2" and "12abc" are not pounds.
 */
export function readNumber(text: string): number | "empty" | "invalid" {
  const cleaned = text.trim().replace(/−/g, "-").replace(",", ".");
  if (cleaned === "") return "empty";
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return "invalid";
  return Number(cleaned);
}

/**
 * A day cell. An emptied cell deletes the day's weigh-in, and a number saves
 * or replaces it to one decimal place, as the server rounds it.
 */
export function weighInEdit(
  date: string,
  text: string,
  current: number | null,
): SheetEdit {
  const value = readNumber(text);
  if (value === "empty") {
    return current === null ? NONE : { type: "deleteWeighIn", date };
  }
  if (value === "invalid") {
    return { type: "invalid", message: "Type a weight in pounds." };
  }
  const pounds = roundTenth(value);
  if (!(pounds > 0 && pounds <= MAX_WEIGH_IN)) {
    return {
      type: "invalid",
      message: `A weigh-in has to be above 0 and at most ${MAX_WEIGH_IN.toLocaleString("en-US")} lb.`,
    };
  }
  if (pounds === current) return NONE;
  return { type: "saveWeighIn", date, pounds };
}

/**
 * A target cell. lb/wk is a week's target minus the previous week's, so a
 * new target is the rate change that reaches it, and every later target in
 * the phase moves with it, as a rate edit does. The rate keeps the six
 * decimals the server keeps targets with, so the saved target is the typed
 * one even when the previous target has more decimals than the page shows.
 */
export function targetEdit(
  week: string,
  text: string,
  current: number,
  previous: number,
): SheetEdit {
  const value = readNumber(text);
  if (value === "empty") return NONE;
  if (value === "invalid") {
    return { type: "invalid", message: "Type a target in pounds." };
  }
  const target = roundTenth(value);
  if (!(target > 0 && target <= MAX_TARGET)) {
    return {
      type: "invalid",
      message: `Targets have to stay above 0 and at most ${MAX_TARGET.toLocaleString("en-US")} lb.`,
    };
  }
  if (target === roundTenth(current)) return NONE;
  const poundsPerWeek = cleanTarget(target - previous);
  if (Math.abs(poundsPerWeek) > MAX_POUNDS_PER_WEEK) {
    return {
      type: "invalid",
      message: `A target can be at most ${MAX_POUNDS_PER_WEEK} lb from the week before.`,
    };
  }
  return { type: "changeRate", week, poundsPerWeek };
}

/** An lbs/w cell, in pounds to two decimals, as the server rounds it. */
export function rateEdit(
  week: string,
  text: string,
  current: number,
): SheetEdit {
  const value = readNumber(text);
  if (value === "empty") return NONE;
  if (value === "invalid") {
    return { type: "invalid", message: "Type a rate in pounds per week." };
  }
  if (Math.abs(value) > MAX_POUNDS_PER_WEEK) {
    return {
      type: "invalid",
      message: `Keep the rate within ${MAX_POUNDS_PER_WEEK} lbs/w either way.`,
    };
  }
  const poundsPerWeek = roundHundredth(value);
  if (poundsPerWeek === roundHundredth(current)) return NONE;
  return { type: "changeRate", week, poundsPerWeek };
}

/** A change the status line can undo. One level is kept. */
export type SheetChange =
  | {
      kind: "weighIn";
      date: string;
      /** Null when the day had no weigh-in. */
      before: number | null;
      /** Null when the change deleted it. */
      after: number | null;
      /** Whether the day's weigh-in was left out of the weekly average. */
      excluded: boolean;
    }
  | {
      kind: "rate";
      phaseId: string;
      week: string;
      before: number;
      after: number;
    };

export type UndoRequest =
  | { mutation: "upsertWeighIn"; input: { date: string; pounds: number } }
  | { mutation: "deleteWeighIn"; input: { date: string } }
  | {
      mutation: "restoreWeighIn";
      input: { date: string; pounds: number; excluded: boolean };
    }
  | {
      mutation: "changeRate";
      input: { phaseId: string; weekStart: string; poundsPerWeek: number };
    };

/**
 * The request that puts a change back. A new weigh-in goes, a replaced one
 * gets its old pounds (its excluded flag never changed), and a deleted one
 * comes back with its pounds and its flag. A rate change sets the week's old
 * rate exactly, which moves its target and every later one back by the same
 * amount.
 */
export function undoOf(change: SheetChange): UndoRequest {
  if (change.kind === "rate") {
    return {
      mutation: "changeRate",
      input: {
        phaseId: change.phaseId,
        weekStart: change.week,
        poundsPerWeek: cleanTarget(change.before),
      },
    };
  }
  if (change.before === null) {
    return { mutation: "deleteWeighIn", input: { date: change.date } };
  }
  if (change.after === null) {
    return {
      mutation: "restoreWeighIn",
      input: {
        date: change.date,
        pounds: change.before,
        excluded: change.excluded,
      },
    };
  }
  return {
    mutation: "upsertWeighIn",
    input: { date: change.date, pounds: change.before },
  };
}

/**
 * A day takes a weigh-in up to today on the device's clock. The server takes
 * tomorrow by its UTC clock, but the old form stopped at today, and so does
 * the table.
 */
export const dayEditable = (date: string, today: string) => date <= today;

/**
 * A week's target and lb/wk can change when it has a target and the week
 * before it in the same phase has one too: that is the only rate
 * `planRateChange` can set. A phase's first week has no lb/wk, so its target
 * stays read-only.
 */
export const planEditable = (
  row: Pick<WeekTableRow, "target" | "poundsPerWeek">,
) => row.target !== null && row.poundsPerWeek !== null;

/** Every editable cell in reading order, for Tab and Shift+Tab. */
export function editableCells(
  rows: readonly WeekTableRow[],
  today: string,
  { plan = true }: { plan?: boolean } = {},
): SheetCell[] {
  return rows.flatMap((row) => {
    const cells: SheetCell[] = [];
    for (let day = 0; day < 7; day++) {
      const date = addDays(row.week, day);
      if (dayEditable(date, today)) cells.push({ kind: "day", date });
    }
    if (plan && planEditable(row)) {
      cells.push({ kind: "target", week: row.week });
      cells.push({ kind: "rate", week: row.week });
    }
    return cells;
  });
}

/**
 * The phase that holds a date, by the loader's rule: the latest phase that
 * starts on or before it and either runs past it or is still running. A
 * running phase holds weigh-ins past its plan's last week.
 */
export function phaseHolding<
  Phase extends { id: string; start: string; end: string },
>(
  date: string,
  phases: readonly Phase[],
  runningId: string | null,
): Phase | undefined {
  return [...phases]
    .filter(
      (phase) =>
        phase.start <= date && (phase.id === runningId || date <= phase.end),
    )
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
    .at(-1);
}

/**
 * A table row for a week the phase's table lacks: one with no plan and no
 * weigh-ins yet, or one outside every phase. Only the days, the average,
 * and the change from the previous calendar week's average have values,
 * as `buildWeekTable` gives them.
 */
export function bareRow(week: {
  week: string;
  weights: readonly (number | null)[];
  excludedDays: readonly number[];
  previousAverage: number | null;
}): WeekTableRow {
  const weights = [...week.weights];
  const average = weeklyAverage({
    weights,
    averageDays: [0, 1, 2, 3, 4, 5, 6].filter(
      (day) => !week.excludedDays.includes(day),
    ),
  });
  return {
    week: week.week,
    weights,
    excludedDays: [...week.excludedDays],
    average,
    change:
      average === null || week.previousAverage === null
        ? null
        : average - week.previousAverage,
    target: null,
    gapToTarget: null,
    poundsPerWeek: null,
    originalTarget: null,
    gapToOriginalTarget: null,
  };
}

/** The rows with each extra week added in calendar order, unless present. */
export function withWeeks(
  rows: readonly WeekTableRow[],
  extras: readonly WeekTableRow[],
): WeekTableRow[] {
  const merged = [...rows];
  for (const extra of extras) {
    if (!merged.some((row) => row.week === extra.week)) merged.push(extra);
  }
  return merged.sort((a, b) =>
    a.week < b.week ? -1 : a.week > b.week ? 1 : 0,
  );
}
