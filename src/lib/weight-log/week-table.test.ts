import { describe, expect, it } from "vitest";

import type { WeightLog } from "./schema";
import {
  buildWeekTable,
  currentPhase,
  weekNumber,
  weeklyAverage,
} from "./week-table";

// Invented numbers. None of them is the owner's.
type Week = WeightLog["weeks"][number];
const week = (
  date: string,
  phaseId: string,
  weights: (number | null)[],
  target: number | null,
  originalTarget: number | null,
  averageDays = [0, 1, 2, 3, 4, 5, 6],
): Week => ({ date, phaseId, weights, averageDays, target, originalTarget });

const empty = [null, null, null, null, null, null, null];

const weeks: Week[] = [
  // Cut, two planned weeks.
  week("2030-01-07", "1", [100, 101, 102, 110, null, null, null], 101, 101),
  week("2030-01-14", "1", [99, 100, null, null, null, null, null], 100, 100.5),
  // Bulk: its first week, a week with an excluded weigh-in, a future week,
  // and a week past the plan with weigh-ins only.
  week("2030-01-21", "2", [100, 100.4, null, null, null, null, null], 100, 100),
  week(
    "2030-01-28",
    "2",
    [100.2, 100.6, 130, 100.8, null, null, null],
    100.5,
    null,
    [0, 1, 3, 4, 5, 6],
  ),
  week("2030-02-04", "2", empty, 101, 100.75),
  week(
    "2030-02-11",
    "2",
    [101.5, null, null, null, null, null, null],
    null,
    null,
  ),
];

describe("weeklyAverage", () => {
  it("drops the highest and lowest when a week has three or more", () => {
    expect(weeklyAverage(weeks[0]!)).toBeCloseTo(101.5);
  });

  it("averages one or two weigh-ins as they are", () => {
    expect(weeklyAverage(weeks[1]!)).toBeCloseTo(99.5);
  });

  it("leaves out an excluded weigh-in before trimming", () => {
    // 130 on Wednesday is excluded; the rest trim to 100.6.
    expect(weeklyAverage(weeks[3]!)).toBeCloseTo(100.6);
  });

  it("is null for a week with no weigh-ins", () => {
    expect(weeklyAverage(weeks[4]!)).toBeNull();
  });
});

describe("buildWeekTable", () => {
  it("keeps only the phase's weeks, in calendar order", () => {
    const shuffled = { weeks: [...weeks].reverse() };
    expect(buildWeekTable(shuffled, "2").map((row) => row.week)).toEqual([
      "2030-01-21",
      "2030-01-28",
      "2030-02-04",
      "2030-02-11",
    ]);
    expect(buildWeekTable({ weeks }, "missing")).toEqual([]);
  });

  it("computes each column the way the workbook does", () => {
    const [first, second] = buildWeekTable({ weeks }, "1");
    expect(first).toMatchObject({
      average: 101.5,
      change: null,
      target: 101,
      gapToTarget: 0.5,
      poundsPerWeek: null,
      originalTarget: 101,
      gapToOriginalTarget: 0,
    });
    expect(second!.change).toBeCloseTo(-2);
    expect(second!.gapToTarget).toBeCloseTo(-0.5);
    expect(second!.poundsPerWeek).toBeCloseTo(-1);
    expect(second!.gapToOriginalTarget).toBeCloseTo(-0.5);
  });

  it("measures change across a phase boundary but lbs/w only within one", () => {
    const [first] = buildWeekTable({ weeks }, "2");
    // The previous calendar week belongs to the cut.
    expect(first!.change).toBeCloseTo(0.7);
    expect(first!.poundsPerWeek).toBeNull();
  });

  it("names excluded days and keeps them out of the average", () => {
    const row = buildWeekTable({ weeks }, "2")[1]!;
    expect(row.excludedDays).toEqual([2]);
    expect(row.average).toBeCloseTo(100.6);
    expect(row.change).toBeCloseTo(0.4);
    expect(row.poundsPerWeek).toBeCloseTo(0.5);
    expect(row.gapToOriginalTarget).toBeNull();
  });

  it("leaves weigh-in columns empty for a planned week ahead", () => {
    const row = buildWeekTable({ weeks }, "2")[2]!;
    expect(row).toMatchObject({
      average: null,
      change: null,
      gapToTarget: null,
      target: 101,
      poundsPerWeek: 0.5,
      gapToOriginalTarget: 0.25,
    });
  });

  it("shows a week past the plan with its average and no target", () => {
    const row = buildWeekTable({ weeks }, "2")[3]!;
    expect(row).toMatchObject({
      average: 101.5,
      change: null,
      target: null,
      gapToTarget: null,
      poundsPerWeek: null,
    });
  });
});

describe("currentPhase", () => {
  it("is the phase that starts last", () => {
    expect(
      currentPhase([
        { id: "a", start: "2030-01-07" },
        { id: "c", start: "2030-03-04" },
        { id: "b", start: "2030-01-21" },
      ])?.id,
    ).toBe("c");
    expect(currentPhase([])).toBeUndefined();
  });
});

describe("weekNumber", () => {
  it("counts the phase's first week as 0", () => {
    expect(weekNumber("2030-01-07", "2030-01-07")).toBe(0);
    expect(weekNumber("2030-01-14", "2030-01-07")).toBe(1);
    expect(weekNumber("2030-03-04", "2030-01-07")).toBe(8);
  });

  it("counts calendar weeks, across a year and from a start that isn't a Monday", () => {
    expect(weekNumber("2030-01-07", "2029-12-26")).toBe(2);
  });
});
