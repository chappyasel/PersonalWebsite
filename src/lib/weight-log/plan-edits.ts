import { type PhaseKind, addDays } from "./phases";

/**
 * Plan edits for the owner's page (decisions 8 to 12 of
 * docs/plans/weight-log-migration.md). Each planner reads the current phases
 * and planned weeks and returns the rows to change. It never touches
 * weigh-ins. The router applies the result in one transaction.
 */

export interface PlanPhase {
  id: number;
  kind: PhaseKind;
  startDate: string;
  /** Null while the phase is running. */
  endDate: string | null;
}

export interface PlanWeek {
  weekStart: string;
  phaseId: number;
  target: number | null;
  originalTarget: number | null;
}

export interface PlanState {
  phases: readonly PlanPhase[];
  weeks: readonly PlanWeek[];
  /** Mondays of the weeks that hold at least one weigh-in. */
  weighInWeeks: ReadonlySet<string>;
}

/** A planned week to write. A null `phaseId` means the phase this edit starts. */
export type WrittenWeek = Omit<PlanWeek, "phaseId"> & {
  phaseId: number | null;
};

/**
 * The rows one edit changes, in the order the router writes them: planned
 * weeks out, phases out, phase ends, the new phase, then planned weeks in.
 * Written weeks replace any row already on their Monday.
 */
export interface PlanEdit {
  deleteWeeks: string[];
  deletePhases: number[];
  endPhases: { id: number; endDate: string }[];
  newPhase: { kind: PhaseKind; startDate: string } | null;
  writeWeeks: WrittenWeek[];
}

export type PlanEditErrorCode = "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT";

/** A refused edit. Messages name dates, never weights. */
export class PlanEditError extends Error {
  constructor(
    message: string,
    readonly code: PlanEditErrorCode = "BAD_REQUEST",
  ) {
    super(message);
    this.name = "PlanEditError";
  }
}

/**
 * The transaction-scoped advisory lock every plan and set point edit takes
 * first, so they run one at a time. A real import takes it before its table
 * lock, so an import and an edit never hold locks the other waits for.
 */
export const PLAN_LOCK = 0x574c50;

/** The longest plan the page writes, about three years. */
export const MAX_PLAN_WEEKS = 156;
/** The largest weekly change a plan may ask for, in pounds. */
export const MAX_POUNDS_PER_WEEK = 10;
/** The heaviest target a plan may hold, matching the weigh-in table's check. */
export const MAX_TARGET = 1500;

const EMPTY_EDIT: PlanEdit = {
  deleteWeeks: [],
  deletePhases: [],
  endPhases: [],
  newPhase: null,
  writeWeeks: [],
};

export const isMonday = (date: string) =>
  new Date(`${date}T00:00:00Z`).getUTCDay() === 1;

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Whole weeks from one Monday to another. */
export const weeksBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    (7 * 86_400_000));

/**
 * Targets are sums of rates, so they collect floating-point noise such as
 * 100.30000000000001. Six decimals removes it and stays far below the one
 * decimal the page shows.
 */
export const cleanTarget = (value: number) =>
  Math.round(value * 1_000_000) / 1_000_000;

const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function checkTarget(target: number) {
  if (!(target > 0 && target <= MAX_TARGET)) {
    throw new PlanEditError(
      `Targets have to stay above 0 and at most ${MAX_TARGET.toLocaleString("en-US")} lb.`,
    );
  }
}

function checkMonday(date: string, field: string) {
  if (!isMonday(date)) {
    throw new PlanEditError(`The ${field} has to be a Monday.`);
  }
}

/** The running phase, or the latest one: the phase a new one follows. */
export function latestPhase(phases: readonly PlanPhase[]) {
  return [...phases].sort((a, b) => byString(a.startDate, b.startDate)).at(-1);
}

function weeksOf(state: PlanState, phaseId: number) {
  return state.weeks
    .filter((week) => week.phaseId === phaseId)
    .sort((a, b) => byString(a.weekStart, b.weekStart));
}

export interface StartPhaseInput {
  kind: PhaseKind;
  startDate: string;
  /** The first week's target. */
  startTarget: number;
  poundsPerWeek: number;
  /** The Monday of the plan's last week. */
  lastWeek: string;
  /**
   * The phase the page showed as current, or null for none. A different
   * current phase on the server means the page is stale, and the edit stops.
   */
  currentPhaseId: number | null;
}

/**
 * Start a phase (decisions 8, 9, and 12).
 *
 * The current phase ends the day before the new start. Its planned weeks
 * before the new start stay as they are. Every planned week on or after the
 * new start leaves the old phase, whether or not it holds weigh-ins: the
 * weeks the new plan covers are rewritten with the new plan's target, and an
 * empty week past the new plan is deleted (decision 9). A moved week's
 * original target becomes the new plan's target, because the new phase began
 * and an original target belongs to the phase that wrote it (decision 12).
 *
 * The new plan has to run through every week on or after its start that
 * holds weigh-ins, so no planned week with a weigh-in is ever dropped.
 * Starting on the current phase's own Monday replaces that phase.
 */
