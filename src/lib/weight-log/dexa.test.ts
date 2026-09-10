import { describe, expect, it } from "vitest";

import { buildDexaAnalysis } from "./dexa";
import type { WeightLog } from "./schema";

const scan = (
  date: string,
  weight: number,
  leanMass: number | null,
  fatMass: number | null = 20,
): WeightLog["scans"][number] => ({
  date,
  weight,
  leanMass,
  fatMass,
  bodyFatPercent: 15,
});

describe("DEXA lean mass trajectory", () => {
  it("fits lean soft tissue against weight with signed residuals and R²", () => {
    const result = buildDexaAnalysis([
      scan("2020-01-01", 100, 70),
      scan("2020-02-01", 110, 80),
      scan("2020-03-01", 120, 80),
    ]);
    expect(result.trend?.slope).toBeCloseTo(0.5);
    expect(result.trend?.intercept).toBeCloseTo(65 / 3);
    expect(result.rSquared).toBeCloseTo(0.75);
    expect(result.points[0]?.residual).toBeCloseTo(-5 / 3);
    expect(result.points[1]?.residual).toBeCloseTo(10 / 3);
    expect(result.points[2]?.residual).toBeCloseTo(-5 / 3);
  });

  it("orders scans before computing bulk and cut efficiency", () => {
    const result = buildDexaAnalysis([
      scan("2020-03-01", 110, 77),
      scan("2020-01-01", 100, 70),
      scan("2020-02-01", 120, 80),
    ]);
    expect(result.points.map((point) => point.number)).toEqual([1, 2, 3]);
    expect(result.points[0]?.efficiency).toBeNull();
    expect(result.points[1]).toMatchObject({
      direction: "bulk",
      efficiency: 0.5,
    });
    expect(result.points[2]).toMatchObject({
      direction: "cut",
      efficiency: 0.7,
    });
    // A date-filtered view keeps the original interval and regression residual.
    expect(
      result.points.find((point) => point.date >= "2020-03-01"),
    ).toMatchObject({
      number: 3,
      efficiency: 0.7,
      residual: result.points[2]!.residual,
    });
  });

  it("leaves gaps for missing lean mass and avoids ratios at equal weights", () => {
    const result = buildDexaAnalysis([
      scan("2020-01-01", 100, 70),
      scan("2020-02-01", 110, null),
      scan("2020-03-01", 120, 80),
      scan("2020-04-01", 120, 82),
    ]);
    expect(result.points.map((point) => point.number)).toEqual([1, 3, 4]);
    expect(result.points.map((point) => point.efficiency)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("omits undefined fits and R² for empty, single, or constant measurements", () => {
    expect(buildDexaAnalysis([])).toMatchObject({
      points: [],
      trend: null,
      rSquared: null,
      boneMass: null,
    });
    expect(buildDexaAnalysis([scan("2020-01-01", 100, 70)]).trend).toBeNull();
    expect(
      buildDexaAnalysis([
        scan("2020-01-01", 100, 70),
        scan("2020-02-01", 100, 80),
      ]).trend,
    ).toBeNull();
    expect(
      buildDexaAnalysis([
        scan("2020-01-01", 100, 70),
        scan("2020-02-01", 110, 70),
      ]).rSquared,
    ).toBeNull();
  });

  it("derives the bone reference from latest mass components, ignoring percentage overrides", () => {
    expect(
      buildDexaAnalysis([
        { ...scan("2020-01-01", 100, 70), bodyFatPercent: 40 },
      ]).boneMass,
    ).toBe(10);
    expect(
      buildDexaAnalysis([
        scan("2020-01-01", 100, 70),
        scan("2020-02-01", 110, 80, null),
      ]).boneMass,
    ).toBeNull();
    expect(
      buildDexaAnalysis([scan("2020-01-01", 100, 90)]).boneMass,
    ).toBeNull();
  });
});
