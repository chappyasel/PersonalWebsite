import type { WeightLogRecords } from "../../src/lib/weight-log/records";
import { describe, expect, it } from "vitest";

import { type ImportPlan, planImport } from "./import-plan";
import { compareParity } from "./parity-check";
import type { LegacySnapshot, WorkbookExport } from "./sources";

const empty = [null, null, null, null, null, null, null];
const scan = {
  date: "2030-01-09",
  weight: 150.4,
  leanMass: 120.2,
  fatMass: 24.1,
  bodyFatPercent: 16.02,
  boneMineralContent: 6.1,
  armsFat: 3,
  armsLean: 15,
  armsBoneMineralContent: 1,
  legsFat: null,
  legsLean: null,
  legsBoneMineralContent: null,
  trunkFat: null,
  trunkLean: null,
  trunkBoneMineralContent: null,
  androidFat: null,
  androidLean: null,
  androidBoneMineralContent: null,
  gynoidFat: null,
  gynoidLean: null,
  gynoidBoneMineralContent: null,
  boneMineralDensity: 1.2,
  tScore: -0.4,
  zScore: 0.3,
  androidGynoidRatio: 0.5,
  visceralFat: 0,
  conditions: "Synthetic morning",
};
const history = {
  anchor: {
    date: "2029-06-01",
    bodyFatLow: 20,
    bodyFatHigh: 25,
    note: "Synthetic recollection",
  },
  strength: [{ date: "2029-06-01", lift: "Synthetic press", value: 90 }],
};

const workbook = (): WorkbookExport => ({
  version: 1,
  importedAt: "2030-02-01T00:00:00Z",
  sourceModifiedAt: "2030-02-01T00:00:00Z",
  setPoints: [{ label: "Set point 1", weight: 140.5 }],
  phases: [
    {
      id: "phase-2",
      label: "Jan '30 - Jan '30",
      kind: "cut",
      start: "2030-01-07",
      end: "2030-02-03",
    },
    {
      id: "phase-1",
      label: "Jan '30 - Mar '30",
      kind: "bulk",
      start: "2030-01-21",
      end: "2030-02-03",
    },
  ],
  weeks: [
    {
      date: "2030-01-07",
      phaseId: "phase-2",
      weights: [150.1, 151.3, null, null, null, null, 158.7],
      averageDays: [0, 1, 2, 3, 4, 5],
      target: 150.25,
      originalTarget: 151.75,
    },
    {
      date: "2030-01-14",
      phaseId: "phase-2",
      weights: [149.9, 149.1, 148.7, null, null, null, null],
      averageDays: [0, 1, 2, 3, 4, 5, 6],
      target: 149.5,
      originalTarget: null,
    },
    {
      date: "2030-01-21",
      phaseId: "phase-2",
      weights: empty,
      averageDays: [0, 1, 2, 3, 4, 5, 6],
      target: 149,
      originalTarget: 150,
    },
    {
      date: "2030-01-21",
      phaseId: "phase-1",
      weights: [152.2, null, null, null, null, null, null],
      averageDays: [0, 1, 2, 3, 4, 5, 6],
      target: 152,
      originalTarget: 152,
    },
    {
      date: "2030-01-28",
      phaseId: "phase-1",
      weights: empty,
      averageDays: [0, 1, 2, 3, 4, 5, 6],
      target: 152.5,
      originalTarget: null,
    },
  ],
  scans: [{ ...scan }],
  historicalContext: history,
});

/** The old snapshot: the same data without the added scan columns. */
const snapshot = (): LegacySnapshot => {
  const source = workbook();
  return {
    ...source,
    scans: source.scans.map(
      ({ date, weight, leanMass, fatMass, bodyFatPercent }) => ({
        date,
        weight,
        leanMass,
        fatMass,
        bodyFatPercent,
      }),
    ),
  };
};