export function planStartPhase(
  state: PlanState,
  input: StartPhaseInput,
): PlanEdit {
  const { kind, startDate, lastWeek, startTarget, poundsPerWeek } = input;
  checkMonday(startDate, "start");
  checkMonday(lastWeek, "last week");
  if (lastWeek < startDate) {
    throw new PlanEditError("The last week can't come before the start.");
  }
  const count = weeksBetween(startDate, lastWeek) + 1;
  if (count > MAX_PLAN_WEEKS) {
    throw new PlanEditError(
      `A plan can run at most ${MAX_PLAN_WEEKS} weeks.`,
    );
  }

  const current = latestPhase(state.phases);
  if ((current?.id ?? null) !== input.currentPhaseId) {
    throw new PlanEditError(
      "The current phase changed since the page loaded. Reload and try again.",
      "CONFLICT",
    );
  }
  if (current && startDate < current.startDate) {
    throw new PlanEditError(
      `A new phase can't start before the current one, which began ${shortDate(current.startDate)}.`,
    );
  }

  const written: WrittenWeek[] = Array.from({ length: count }, (_, index) => {
    const target = cleanTarget(startTarget + index * poundsPerWeek);
    checkTarget(target);
    return {
      weekStart: addDays(startDate, index * 7),
      phaseId: null,
      target,
      originalTarget: target,
    };
  });

  // Every planned week on or after the start leaves its phase. Phases never
  // overlap, so these are the current phase's, but the rule holds for any.
  const displaced = state.weeks.filter((week) => week.weekStart >= startDate);
  const pastPlan = displaced
    .filter((week) => week.weekStart > lastWeek)
    .sort((a, b) => byString(a.weekStart, b.weekStart));
  const keptWeighIns = [...state.weighInWeeks]
    .filter((week) => week >= startDate && week > lastWeek)
    .sort(byString);
  const lastWeighIn = keptWeighIns.at(-1);
  if (lastWeighIn) {
    throw new PlanEditError(
      `The plan has to run through the week of ${shortDate(lastWeighIn)}, which has weigh-ins.`,
    );
  }

  const edit: PlanEdit = {
    deleteWeeks: pastPlan.map((week) => week.weekStart),
    deletePhases: [],
    endPhases: [],
    newPhase: { kind, startDate },
    writeWeeks: written,
  };
  if (current) {
    if (current.startDate === startDate) {
      edit.deletePhases.push(current.id);
    } else if (current.endDate === null || current.endDate >= startDate) {
      edit.endPhases.push({ id: current.id, endDate: addDays(startDate, -1) });
    }
  }
  return edit;
}

export interface RateChangeInput {
  /** The Monday of the week whose lb/wk changes. */
  weekStart: string;
  poundsPerWeek: number;
}

/**
 * Change one week's lb/wk (decision 11). The week's target becomes the
 * previous week's target plus the rate, and every later target in the same
 * phase moves by the same amount. Original targets never change.
 */
export function planRateChange(
  state: PlanState,
  { weekStart, poundsPerWeek }: RateChangeInput,
): PlanEdit {
  checkMonday(weekStart, "week");
  const week = state.weeks.find((row) => row.weekStart === weekStart);
  if (!week) {
    throw new PlanEditError(
      `No planned week starts ${shortDate(weekStart)}.`,
      "NOT_FOUND",
    );
  }
  const weeks = weeksOf(state, week.phaseId);
  const previous = weeks.find(
    (row) => row.weekStart === addDays(weekStart, -7),
  );
  if (previous?.target == null || week.target === null) {
    throw new PlanEditError(
      `The week of ${shortDate(weekStart)} has no target before it in its phase, so it has no lb/wk to change.`,
    );
  }
  const target = cleanTarget(previous.target + poundsPerWeek);
  const shift = target - week.target;
  if (shift === 0) return EMPTY_EDIT;

  const writeWeeks = weeks
    .filter((row) => row.weekStart >= weekStart && row.target !== null)
    .map((row) => ({
      ...row,
      target:
        row.weekStart === weekStart
          ? target
          : cleanTarget((row.target ?? 0) + shift),
    }));
  for (const row of writeWeeks) checkTarget(row.target);
  return { ...EMPTY_EDIT, writeWeeks };
}

export interface EndMoveInput {
  phaseId: number;
  /** The Monday of the plan's new last week. */
  lastWeek: string;
}

/**
 * Move the running phase's end (decision 11). A later end adds weeks at the
 * plan's last rate, with no original target (decision 12). An earlier end
 * removes weeks from the end, and refuses when a removed week holds
 * weigh-ins, so the owner sees which week is in the way.
 */
