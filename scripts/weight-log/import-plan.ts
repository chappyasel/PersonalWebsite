import {
  type PhaseKind,
  addDays,
  phaseName,
  weekStartOf,
} from "../../src/lib/weight-log/phases";
import type { HistoricalContext } from "../../src/lib/weight-log/schema";

import type { WorkbookExport } from "./sources";

export interface ImportPlan {
  weighIns: { date: string; pounds: number; excluded: boolean }[];
  /** `endDate` is null for the running phase. */
  phases: {
    startDate: string;
    endDate: string | null;
    kind: PhaseKind;
    workbookLabel: string;
    name: string;
  }[];
  /** Each week names its phase by the phase's start date. */
  plannedWeeks: {
    weekStart: string;
    phaseStart: string;
    target: number | null;
    originalTarget: number | null;
  }[];
  setPoints: { position: number; pounds: number }[];
  scans: WorkbookExport["scans"];
  recollection: HistoricalContext["anchor"];
  strength: HistoricalContext["strength"];
  /** Empty planned weeks dropped because the next phase had already started. */
  trimmed: { phase: string; weekStart: string }[];
}

const isMonday = (date: string) =>
  new Date(`${date}T00:00:00Z`).getUTCDay() === 1;

/**
 * Turn the importer's JSON into table rows under the owner's rules:
 * - A date has at most one weigh-in (decision 7).
 * - Phases start on a Monday, never overlap, and are bulk, cut, or
 *   maintenance (decision 8).
 * - A phase ends the day before the next one starts, losing its later planned
 *   weeks that have no weigh-ins (decision 9). A later week that has a
 *   weigh-in stops the import instead.
 * - Names come from kind and dates (decision 10). The last phase is running.
 * Errors name dates and phases, never measurements.
 */
export function planImport(
  exported: WorkbookExport,
  history: HistoricalContext,
): ImportPlan {
  const phases = [...exported.phases].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  const weighIns = new Map<string, { pounds: number; excluded: boolean }>();
  const weeksByPhase = new Map<string, WorkbookExport["weeks"]>();
  for (const week of exported.weeks) {
    if (!isMonday(week.date))
      throw new Error(`Week ${week.date} does not start on a Monday`);
    const list = weeksByPhase.get(week.phaseId) ?? [];
    list.push(week);
    weeksByPhase.set(week.phaseId, list);
    week.weights.forEach((pounds, offset) => {
      if (pounds === null) return;
      const date = addDays(week.date, offset);
      if (weighIns.has(date))
        throw new Error(`Two weigh-ins for ${date}; fix the workbook first`);
      weighIns.set(date, {
        pounds,
        excluded: !week.averageDays.includes(offset),
      });
    });
  }

  const plan: ImportPlan = {
    weighIns: [...weighIns]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, row]) => ({ date, ...row })),
    phases: [],
    plannedWeeks: [],
    setPoints: exported.setPoints.map((point, index) => ({
      position: index + 1,
      pounds: point.weight,
    })),
    scans: [...exported.scans].sort((a, b) => a.date.localeCompare(b.date)),
    recollection: history.anchor,
    strength: history.strength,
    trimmed: [],
  };

  const startDates = new Set<string>();
  phases.forEach((phase, index) => {
    if (phase.kind === "other")
      throw new Error(
        `Phase ${phase.label} has no bulk, cut, or maintenance kind`,
      );
    if (!isMonday(phase.start))
      throw new Error(`Phase ${phase.label} does not start on a Monday`);
    if (startDates.has(phase.start))
      throw new Error(`Two phases start on ${phase.start}`);
    startDates.add(phase.start);
    const next = phases[index + 1];
    const weeks = [...(weeksByPhase.get(phase.id) ?? [])].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    let lastWeek = phase.start;
    for (const week of weeks) {
      if (week.date < phase.start)
        throw new Error(`Phase ${phase.label} has a week before its start`);
      if (next && week.date >= next.start) {
        if (week.weights.some((pounds) => pounds !== null))
          throw new Error(
            `Phase ${phase.label} has weigh-ins after the next phase starts (${week.date})`,
          );
        plan.trimmed.push({ phase: phase.label, weekStart: week.date });
        continue;
      }
      plan.plannedWeeks.push({
        weekStart: week.date,
        phaseStart: phase.start,
        target: week.target,
        originalTarget: week.originalTarget,
      });
      lastWeek = week.date;
    }
    const end = next ? addDays(next.start, -1) : null;
    plan.phases.push({
      startDate: phase.start,
      endDate: end,
      kind: phase.kind,
      workbookLabel: phase.label,
      name: phaseName(phase.kind, phase.start, end ?? addDays(lastWeek, 6)),
    });
  });

  const weekStarts = new Set<string>();
  for (const week of plan.plannedWeeks) {
    if (weekStarts.has(week.weekStart))
      throw new Error(`Week ${week.weekStart} is planned twice`);
    weekStarts.add(week.weekStart);
  }
  // Every weigh-in must sit in a kept week, so no reading is lost with a tail.
  for (const { date } of plan.weighIns) {
    if (!weekStarts.has(weekStartOf(date)))
      throw new Error(`Weigh-in on ${date} has no planned week`);
  }
  return plan;
}
