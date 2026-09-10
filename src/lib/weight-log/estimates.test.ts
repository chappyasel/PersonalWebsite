import { describe, expect, it } from "vitest";

import { bodyFatEstimates, fitPartition, weightTrend } from "./estimates";
import type { WeightLog } from "./schema";

const DAY = 86_400_000;
const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
const scan = (
  date: string,
  weight: number,
  bodyFatPercent: number,
): WeightLog["scans"][number] => ({
  date,
  weight,
  bodyFatPercent,
  leanMass: null,
  fatMass: (weight * bodyFatPercent) / 100,
});

describe("sparse weight trend", () => {
  it("supports sparse readings, trims extremes, and counts the actual samples", () => {
    const estimates = weightTrend(
      [100, null, 104, null, 900, null, 106].map((weight, index) => ({
        time: index * DAY,
        weight,
      })),
    );
    expect(estimates[0]).toEqual({
      value: 100,
      readings: 1,
      interpolated: false,
    });
    expect(estimates[2]?.value).toBe(102);
    expect(estimates[4]?.value).toBe(104);
    expect(estimates[6]).toEqual({
      value: 105,
      readings: 4,
      interpolated: false,
    });
    expect(estimates[1]).toMatchObject({ value: 101, interpolated: true });
  });
  it("leaves long gaps empty and never carries a trend into the future", () => {
    const inputs = Array.from({ length: 22 }, (_, index) => ({
      time: index * DAY,
      weight: index === 0 ? 100 : index === 20 ? 120 : null,
    }));
    const estimates = weightTrend(inputs);
    expect(estimates.slice(1, 20).every((point) => point.value === null)).toBe(
      true,
    );
    expect(estimates[20]?.value).toBe(120);
    expect(estimates[21]?.value).toBeNull();
  });
});

describe("DEXA-anchored body-fat heuristic", () => {
  const scans = [scan("2020-01-01", 100, 20), scan("2020-01-11", 120, 25)];
  it("matches reported scan percentages despite scale offsets and interpolates FFM", () => {
    const values = bodyFatEstimates(
      [
        { time: time("2020-01-01"), trailing: 95, projectedWeight: null },
        { time: time("2020-01-06"), trailing: 110, projectedWeight: null },
        { time: time("2020-01-11"), trailing: 115, projectedWeight: null },
      ],
      scans,
    );
    expect(values[0]?.measured).toBeCloseTo(20);
    expect(values[0]?.interpolated).toBeCloseTo(20);
    expect(values[1]?.interpolated).toBeCloseTo(100 * (1 - 85 / 115));
    expect(values[2]?.interpolated).toBeCloseTo(25);
  });
  it("does not fabricate estimates before the first scan or during a weight gap", () => {
    const values = bodyFatEstimates(
      [
        { time: time("2019-12-31"), trailing: 95, projectedWeight: null },
        { time: time("2020-01-06"), trailing: null, projectedWeight: null },
      ],
      scans,
    );
    expect(
      values.every((point) =>
        Object.values(point).every((value) => value === null),
      ),
    ).toBe(true);
  });
  it("keeps post-scan estimates and planned future values separate", () => {
    const values = bodyFatEstimates(
      [
        { time: time("2020-01-01"), trailing: 100, projectedWeight: null },
        { time: time("2020-01-02"), trailing: 105, projectedWeight: null },
        { time: time("2020-01-03"), trailing: null, projectedWeight: 120 },
      ],
      [scans[0]!],
    );
    // Too few intervals explicitly falls back to constant fat-free mass.
    expect(values[1]?.extrapolated).toBeCloseTo(100 * (1 - 80 / 105));
    expect(values[1]?.projected).toBeNull();
    expect(values[2]?.projected).toBeCloseTo(100 * (1 - 80 / 120));
    expect(values[2]?.extrapolated).toBeNull();
  });
  it("rejects impossible estimated compositions instead of clamping them", () => {
    const values = bodyFatEstimates(
      [{ time: time("2020-01-02"), trailing: null, projectedWeight: 50 }],
      [scans[0]!],
    );
    expect(values[0]?.projected).toBeNull();
  });
  it("fits separate median gain/loss partitions and excludes tiny/noisy intervals", () => {
    const model = fitPartition([
      scan("2020-01-01", 100, 20), // FFM 80
      scan("2020-02-01", 120, 25), // FFM 90, gain share .5
      scan("2020-03-01", 140, 30), // FFM 98, gain share .4
      scan("2020-04-01", 120, 25), // loss share .4
      scan("2020-05-01", 100, 20), // loss share .5
      scan("2020-06-01", 101, 10), // change too small
    ]);
    expect(model).toEqual({
      bulk: 0.45,
      cut: 0.45,
      bulkIntervals: 2,
      cutIntervals: 2,
    });
  });
});
