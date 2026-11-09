import { trimmedMean } from "../../src/lib/weight-log/chart";
import { addDays } from "../../src/lib/weight-log/phases";
import {
  type WeightLogRecords,
  buildWeightLog,
} from "../../src/lib/weight-log/records";
import type { WeightLog } from "../../src/lib/weight-log/schema";

import {
  ADDED_SCAN_FIELDS,
  type LegacySnapshot,
  type WorkbookExport,
} from "./sources";

export interface ParityReport {
  counts: Record<string, number>;
  /** Decision 26's intended differences, by name. */
  intended: {
    trimmedWeeks: string[];
    derivedPhaseNames: string[];
    removedOtherKind: string[];
    addedScanColumns: string[];
  };
  /**
   * Differences from the workbook export, which is what the import read, plus
   * the historical context against the snapshot. Each entry names a date,
   * phase, or field, never a value. Any entry fails the check.
   */
  unexpected: string[];
  /**
   * Differences from the old snapshot, for information only. The snapshot
   * refreshes only when the Hermes job uploads, so a weigh-in entered in the
   * workbook since then shows up here without being a bug.
   */
  snapshot: string[];
}

type WorkbookScan = WorkbookExport["scans"][number];
type ScanField = Exclude<keyof WorkbookScan, "date">;

const SNAPSHOT_SCAN_FIELDS = [
  "weight",
  "leanMass",
  "fatMass",
  "bodyFatPercent",
] as const satisfies readonly ScanField[];
const WORKBOOK_SCAN_FIELDS = [
  ...SNAPSHOT_SCAN_FIELDS,
  ...ADDED_SCAN_FIELDS,
] as const satisfies readonly ScanField[];

/** The workbook export or the old snapshot, which lacks the added scan columns. */
interface Source {
  phases: LegacySnapshot["phases"];
  weeks: LegacySnapshot["weeks"];
  setPoints: LegacySnapshot["setPoints"];
  scans: (Pick<WorkbookScan, "date"> & Partial<WorkbookScan>)[];
}

const same = (a: unknown, b: unknown) =>
  (a ?? null) === (b ?? null) || (Number.isNaN(a) && Number.isNaN(b));

/**
 * Compare the tables with one source. Weigh-ins, exclusions, the given scan
 * fields, set points, targets, original targets, and weekly averages in kept
 * weeks must be exactly equal. Trimmed weeks, shortened phase ends, derived
 * names, and the removed `other` kind come back as intended differences.
 */
function compareSource(
  source: Source,
  records: WeightLogRecords,
  log: WeightLog,
  scanFields: readonly ScanField[],
) {
  const differences: string[] = [];
  const trimmedWeeks: string[] = [];
  const derivedPhaseNames: string[] = [];
  const removedOtherKind: string[] = [];

  // Weigh-ins and exclusions, by date.
  const oldWeighIns = new Map<string, { pounds: number; excluded: boolean }>();
  for (const week of source.weeks)
    week.weights.forEach((pounds, offset) => {
      if (pounds === null) return;
      oldWeighIns.set(addDays(week.date, offset), {
        pounds,
        excluded: !week.averageDays.includes(offset),
      });
    });
  const newWeighIns = new Map(records.weighIns.map((row) => [row.date, row]));
  for (const [date, old] of oldWeighIns) {
    const row = newWeighIns.get(date);
    if (!row) differences.push(`Weigh-in ${date}: missing from the database`);
    else {
      if (!same(row.pounds, old.pounds))
        differences.push(`Weigh-in ${date}: pounds differ`);
      if (row.excluded !== old.excluded)
        differences.push(`Weigh-in ${date}: exclusion differs`);
    }
  }
  for (const date of newWeighIns.keys())
    if (!oldWeighIns.has(date))
      differences.push(`Weigh-in ${date}: only in the database`);

  // Phases, matched by start date.
  const oldPhases = [...source.phases].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  const newPhases = new Map(log.phases.map((phase) => [phase.start, phase]));
  const oldById = new Map(oldPhases.map((phase) => [phase.id, phase]));
  for (const [index, old] of oldPhases.entries()) {
    const phase = newPhases.get(old.start);
    if (old.kind === "other")
      removedOtherKind.push(`${old.label} used "other"`);
    if (!phase) {
      differences.push(`Phase ${old.label}: missing from the database`);
      continue;
    }
    if (old.kind !== "other" && phase.kind !== old.kind)
      differences.push(`Phase ${old.label}: kind differs`);
    derivedPhaseNames.push(`${old.label} -> ${phase.label}`);
    const next = oldPhases[index + 1];
    if (phase.end !== old.end) {
      // Decision 9: a phase ends the day before the next one starts.
      if (next && phase.end === addDays(next.start, -1) && old.end > phase.end)
        trimmedWeeks.push(
          `${old.label}: ends ${phase.end} instead of ${old.end}`,
        );
      else differences.push(`Phase ${old.label}: end date differs`);
    }
  }
  for (const start of newPhases.keys())
    if (!oldPhases.some((phase) => phase.start === start))
      differences.push(`Phase starting ${start}: only in the database`);

  // Planned weeks: targets and original targets, matched by phase and week.
  const phaseStartById = new Map(
    records.phases.map((phase) => [phase.id, phase.startDate]),
  );
  const newWeeks = new Map(
    records.plannedWeeks.map((week) => [
      `${phaseStartById.get(week.phaseId)}|${week.weekStart}`,
      week,
    ]),
  );
  const newWeekRows = new Map(log.weeks.map((week) => [week.date, week]));
  const seenWeeks = new Set<string>();
  let keptWeeks = 0;
  for (const old of source.weeks) {
    const phase = oldById.get(old.phaseId);
    if (!phase) {
      differences.push(`Week ${old.date}: its source phase is missing`);
      continue;
    }
    const key = `${phase.start}|${old.date}`;
    const week = newWeeks.get(key);
    if (!week) {
      const next = oldPhases[oldPhases.indexOf(phase) + 1];
      const empty = old.weights.every((pounds) => pounds === null);
      if (next && old.date >= next.start && empty)
        trimmedWeeks.push(`${phase.label}: week of ${old.date}`);
      else differences.push(`Week ${old.date} (${phase.label}): missing`);
      continue;
    }
    keptWeeks++;
    seenWeeks.add(key);
    if (!same(week.target, old.target))
      differences.push(`Week ${old.date} (${phase.label}): target differs`);
    if (!same(week.originalTarget, old.originalTarget))
      differences.push(
        `Week ${old.date} (${phase.label}): original target differs`,
      );
    // The chart's weekly average must not move.
    const row = newWeekRows.get(old.date);
    const before = trimmedMean(
      old.averageDays.map((offset) => old.weights[offset] ?? null),
    );
    const after =
      row &&
      trimmedMean(row.averageDays.map((offset) => row.weights[offset] ?? null));
    if (!row || !same(before, after))
      differences.push(
        `Week ${old.date} (${phase.label}): weekly average differs`,
      );
  }
  for (const key of newWeeks.keys())
    if (!seenWeeks.has(key))
      differences.push(`Week ${key.split("|")[1]}: only in the database`);

  // Scans.
  const newScans = new Map(records.scans.map((scan) => [scan.date, scan]));
  for (const old of source.scans) {
    const scan = newScans.get(old.date);
    if (!scan) {
      differences.push(`Scan ${old.date}: missing from the database`);
      continue;
    }
    for (const field of scanFields)
      if (!same(scan[field], old[field]))
        differences.push(`Scan ${old.date}: ${field} differs`);
  }
  for (const date of newScans.keys())
    if (!source.scans.some((scan) => scan.date === date))
      differences.push(`Scan ${date}: only in the database`);

  // Set points, in order.
  const setPoints = [...records.setPoints].sort(
    (a, b) => a.position - b.position,
  );
  if (setPoints.length !== source.setPoints.length)
    differences.push("Set points: count differs");
  source.setPoints.forEach((old, index) => {
    if (!same(setPoints[index]?.pounds, old.weight))
      differences.push(`Set point ${index + 1}: pounds differ`);
    if (log.setPoints[index]?.label !== old.label)
      differences.push(`Set point ${index + 1}: label differs`);
  });

  return {
    differences,
    trimmedWeeks,
    derivedPhaseNames,
    removedOtherKind,
    keptWeeks,
  };
}

