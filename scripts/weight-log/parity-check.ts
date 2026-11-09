import { trimmedMean } from "../../src/lib/weight-log/chart";
import { addDays } from "../../src/lib/weight-log/phases";
import {
  type WeightLogRecords,
  buildWeightLog,
} from "../../src/lib/weight-log/records";

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
  /** Anything else. Each entry names a date, phase, or field, never a value. */
  unexpected: string[];
}

const same = (a: unknown, b: unknown) =>
  (a ?? null) === (b ?? null) || (Number.isNaN(a) && Number.isNaN(b));

/**
 * Compare the imported tables with the old encrypted snapshot. Weigh-ins,
 * exclusions, scan values, set points, targets, and original targets in kept
 * weeks must be exactly equal. Pass the importer's JSON as `workbook` to check
 * the added scan columns too.
 */
export function compareParity({
  snapshot,
  records,
  workbook,
}: {
  snapshot: LegacySnapshot;
  records: WeightLogRecords;
  workbook?: WorkbookExport;
}): ParityReport {
  const unexpected: string[] = [];
  const log = buildWeightLog(records);
  const report: ParityReport = {
    counts: {},
    intended: {
      trimmedWeeks: [],
      derivedPhaseNames: [],
      removedOtherKind: [],
      addedScanColumns: [],
    },
    unexpected,
  };

  // Weigh-ins and exclusions, by date.
  const oldWeighIns = new Map<string, { pounds: number; excluded: boolean }>();
  for (const week of snapshot.weeks)
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
    if (!row) unexpected.push(`Weigh-in ${date}: missing from the database`);
    else {
      if (!same(row.pounds, old.pounds))
        unexpected.push(`Weigh-in ${date}: pounds differ`);
      if (row.excluded !== old.excluded)
        unexpected.push(`Weigh-in ${date}: exclusion differs`);
    }
  }
  for (const date of newWeighIns.keys())
    if (!oldWeighIns.has(date))
      unexpected.push(`Weigh-in ${date}: only in the database`);

  // Phases, matched by start date.
  const oldPhases = [...snapshot.phases].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  const newPhases = new Map(log.phases.map((phase) => [phase.start, phase]));
  const oldById = new Map(oldPhases.map((phase) => [phase.id, phase]));
  for (const [index, old] of oldPhases.entries()) {
    const phase = newPhases.get(old.start);
    if (old.kind === "other")
      report.intended.removedOtherKind.push(`${old.label} used "other"`);
    if (!phase) {
      unexpected.push(`Phase ${old.label}: missing from the database`);
      continue;
    }
    if (old.kind !== "other" && phase.kind !== old.kind)
      unexpected.push(`Phase ${old.label}: kind differs`);
    report.intended.derivedPhaseNames.push(`${old.label} -> ${phase.label}`);
    const next = oldPhases[index + 1];
    if (phase.end !== old.end) {
      // Decision 9: a phase ends the day before the next one starts.
      if (next && phase.end === addDays(next.start, -1) && old.end > phase.end)
        report.intended.trimmedWeeks.push(
          `${old.label}: ends ${phase.end} instead of ${old.end}`,
        );
      else unexpected.push(`Phase ${old.label}: end date differs`);
    }
  }
  for (const start of newPhases.keys())
    if (!oldPhases.some((phase) => phase.start === start))
      unexpected.push(`Phase starting ${start}: only in the database`);

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
  for (const old of snapshot.weeks) {
    const phase = oldById.get(old.phaseId);
    if (!phase) {
      unexpected.push(`Week ${old.date}: its snapshot phase is missing`);
      continue;
    }
    const key = `${phase.start}|${old.date}`;
    const week = newWeeks.get(key);
    if (!week) {
      const next = oldPhases[oldPhases.indexOf(phase) + 1];
      const empty = old.weights.every((pounds) => pounds === null);
      if (next && old.date >= next.start && empty)
        report.intended.trimmedWeeks.push(
          `${phase.label}: week of ${old.date}`,
        );
      else unexpected.push(`Week ${old.date} (${phase.label}): missing`);
      continue;
    }
    keptWeeks++;
    seenWeeks.add(key);
    if (!same(week.target, old.target))
      unexpected.push(`Week ${old.date} (${phase.label}): target differs`);
    if (!same(week.originalTarget, old.originalTarget))
      unexpected.push(
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
      unexpected.push(
        `Week ${old.date} (${phase.label}): weekly average differs`,
      );
  }
  for (const key of newWeeks.keys())
    if (!seenWeeks.has(key))
      unexpected.push(`Week ${key.split("|")[1]}: only in the database`);

  // Scans.
  const newScans = new Map(records.scans.map((scan) => [scan.date, scan]));
  for (const old of snapshot.scans) {
    const scan = newScans.get(old.date);
    if (!scan) {
      unexpected.push(`Scan ${old.date}: missing from the database`);
      continue;
    }
    for (const field of [
      "weight",
      "leanMass",
      "fatMass",
      "bodyFatPercent",
    ] as const)
      if (!same(scan[field], old[field]))
        unexpected.push(`Scan ${old.date}: ${field} differs`);
  }
  for (const date of newScans.keys())
    if (!snapshot.scans.some((scan) => scan.date === date))
      unexpected.push(`Scan ${date}: only in the database`);
  report.intended.addedScanColumns = [...ADDED_SCAN_FIELDS];
  if (workbook) {
    for (const date of newScans.keys())
      if (!workbook.scans.some((source) => source.date === date))
        unexpected.push(`Scan ${date}: not in the workbook`);
    for (const source of workbook.scans) {
      const scan = newScans.get(source.date);
      if (!scan) {
        unexpected.push(
          `Scan ${source.date}: in the workbook, not the database`,
        );
        continue;
      }
      for (const field of ADDED_SCAN_FIELDS)
        if (!same(scan[field], source[field]))
          unexpected.push(
            `Scan ${source.date}: ${field} differs from the workbook`,
          );
    }
  }

  // Set points, in order.
  const setPoints = [...records.setPoints].sort(
    (a, b) => a.position - b.position,
  );
  if (setPoints.length !== snapshot.setPoints.length)
    unexpected.push("Set points: count differs");
  snapshot.setPoints.forEach((old, index) => {
    if (!same(setPoints[index]?.pounds, old.weight))
      unexpected.push(`Set point ${index + 1}: pounds differ`);
    if (log.setPoints[index]?.label !== old.label)
      unexpected.push(`Set point ${index + 1}: label differs`);
  });

  // Historical context: the recollection and every strength reading.
  const oldContext = snapshot.historicalContext;
  const newContext = log.historicalContext;
  if (!oldContext !== !newContext)
    unexpected.push("Historical context: present in only one source");
  if (oldContext && newContext) {
    for (const field of ["date", "bodyFatLow", "bodyFatHigh", "note"] as const)
      if (!same(oldContext.anchor[field], newContext.anchor[field]))
        unexpected.push(`Recollection: ${field} differs`);
    const strength = new Map(
      newContext.strength.map((row) => [`${row.date}|${row.lift}`, row.value]),
    );
    if (strength.size !== oldContext.strength.length)
      unexpected.push("Strength history: count differs");
    for (const row of oldContext.strength)
      if (!same(strength.get(`${row.date}|${row.lift}`), row.value))
        unexpected.push(`Strength ${row.date} ${row.lift}: differs`);
  }

  report.counts = {
    weighIns: newWeighIns.size,
    excludedWeighIns: records.weighIns.filter((row) => row.excluded).length,
    phases: records.phases.length,
    plannedWeeks: records.plannedWeeks.length,
    keptSnapshotWeeks: keptWeeks,
    snapshotWeeks: snapshot.weeks.length,
    scans: records.scans.length,
    setPoints: records.setPoints.length,
    strengthReadings: records.strength.length,
  };
  return report;
}
