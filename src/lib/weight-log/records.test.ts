import { describe, expect, it } from "vitest";

import { type WeightLogRecords, buildWeightLog } from "./records";

const at = new Date("2030-02-01T12:00:00Z");
const weighIn = (date: string, pounds: number, excluded = false) => ({
  date,
  pounds,
  excluded,
  updatedAt: at,
});
const scan = (date: string) => ({
  date,
  weight: 150,
  leanMass: 120,
  fatMass: 24,
  boneMineralContent: 6,
  bodyFatPercent: 16,
  armsFat: null,
  armsLean: null,
  armsBoneMineralContent: null,
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
});

const records = (): WeightLogRecords => ({
  weighIns: [
    weighIn("2030-01-07", 150),
    weighIn("2030-01-08", 151),
    weighIn("2030-01-13", 158, true),
    weighIn("2030-01-15", 149),
  ],
  phases: [
    { id: 7, kind: "bulk", startDate: "2030-01-14", endDate: null },
    { id: 3, kind: "cut", startDate: "2029-12-31", endDate: "2030-01-13" },
  ],
  plannedWeeks: [
    { weekStart: "2030-01-21", phaseId: 7, target: 152, originalTarget: 152 },
    { weekStart: "2029-12-31", phaseId: 3, target: 152, originalTarget: 153 },
    { weekStart: "2030-01-07", phaseId: 3, target: 151, originalTarget: null },
    { weekStart: "2030-01-14", phaseId: 7, target: 150, originalTarget: 150 },
  ],
  setPoints: [
    { position: 2, pounds: 160 },
    { position: 1, pounds: 140 },
  ],
  scans: [scan("2030-01-09")],
  recollections: [],
  strength: [],
});

describe("buildWeightLog", () => {
  it("derives phase names and ends, with a running phase ending at its last planned week", () => {
    const log = buildWeightLog(records());
    expect(log.phases).toEqual([
      {
        id: "3",
        label: "Cut Dec '29 - Jan '30",
        kind: "cut",
        start: "2029-12-31",
        end: "2030-01-13",
      },
      {
        id: "7",
        label: "Bulk Jan '30 - Jan '30",
        kind: "bulk",
        start: "2030-01-14",
        end: "2030-01-27",
      },
    ]);
  });

  it("places each weigh-in in its planned week and turns exclusions into averaged days", () => {
    const log = buildWeightLog(records());
    expect(log.weeks.map((week) => week.date)).toEqual([
      "2029-12-31",
      "2030-01-07",
      "2030-01-14",
      "2030-01-21",
    ]);
    const second = log.weeks[1]!;
    expect(second).toEqual({
      date: "2030-01-07",
      phaseId: "3",
      weights: [150, 151, null, null, null, null, 158],
      averageDays: [0, 1, 2, 3, 4, 5],
      target: 151,
      originalTarget: null,
    });
    expect(log.weeks[2]!.weights).toEqual([
      null,
      149,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(log.weeks[0]!.weights.every((weight) => weight === null)).toBe(true);
  });

  it("keeps a weigh-in outside every planned week, assigned to the running phase", () => {
    const input = records();
    input.weighIns.push(weighIn("2030-02-05", 153));
    input.weighIns.push(weighIn("2029-11-06", 148));
    const log = buildWeightLog(input);
    const late = log.weeks.find((week) => week.date === "2030-02-04")!;
    expect(late).toMatchObject({
      phaseId: "7",
      target: null,
      originalTarget: null,
    });
    expect(late.weights[1]).toBe(153);
    const early = log.weeks.find((week) => week.date === "2029-11-05")!;
    expect(early.phaseId).toBe("unassigned");
    expect(early.weights[1]).toBe(148);
  });

  it("orders set points and keeps only the chart's scan fields", () => {
    const log = buildWeightLog(records());
    expect(log.setPoints).toEqual([
      { label: "Set point 1", weight: 140 },
      { label: "Set point 2", weight: 160 },
    ]);
    expect(log.scans).toEqual([
      {
        date: "2030-01-09",
        weight: 150,
        leanMass: 120,
        fatMass: 24,
        bodyFatPercent: 16,
      },
    ]);
  });

  it("reports the latest weigh-in change as the import time", () => {
    const input = records();
    input.weighIns[0]!.updatedAt = new Date("2030-03-04T05:06:07Z");
    const log = buildWeightLog(input);
    expect(log.importedAt).toBe("2030-03-04T05:06:07.000Z");
    expect(log.sourceModifiedAt).toBe(log.importedAt);
  });

  it("includes the historical context only when a recollection exists", () => {
    expect(buildWeightLog(records()).historicalContext).toBeUndefined();
    const input = records();
    input.recollections = [
      {
        id: 1,
        date: "2029-06-01",
        bodyFatLow: 20,
        bodyFatHigh: 25,
        note: "Synthetic recollection",
      },
    ];
    input.strength = [
      { date: "2029-07-01", lift: "Synthetic press", value: 100 },
      { date: "2029-06-01", lift: "Synthetic squat", value: 200 },
      { date: "2029-06-01", lift: "Synthetic press", value: 90 },
    ];
    expect(buildWeightLog(input).historicalContext).toEqual({
      anchor: {
        date: "2029-06-01",
        bodyFatLow: 20,
        bodyFatHigh: 25,
        note: "Synthetic recollection",
      },
      strength: [
        { date: "2029-06-01", lift: "Synthetic press", value: 90 },
        { date: "2029-06-01", lift: "Synthetic squat", value: 200 },
        { date: "2029-07-01", lift: "Synthetic press", value: 100 },
      ],
    });
  });

  it("returns an empty chart for empty tables", () => {
    const log = buildWeightLog({
      weighIns: [],
      phases: [],
      plannedWeeks: [],
      setPoints: [],
      scans: [],
      recollections: [],
      strength: [],
    });
    expect(log.weeks).toEqual([]);
    expect(log.phases).toEqual([]);
  });
});
