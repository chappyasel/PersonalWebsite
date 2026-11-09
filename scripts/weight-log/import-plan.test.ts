import { describe, expect, it } from "vitest";

import { planImport } from "./import-plan";
import type { WorkbookExport } from "./sources";

const empty = [null, null, null, null, null, null, null];
const week = (
  date: string,
  phaseId: string,
  weights: (number | null)[] = empty,
  averageDays = [0, 1, 2, 3, 4, 5, 6],
) => ({
  date,
  phaseId,
  weights,
  averageDays,
  target: 150,
  originalTarget: 151,
});
const scan = {
  date: "2030-01-09",
  weight: 150,
  leanMass: 120,
  fatMass: 24,
  bodyFatPercent: 16,
  boneMineralContent: 6,
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
  boneMineralDensity: null,
  tScore: null,
  zScore: null,
  androidGynoidRatio: null,
  visceralFat: null,
  conditions: "Synthetic morning",
};

// A cut whose sheet still plans two weeks after the next bulk began.
const exported = (): WorkbookExport => ({
  version: 1,
  importedAt: "2030-02-01T00:00:00Z",
  sourceModifiedAt: "2030-02-01T00:00:00Z",
  setPoints: [
    { label: "Set point 1", weight: 140 },
    { label: "Set point 2", weight: 160 },
  ],
  phases: [
    {
      id: "phase-1",
      label: "Jan '30 - Mar '30",
      kind: "bulk",
      start: "2030-01-21",
      end: "2030-02-03",
    },
    {
      id: "phase-2",
      label: "Jan '30 - Jan '30",
      kind: "cut",
      start: "2030-01-07",
      end: "2030-02-03",
    },
  ],
  weeks: [
    week(
      "2030-01-07",
      "phase-2",
      [150, 151, null, null, null, null, 158],
      [0, 1, 2, 3, 4, 5],
    ),
    week("2030-01-14", "phase-2", [149, null, null, null, null, null, null]),
    week("2030-01-21", "phase-2"),
    week("2030-01-28", "phase-2"),
    week("2030-01-21", "phase-1", [152, null, null, null, null, null, null]),
    week("2030-01-28", "phase-1"),
  ],
  scans: [scan],
});
const history = {
  anchor: {
    date: "2029-06-01",
    bodyFatLow: 20,
    bodyFatHigh: 25,
    note: "Synthetic recollection",
  },
  strength: [{ date: "2029-06-01", lift: "Synthetic press", value: 90 }],
};

describe("planImport", () => {
  it("ends a phase the day before the next starts and drops its empty later weeks", () => {
    const plan = planImport(exported(), history);
    expect(plan.trimmed).toEqual([
      { phase: "Jan '30 - Jan '30", weekStart: "2030-01-21" },
      { phase: "Jan '30 - Jan '30", weekStart: "2030-01-28" },
    ]);
    expect(
      plan.phases.map(({ startDate, endDate, kind }) => ({
        startDate,
        endDate,
        kind,
      })),
    ).toEqual([
      { startDate: "2030-01-07", endDate: "2030-01-20", kind: "cut" },
      { startDate: "2030-01-21", endDate: null, kind: "bulk" },
    ]);
    expect(
      plan.plannedWeeks.map((row) => [row.weekStart, row.phaseStart]),
    ).toEqual([
      ["2030-01-07", "2030-01-07"],
      ["2030-01-14", "2030-01-07"],
      ["2030-01-21", "2030-01-21"],
      ["2030-01-28", "2030-01-21"],
    ]);
  });

  it("derives names, using the running phase's last planned week as its end", () => {
    const plan = planImport(exported(), history);
    expect(plan.phases.map((phase) => phase.name)).toEqual([
      "Cut Jan '30 - Jan '30",
      "Bulk Jan '30 - Feb '30",
    ]);
  });

  it("keeps one weigh-in per date and carries the exclusion", () => {
    const plan = planImport(exported(), history);
    expect(plan.weighIns).toEqual([
      { date: "2030-01-07", pounds: 150, excluded: false },
      { date: "2030-01-08", pounds: 151, excluded: false },
      { date: "2030-01-13", pounds: 158, excluded: true },
      { date: "2030-01-14", pounds: 149, excluded: false },
      { date: "2030-01-21", pounds: 152, excluded: false },
    ]);
    const twice = exported();
    twice.weeks[3] = week("2030-01-28", "phase-2", [
      152,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    twice.weeks[5] = week("2030-01-28", "phase-1", [
      152,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(() => planImport(twice, history)).toThrow(
      "Two weigh-ins for 2030-01-28",
    );
  });

  it("refuses to drop a later week that holds a weigh-in", () => {
    const input = exported();
    input.weeks[3] = week("2030-01-28", "phase-2", [
      null,
      null,
      153,
      null,
      null,
      null,
      null,
    ]);
    expect(() => planImport(input, history)).toThrow(
      "has weigh-ins after the next phase starts (2030-01-28)",
    );
  });

  it("refuses the removed other kind and a phase that starts mid-week", () => {
    const other = exported();
    other.phases[0] = { ...other.phases[0]!, kind: "other" };
    expect(() => planImport(other, history)).toThrow(
      "has no bulk, cut, or maintenance kind",
    );
    const midweek = exported();
    midweek.phases[0] = { ...midweek.phases[0]!, start: "2030-01-22" };
    expect(() => planImport(midweek, history)).toThrow(
      "does not start on a Monday",
    );
  });

  it("numbers set points and carries scans and history through", () => {
    const plan = planImport(exported(), history);
    expect(plan.setPoints).toEqual([
      { position: 1, pounds: 140 },
      { position: 2, pounds: 160 },
    ]);
    expect(plan.scans).toEqual([scan]);
    expect(plan.recollection).toEqual(history.anchor);
    expect(plan.strength).toEqual(history.strength);
  });
});
