import { describe, expect, it } from "vitest";

import {
  type InformationDietPeriod,
  barSparkline,
  describePercentile,
  lineSparkline,
  percentileOfLatest,
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

describe("barSparkline", () => {
  it("scales to the tallest day", () => {
    const { bars } = barSparkline([
      { date: "2026-08-01", hours: 4 },
      { date: "2026-08-02", hours: 2 },
    ]);
    expect(bars[0]).toEqual({ date: "2026-08-01", height: 20, watched: true });
    expect(bars[1]).toEqual({ date: "2026-08-02", height: 10, watched: true });
  });

  it("draws a zero-watch day as a baseline tick, not a gap", () => {
    const { bars } = barSparkline([
      { date: "2026-08-01", hours: 3 },
      { date: "2026-08-02", hours: 0 },
    ]);
    expect(bars[1]).toEqual({ date: "2026-08-02", height: 1, watched: false });
  });

  it("keeps a short day visible as a bar", () => {
    const { bars } = barSparkline([
      { date: "2026-08-01", hours: 100 },
      { date: "2026-08-02", hours: 0.01 },
    ]);
    expect(bars[1]?.height).toBe(1.5);
    expect(bars[1]?.watched).toBe(true);
  });

  it("survives a window with no watching at all", () => {
    const { bars, referenceY } = barSparkline([
      { date: "2026-08-01", hours: 0 },
      { date: "2026-08-02", hours: 0 },
    ]);
    expect(bars.every((bar) => bar.height === 1 && !bar.watched)).toBe(true);
    expect(referenceY).toBeNull();
  });

  it("keeps a reference above the data inside the box", () => {
    const { bars, referenceY } = barSparkline(
      [
        { date: "2026-08-01", hours: 1 },
        { date: "2026-08-02", hours: 2 },
      ],
      { reference: 4 },
    );
    // The reference is the tallest thing, so the bars scale under it — but it
    // keeps headroom rather than sitting on the frame.
    expect(referenceY).toBeGreaterThan(0);
    expect(referenceY).toBeLessThan(4);
    expect(bars[1]?.height).toBeLessThan(10);
    expect(bars[1]!.height).toBeGreaterThan(bars[0]!.height);
  });

  it("has no reference line without a reference", () => {
    expect(
      barSparkline([{ date: "2026-08-01", hours: 3 }]).referenceY,
    ).toBeNull();
  });
});

describe("lineSparkline", () => {
  it("breaks the path where the score is undefined", () => {
    const { segments } = lineSparkline([5, 6, null, 4, 5]);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.startsWith("M")).toBe(true);
  });

  it("gives a lone point somewhere to draw", () => {
    const { segments } = lineSparkline([null, 5, null]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toContain("L");
  });

  it("returns nothing when no day has a score", () => {
    expect(lineSparkline([null, null])).toEqual({
      segments: [],
      referenceY: null,
    });
  });

  it("puts the reference inside the drawn band", () => {
    const { referenceY } = lineSparkline([5, 6], {
      reference: 2,
      viewBoxHeight: 20,
    });
    expect(referenceY).toBeGreaterThan(0);
    expect(referenceY).toBeLessThanOrEqual(20);
  });

  it("does not divide by zero on a flat window", () => {
    const { segments } = lineSparkline([5, 5, 5]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).not.toContain("NaN");
  });
});

describe("percentileOfLatest", () => {
  it("places the newest point in its own series", () => {
    expect(percentileOfLatest([1, 2, 3, 4, 5])).toMatchObject({
      latest: 5,
      percentile: 1,
      sampleSize: 5,
      isHighest: true,
      isLowest: false,
    });
  });

  it("does not call a tied value a record", () => {
    // Zero-watch days tie constantly; "the lowest" would read as news.
    expect(percentileOfLatest([0, 3, 2, 4, 0])).toMatchObject({
      isLowest: false,
      isHighest: false,
    });
  });

  it("counts ties as at or below", () => {
    expect(percentileOfLatest([5, 1, 2, 3, 5])?.percentile).toBe(1);
    expect(percentileOfLatest([9, 9, 9, 9, 1])?.percentile).toBe(0.2);
  });

  it("drops the partial-window lead-in", () => {
    // Without the skip the two warm-up points would pad the population.
    expect(
      percentileOfLatest([100, 100, 1, 2, 3, 4, 5], { skip: 2 }),
    ).toMatchObject({ latest: 5, percentile: 1, sampleSize: 5 });
  });

  it("declines to rank against too few points", () => {
    expect(percentileOfLatest([1, 2, 3])).toBeNull();
  });

  it("ignores gaps in the series", () => {
    const result = percentileOfLatest([1, null, 2, null, 3, 4, 5]);
    expect(result?.sampleSize).toBe(5);
  });

  it("has nothing to say about an empty series", () => {
    expect(percentileOfLatest([null, null])).toBeNull();
  });
});

describe("describePercentile", () => {
  it("flips to the informative direction", () => {
    expect(describePercentile(0.07, "days shown")).toBe(
      "lower than 93% of days shown",
    );
    expect(describePercentile(0.93, "days shown")).toBe(
      "higher than 93% of days shown",
    );
  });

  it("names a record instead of claiming 100%", () => {
    expect(describePercentile(1, "the last year", { isHighest: true })).toBe(
      "the highest of the last year",
    );
  });

  it("never prints 100% for a non-record", () => {
    expect(describePercentile(0.998, "all time")).toBe(
      "higher than 99% of all time",
    );
    expect(describePercentile(0.002, "all time")).toBe(
      "lower than 99% of all time",
    );
  });

  it("says nothing without a percentile", () => {
    expect(describePercentile(null, "days shown")).toBeNull();
  });
});