/** The recollection and every strength reading, which only the snapshot holds. */
function compareHistoricalContext(snapshot: LegacySnapshot, log: WeightLog) {
  const differences: string[] = [];
  const oldContext = snapshot.historicalContext;
  const newContext = log.historicalContext;
  if (!oldContext !== !newContext)
    differences.push("Historical context: present in only one source");
  if (oldContext && newContext) {
    for (const field of ["date", "bodyFatLow", "bodyFatHigh", "note"] as const)
      if (!same(oldContext.anchor[field], newContext.anchor[field]))
        differences.push(`Recollection: ${field} differs`);
    const strength = new Map(
      newContext.strength.map((row) => [`${row.date}|${row.lift}`, row.value]),
    );
    if (strength.size !== oldContext.strength.length)
      differences.push("Strength history: count differs");
    for (const row of oldContext.strength)
      if (!same(strength.get(`${row.date}|${row.lift}`), row.value))
        differences.push(`Strength ${row.date} ${row.lift}: differs`);
  }
  return differences;
}

/**
 * Compare the imported tables with the workbook export the import read. Every
 * weigh-in, exclusion, scan value, set point, target, original target, and
 * weekly average in the kept weeks must be exactly equal, and so must the
 * historical context, checked against the old snapshot. The snapshot is also
 * compared in full, for information only: on cutover morning it can lack the
 * weigh-in entered just before the import.
 */
export function compareParity({
  workbook,
  snapshot,
  records,
}: {
  workbook: WorkbookExport;
  snapshot: LegacySnapshot;
  records: WeightLogRecords;
}): ParityReport {
  const log = buildWeightLog(records);
  const current = compareSource(workbook, records, log, WORKBOOK_SCAN_FIELDS);
  const legacy = compareSource(snapshot, records, log, SNAPSHOT_SCAN_FIELDS);
  return {
    counts: {
      weighIns: records.weighIns.length,
      excludedWeighIns: records.weighIns.filter((row) => row.excluded).length,
      phases: records.phases.length,
      plannedWeeks: records.plannedWeeks.length,
      keptWorkbookWeeks: current.keptWeeks,
      workbookWeeks: workbook.weeks.length,
      scans: records.scans.length,
      setPoints: records.setPoints.length,
      strengthReadings: records.strength.length,
    },
    intended: {
      trimmedWeeks: current.trimmedWeeks,
      derivedPhaseNames: current.derivedPhaseNames,
      // The import refuses `other`, so only the snapshot can still hold it.
      removedOtherKind: [
        ...new Set([...current.removedOtherKind, ...legacy.removedOtherKind]),
      ],
      addedScanColumns: [...ADDED_SCAN_FIELDS],
    },
    unexpected: [
      ...current.differences,
      ...compareHistoricalContext(snapshot, log),
    ],
    snapshot: legacy.differences,
  };
}