/** What the import writes, as the database would return it. */
function stored(plan: ImportPlan): WeightLogRecords {
  const ids = new Map(
    plan.phases.map((phase, index) => [phase.startDate, index + 10]),
  );
  return {
    weighIns: plan.weighIns.map((row) => ({
      ...row,
      updatedAt: new Date("2030-02-01T00:00:00Z"),
    })),
    phases: plan.phases.map((phase) => ({
      id: ids.get(phase.startDate)!,
      kind: phase.kind,
      startDate: phase.startDate,
      endDate: phase.endDate,
    })),
    plannedWeeks: plan.plannedWeeks.map((week) => ({
      weekStart: week.weekStart,
      phaseId: ids.get(week.phaseStart)!,
      target: week.target,
      originalTarget: week.originalTarget,
    })),
    setPoints: plan.setPoints,
    scans: plan.scans,
    recollections: [{ id: 1, ...plan.recollection }],
    strength: plan.strength,
  };
}

describe("compareParity", () => {
  it("finds only decision 26's intended differences after a clean import", () => {
    const records = stored(planImport(workbook(), history));
    const report = compareParity({
      snapshot: snapshot(),
      records,
      workbook: workbook(),
    });
    expect(report.unexpected).toEqual([]);
    expect(report.intended.trimmedWeeks).toEqual([
      "Jan '30 - Jan '30: ends 2030-01-20 instead of 2030-02-03",
      "Jan '30 - Jan '30: week of 2030-01-21",
    ]);
    expect(report.intended.derivedPhaseNames).toEqual([
      "Jan '30 - Jan '30 -> Cut Jan '30 - Jan '30",
      "Jan '30 - Mar '30 -> Bulk Jan '30 - Feb '30",
    ]);
    expect(report.intended.removedOtherKind).toEqual([]);
    expect(report.intended.addedScanColumns).toContain("visceralFat");
    expect(report.counts).toMatchObject({
      weighIns: 7,
      excludedWeighIns: 1,
      phases: 2,
      plannedWeeks: 4,
      keptSnapshotWeeks: 4,
      snapshotWeeks: 5,
    });
  });

  it("names each changed value by date and field without printing it", () => {
    const records = stored(planImport(workbook(), history));
    records.weighIns[1]!.pounds = 151.4;
    records.weighIns[2]!.excluded = false;
    records.plannedWeeks[1]!.originalTarget = 149.5;
    records.scans[0]!.leanMass = 120.3;
    records.scans[0]!.tScore = 0.4;
    records.setPoints[0]!.pounds = 141;
    records.strength = [];
    const report = compareParity({
      snapshot: snapshot(),
      records,
      workbook: workbook(),
    });
    expect(report.unexpected).toEqual([
      "Weigh-in 2030-01-08: pounds differ",
      "Weigh-in 2030-01-13: exclusion differs",
      "Week 2030-01-07 (Jan '30 - Jan '30): weekly average differs",
      "Week 2030-01-14 (Jan '30 - Jan '30): original target differs",
      "Scan 2030-01-09: leanMass differs",
      "Scan 2030-01-09: tScore differs from the workbook",
      "Set point 1: pounds differ",
      "Strength history: count differs",
      "Strength 2029-06-01 Synthetic press: differs",
    ]);
    expect(report.unexpected.join(" ")).not.toMatch(/\d+\.\d/);
  });

  it("flags a missing weigh-in and a week dropped while it held data", () => {
    const records = stored(planImport(workbook(), history));
    records.weighIns = records.weighIns.filter(
      (row) => row.date !== "2030-01-21",
    );
    records.plannedWeeks = records.plannedWeeks.filter(
      (week) => week.weekStart !== "2030-01-14",
    );
    const report = compareParity({ snapshot: snapshot(), records });
    expect(report.unexpected).toContain(
      "Weigh-in 2030-01-21: missing from the database",
    );
    expect(report.unexpected).toContain(
      "Week 2030-01-14 (Jan '30 - Jan '30): missing",
    );
  });
});
