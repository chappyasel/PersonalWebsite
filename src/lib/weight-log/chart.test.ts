import { describe, expect, it } from "vitest";

import { buildWeightChart, trimmedMean } from "./chart";
import type { WeightLog } from "./schema";

const fixture = (weeks: WeightLog["weeks"]): WeightLog => ({
  version: 1,
  setPoints: [],
  importedAt: "2020-01-01",
  sourceModifiedAt: "2020-01-01",
  phases: [],
  scans: [],
  weeks,
});
const week = (
  date: string,
  weights: (number | null)[],
): WeightLog["weeks"][number] => ({
  date,
  phaseId: "test",
  weights,
  averageDays: [0, 1, 2, 3, 4, 5, 6],
  target: 150,
  originalTarget: null,
});

describe("weight history calculations", () => {
  it("handles empty and sparse weeks and trims only one tied extreme at each end", () => {
    expect(trimmedMean([null, null])).toBeNull();
    expect(trimmedMean([100, null])).toBe(100);
    expect(trimmedMean([100, 120])).toBe(110);
    expect(trimmedMean([100, 100, 110, 120, 120])).toBe(110);
  });

  it("retains every reading while respecting a workbook average exclusion", () => {
    const row = week("2020-01-06", [100, 110, 120, 130, 140, 150, 900]);
    row.averageDays = [0, 1, 2, 3, 4, 5];
    const points = buildWeightChart(fixture([row]));
    expect(points[6]).toMatchObject({
      date: "2020-01-12",
      weight: 900,
      weekly: 125,
      excludedFromWeekly: true,
      trailing: 130,
    });
  });

  it("uses partial weeks and bridges a missed day without creating a reading", () => {
    const points = buildWeightChart(
      fixture([
        week("2020-01-06", [100, 110, 120, 130, 140, 150, 160]),
        week("2020-01-13", [null, 110, 120, 130, 140, 150, 160]),
      ]),
    );
    expect(points[5]?.trailing).toBe(125);
    expect(points[6]?.trailing).toBe(130);
    expect(points[7]).toMatchObject({ weight: null, trendInterpolated: true });
    expect(points[7]?.trailing).not.toBeNull();
    expect(points[13]?.trailing).not.toBeNull();
  });

  it("inserts calendar gaps instead of connecting distant phases", () => {
    const points = buildWeightChart(
      fixture([
        week("2020-01-06", [100, null, null, null, null, null, null]),
        week("2020-01-20", [120, null, null, null, null, null, null]),
      ]),
    );
    expect(points).toHaveLength(21);
    expect(points[7]).toMatchObject({
      date: "2020-01-13",
      weight: null,
      weekly: null,
      target: null,
    });
  });

  it("preserves readings and separate plans when phase templates overlap", () => {
    const recorded = week("2020-01-06", [
      100,
      110,
      null,
      null,
      null,
      null,
      null,
    ]);
    const template = {
      ...week("2020-01-06", [null, null, 120, null, null, null, null]),
      phaseId: "template",
      target: 170,
    };
    const points = buildWeightChart(fixture([recorded, template]));
    expect(points.slice(0, 3).map((point) => point.weight)).toEqual([
      100, 110, 120,
    ]);
    expect(points[0]?.phaseSeries).toEqual({
      test: {
        weekly: 105,
        target: 150,
        originalTarget: null,
        projection: null,
      },
      template: {
        weekly: 120,
        target: 170,
        originalTarget: null,
        projection: null,
      },
    });
  });
});

describe("future workbook plan", () => {
  it("uses dated targets after the last reading without extending the observed trend", () => {
    const log = fixture([
      week("2020-01-06", [100, null, null, null, null, null, null]),
      {
        ...week("2020-01-13", [null, null, null, null, null, null, null]),
        target: 157,
      },
    ]);
    log.phases = [
      {
        id: "test",
        label: "Synthetic",
        kind: "bulk",
        start: "2020-01-06",
        end: "2020-01-19",
      },
    ];
    const points = buildWeightChart(log);
    expect(points[3]?.projectedWeight).toBe(153);
    expect(points[7]?.projectedWeight).toBe(157);
    expect(
      points
        .slice(1)
        .every((point) => point.weight === null && point.trailing === null),
    ).toBe(true);
  });
});