export function planEndMove(
  state: PlanState,
  { phaseId, lastWeek }: EndMoveInput,
): PlanEdit {
  const phase = state.phases.find((row) => row.id === phaseId);
  if (!phase) throw new PlanEditError("No such phase.", "NOT_FOUND");
  if (phase.endDate !== null) {
    throw new PlanEditError(
      "Only the running phase's end can move. Start a phase to end this one.",
    );
  }
  checkMonday(lastWeek, "last week");
  if (lastWeek < phase.startDate) {
    throw new PlanEditError("The last week can't come before the start.");
  }
  if (weeksBetween(phase.startDate, lastWeek) + 1 > MAX_PLAN_WEEKS) {
    throw new PlanEditError(
      `A plan can run at most ${MAX_PLAN_WEEKS} weeks.`,
    );
  }
  const weeks = weeksOf(state, phaseId);
  const last = weeks.at(-1);
  if (!last) {
    throw new PlanEditError("This phase has no planned weeks to move.");
  }

  if (lastWeek < last.weekStart) {
    const removed = weeks.filter((row) => row.weekStart > lastWeek);
    // Name the latest week in the way: the plan has to reach at least it.
    const weighedIn = [...removed]
      .reverse()
      .find((row) => state.weighInWeeks.has(row.weekStart));
    if (weighedIn) {
      throw new PlanEditError(
        `The week of ${shortDate(weighedIn.weekStart)} has weigh-ins, so the plan can't end before it.`,
      );
    }
    return { ...EMPTY_EDIT, deleteWeeks: removed.map((row) => row.weekStart) };
  }
  if (lastWeek === last.weekStart) return EMPTY_EDIT;

  if (last.target === null) {
    throw new PlanEditError(
      `The week of ${shortDate(last.weekStart)} has no target to continue from.`,
    );
  }
  const before = weeks.find(
    (row) => row.weekStart === addDays(last.weekStart, -7),
  );
  const rate = before?.target == null ? 0 : last.target - before.target;
  const added = weeksBetween(last.weekStart, lastWeek);
  const writeWeeks = Array.from({ length: added }, (_, index) => {
    const target = cleanTarget(last.target! + (index + 1) * rate);
    checkTarget(target);
    return {
      weekStart: addDays(last.weekStart, (index + 1) * 7),
      phaseId,
      target,
      originalTarget: null,
    };
  });
  return { ...EMPTY_EDIT, writeWeeks };
}

/**
 * The state after an edit, written the way the router writes it. Tests use
 * it to check the invariants after every planner.
 */
export function applyPlanEdit(
  state: PlanState,
  edit: PlanEdit,
  newPhaseId: number,
): PlanState {
  const deletedPhases = new Set(edit.deletePhases);
  const ends = new Map(edit.endPhases.map((row) => [row.id, row.endDate]));
  const phases = state.phases
    .filter((phase) => !deletedPhases.has(phase.id))
    .map((phase) =>
      ends.has(phase.id) ? { ...phase, endDate: ends.get(phase.id)! } : phase,
    );
  if (edit.newPhase) {
    phases.push({ id: newPhaseId, ...edit.newPhase, endDate: null });
  }
  const deletedWeeks = new Set(edit.deleteWeeks);
  const weeks = new Map(
    state.weeks
      .filter(
        (week) =>
          !deletedWeeks.has(week.weekStart) && !deletedPhases.has(week.phaseId),
      )
      .map((week) => [week.weekStart, week]),
  );
  for (const week of edit.writeWeeks) {
    weeks.set(week.weekStart, { ...week, phaseId: week.phaseId ?? newPhaseId });
  }
  return { phases, weeks: [...weeks.values()], weighInWeeks: state.weighInWeeks };
}

/**
 * Every broken plan rule in a state: phases that are not whole weeks, that
 * overlap, or that run while a later one exists, and planned weeks that sit
 * outside their phase. An empty list means the plan is sound.
 */
export function planViolations(state: PlanState): string[] {
  const problems: string[] = [];
  const phases = [...state.phases].sort((a, b) =>
    byString(a.startDate, b.startDate),
  );
  const byId = new Map(phases.map((phase) => [phase.id, phase]));
  phases.forEach((phase, index) => {
    if (!isMonday(phase.startDate)) {
      problems.push(`phase ${phase.id} starts on ${phase.startDate}, not a Monday`);
    }
    if (
      phase.endDate !== null &&
      (phase.endDate <= phase.startDate || !isMonday(addDays(phase.endDate, 1)))
    ) {
      problems.push(`phase ${phase.id} ends on ${phase.endDate}, not a Sunday after its start`);
    }
    const next = phases[index + 1];
    if (!next) return;
    if (phase.endDate === null) {
      problems.push(`phase ${phase.id} is running before phase ${next.id}`);
    } else if (phase.endDate >= next.startDate) {
      problems.push(`phase ${phase.id} overlaps phase ${next.id}`);
    }
  });
  const seen = new Set<string>();
  for (const week of state.weeks) {
    if (seen.has(week.weekStart)) {
      problems.push(`week ${week.weekStart} is planned twice`);
    }
    seen.add(week.weekStart);
    const phase = byId.get(week.phaseId);
    if (!isMonday(week.weekStart)) {
      problems.push(`week ${week.weekStart} is not a Monday`);
    }
    if (!phase) {
      problems.push(`week ${week.weekStart} has no phase`);
    } else if (
      week.weekStart < phase.startDate ||
      (phase.endDate !== null && addDays(week.weekStart, 6) > phase.endDate)
    ) {
      problems.push(`week ${week.weekStart} lies outside phase ${phase.id}`);
    }
  }
  return problems;
}
