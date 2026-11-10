import { trimmedMean } from "./chart";
import { addDays, weekStartOf, weeksBetween } from "./phases";
import type { WeightLog } from "./schema";

/**
 * One row of the owner's weekly table (decision 23). The columns follow the
 * workbook's phase tabs: Average, + / -, Target, + / -, lb/wk, OG Target,
 * + / -. Values are unrounded; the page rounds them to one decimal.
 */
export interface WeekTableRow {
  /** The week's Monday. */
  week: string;
  /** Monday to Sunday, in pounds. */
  weights: (number | null)[];
  /** Days whose weigh-in is left out of the weekly average. */
  excludedDays: number[];
  /** The trimmed mean of the week's counted weigh-ins. */
  average: number | null;
  /** This week's average minus the previous calendar week's, in any phase. */
  change: number | null;
  target: number | null;
  /** The average minus the target, as the workbook's first + / - column. */
  gapToTarget: number | null;
  /** The target minus the previous week's target in the same phase. */
  poundsPerWeek: number | null;
  originalTarget: number | null;
  /** The target minus the original target, as the workbook's OG + / - column. */
  gapToOriginalTarget: number | null;
}

type Week = WeightLog["weeks"][number];

/** A week's weekly average: the trimmed mean of the days it counts. */
export function weeklyAverage(week: Pick<Week, "weights" | "averageDays">) {
  return trimmedMean(week.averageDays.map((day) => week.weights[day] ?? null));
}

const difference = (a: number | null, b: number | null) =>
  a === null || b === null ? null : a - b;

/**
 * The weekly table for one phase, in calendar order. Weigh-ins belong to the
 * phase that covers their date, so a week past the plan's end with weigh-ins
 * appears with no target.
 */
export function buildWeekTable(
  log: Pick<WeightLog, "weeks">,
  phaseId: string,
): WeekTableRow[] {
  const averages = new Map(
    log.weeks.map((week) => [week.date, weeklyAverage(week)]),
  );
  const weeks = log.weeks
    .filter((week) => week.phaseId === phaseId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const targets = new Map(weeks.map((week) => [week.date, week.target]));

  return weeks.map((week) => {
    const average = averages.get(week.date) ?? null;
    const previousWeek = addDays(week.date, -7);
    return {
      week: week.date,
      weights: week.weights,
      excludedDays: week.weights.flatMap((weight, day) =>
        weight !== null && !week.averageDays.includes(day) ? [day] : [],
      ),
      average,
      change: difference(average, averages.get(previousWeek) ?? null),
      target: week.target,
      gapToTarget: difference(average, week.target),
      poundsPerWeek: difference(week.target, targets.get(previousWeek) ?? null),
      originalTarget: week.originalTarget,
      gapToOriginalTarget: difference(week.target, week.originalTarget),
    };
  });
}

/** The running phase: the one that starts last, since phases never overlap. */
export function currentPhase<Phase extends { start: string }>(
  phases: readonly Phase[],
): Phase | undefined {
  return phases.reduce<Phase | undefined>(
    (latest, phase) => (!latest || phase.start > latest.start ? phase : latest),
    undefined,
  );
}

/**
 * A week's number within its phase, counting the phase's first week as 0, as
 * the owner's left-hand column in the weekly table.
 */
export function weekNumber(week: string, phaseStart: string) {
  return weeksBetween(weekStartOf(phaseStart), weekStartOf(week));
}
