import { describe, expect, it } from "vitest";

import {
  type InformationDietPeriod,
  scoreBand,
  smoothInformationDietTrend,
} from "./dashboard";

function period(
  exposure: number,
  learning: number | null,
  learningCoverage: number | null,
  positivity = learning,
  positivityCoverage = learningCoverage,
): InformationDietPeriod {
  return {
    estimatedExposureHours: exposure,
    learningValue: learning,
    learningCoverage,
    positivity,
    positivityCoverage,
  };
}

describe("smoothInformationDietTrend", () => {
  it("uses a trailing window and never includes future values", () => {
    const result = smoothInformationDietTrend(
      [period(1, 1, 1), period(3, 3, 1), period(100, 10, 1)],
      2,
    );

    expect(result[0]?.estimatedExposureHoursSmoothed).toBe(1);
    expect(result[1]?.estimatedExposureHoursSmoothed).toBe(2);
    expect(result[1]?.learningValueSmoothed).toBe(2.5);
    expect(result[2]?.estimatedExposureHoursSmoothed).toBe(51.5);
  });

  it("uses partial windows at the beginning", () => {
    const result = smoothInformationDietTrend(
      [period(2, 4, 1), period(4, 8, 1)],
      7,
    );

    expect(result[0]?.estimatedExposureHoursSmoothed).toBe(2);
    expect(result[1]?.estimatedExposureHoursSmoothed).toBe(3);
    expect(result[1]?.learningValueSmoothed).toBeCloseTo(20 / 3);
  });

  it("includes zero-watch periods in the watch-time mean", () => {
    const result = smoothInformationDietTrend(
      [period(6, 6, 1), period(0, null, null), period(3, 3, 1)],
      3,
    );

    expect(result[2]?.estimatedExposureHoursSmoothed).toBe(3);
    expect(result[2]?.learningValueSmoothed).toBe(5);
  });

  it("keeps scores and coverage null when a window has no exposure or scores", () => {
    const result = smoothInformationDietTrend(
      [period(0, null, null), period(2, null, 0)],
      2,
    );

    expect(result[0]?.learningValueSmoothed).toBeNull();
    expect(result[0]?.learningCoverageSmoothed).toBeNull();
    expect(result[1]?.learningValueSmoothed).toBeNull();
    expect(result[1]?.learningCoverageSmoothed).toBe(0);
  });

  it("weights each score by exposure times coverage", () => {
    const result = smoothInformationDietTrend(
      [period(10, 10, 0.2), period(2, 0, 1, 4, 0.5)],
      2,
    )[1]!;

    expect(result.learningValueSmoothed).toBe(5);
    expect(result.learningCoverageSmoothed).toBeCloseTo(4 / 12);
    expect(result.positivitySmoothed).toBeCloseTo((10 * 2 + 4) / 3);
    expect(result.positivityCoverageSmoothed).toBeCloseTo(3 / 12);
  });
});

describe("scoreBand", () => {
  it.each([
    [null, "unscored"],
    [0, "low"],
    [3, "low"],
    [3.99, "low"],
    [4, "middle"],
    [6, "middle"],
    [6.99, "middle"],
    [7, "high"],
    [10, "high"],
  ] as const)("maps %s to %s", (score, expected) => {
    expect(scoreBand(score)).toBe(expected);
  });
});
