import { describe, expect, it } from "vitest";

import type { WeightLog } from "~/lib/weight-log/schema";

import {
  type Attempt,
  buildParetoPayload,
  calendarDay,
  createBodyweightEstimator,
  dailyWeighIns,
  dateAtDay,
  dominates,
  evaluateAttempts,
  verifyParetoPayload,
} from "./analysis";

const readings = [
  { date: "2024-01-01", weight: 100 },
  { date: "2024-01-15", weight: 128 },
];
const log: WeightLog = {
  version: 1,
  importedAt: "2024-01-15T00:00:00Z",
  sourceModifiedAt: "2024-01-15T00:00:00Z",
  setPoints: [],
  phases: [],
  scans: [],
  weeks: [
    {
      date: "2024-01-01",
      phaseId: "a",
      weights: [100, null, null, null, null, null, null],
      averageDays: [0],
      target: 900,
      originalTarget: 800,
    },
    {
      date: "2024-01-15",
      phaseId: "a",
      weights: [128, null, null, null, null, null, null],
      averageDays: [0],
      target: 900,
      originalTarget: 800,
    },
  ],
};
const attempt = (date: string, oneRM: number): Attempt => ({
  date,
  oneRM,
  weight: null,
  reps: null,
});

describe("calendar bodyweight estimates", () => {
  it("interpolates calendar days continuously through Sunday and Monday", () => {
    const estimate = createBodyweightEstimator(readings);
    expect(estimate("2024-01-07")).toMatchObject({
      bodyweight: 112,
      method: "interpolated",
      smoothing: "centered",
      distanceDays: 6,
      confidence: "high",
    });
    expect(estimate("2024-01-08").bodyweight).toBe(114);
  });
  it("smooths measurements as well as gaps, with a leading historical edge", () => {
    const estimate = createBodyweightEstimator(readings);
    expect(estimate("2024-01-01")).toMatchObject({
      bodyweight: 106,
      method: "measured",
      smoothing: "leading",
      distanceDays: 0,
    });
    const spike = createBodyweightEstimator(
      Array.from({ length: 15 }, (_, i) => ({
        date: dateAtDay(calendarDay("2024-01-01") + i),
        weight: i === 7 ? 170 : 100,
      })),
    );
    expect(spike("2024-01-08").bodyweight).toBe(110);
  });
  it("uses a trailing seven-day arithmetic average for the last three days", () => {
    const estimate = createBodyweightEstimator(readings);
    expect(estimate("2024-01-12")).toMatchObject({
      bodyweight: 122,
      smoothing: "centered",
    });
    expect(estimate("2024-01-13")).toMatchObject({
      bodyweight: 118,
      smoothing: "trailing",
    });
    expect(estimate("2024-01-15")).toMatchObject({
      bodyweight: 122,
      smoothing: "trailing",
    });
  });
  it("carries actual boundary weights and always labels them low confidence", () => {
    const estimate = createBodyweightEstimator(readings);
    expect(estimate("2023-12-31")).toEqual({
      bodyweight: 100,
      method: "carried",
      smoothing: "boundary",
      distanceDays: 1,
      confidence: "low",
    });
    expect(estimate("2024-01-16")).toMatchObject({
      bodyweight: 128,
      method: "carried",
      confidence: "low",
    });
    expect(estimate("2017-01-01").bodyweight).toBe(100);
  });
  it("assigns confidence using nearest real readings, including band boundaries", () => {
    const start = calendarDay("2024-01-01");
    const estimate = createBodyweightEstimator([
      { date: dateAtDay(start), weight: 100 },
      { date: dateAtDay(start + 100), weight: 200 },
    ]);
    for (const [distance, confidence] of [
      [7, "high"],
      [8, "medium"],
      [21, "medium"],
      [22, "low"],
    ] as const)
      expect(estimate(dateAtDay(start + distance))).toMatchObject({
        distanceDays: distance,
        confidence,
      });
  });
  it("handles a single reading and rejects empty, conflicting, or invalid inputs", () => {
    const estimate = createBodyweightEstimator([readings[0]!]);
    expect(estimate("2024-01-01").bodyweight).toBe(100);
    expect(estimate("2024-01-02").confidence).toBe("low");
    expect(() => createBodyweightEstimator([])).toThrow(/No actual/);
    expect(() =>
      createBodyweightEstimator([
        readings[0]!,
        { ...readings[0]!, weight: 101 },
      ]),
    ).toThrow(/Conflicting/);
    expect(() =>
      createBodyweightEstimator([{ date: "2024-02-30", weight: 100 }]),
    ).toThrow(/Invalid calendar/);
    expect(() =>
      createBodyweightEstimator([{ date: "2024-01-01", weight: NaN }]),
    ).toThrow(/Invalid weigh/);
  });
  it("uses recorded daily cells regardless of weekly exclusions and never targets", () => {
    const weeks = [
      { ...log.weeks[0]!, weights: [100, null, null, null, null, null, 112] },
      {
        ...log.weeks[1]!,
        date: "2024-01-08",
        weights: [114, null, null, null, null, null, null],
      },
    ];
    expect(dailyWeighIns({ weeks })).toEqual([
      { date: "2024-01-01", weight: 100 },
      { date: "2024-01-07", weight: 112 },
      { date: "2024-01-08", weight: 114 },
    ]);
  });
});

describe("all-attempt strict Pareto dominance", () => {
  it("retains duplicate frontier coordinates but rejects ties at heavier bodyweight", () => {
    const estimate = (date: string) => ({
      bodyweight: Number(date),
      method: "measured" as const,
      smoothing: "centered" as const,
      confidence: "high" as const,
      distanceDays: 0,
    });
    const points = evaluateAttempts(
      [
        attempt("100", 200),
        attempt("100", 200),
        attempt("101", 200),
        attempt("100", 199),
        attempt("102", 201),
      ],
      estimate,
    );
    expect(points.map((point) => point.frontier)).toEqual([
      true,
      true,
      false,
      false,
      true,
    ]);
    expect(dominates(points[0]!, points[1]!)).toBe(false);
  });
  it("matches an independent pairwise oracle across unsorted duplicate points", () => {
    const estimate = (date: string) => ({
      bodyweight: Number(date),
      method: "measured" as const,
      smoothing: "centered" as const,
      confidence: "high" as const,
      distanceDays: 0,
    });
    const points = evaluateAttempts(
      Array.from({ length: 150 }, (_, i) =>
        attempt(String(100 + ((i * 17) % 23)), 100 + ((i * 31) % 37)),
      ),
      estimate,
    );
    for (const p of points)
      expect(p.frontier).toBe(
        !points.some(
          (q) =>
            q.bodyweight <= p.bodyweight &&
            q.oneRM >= p.oneRM &&
            (q.bodyweight < p.bodyweight || q.oneRM > p.oneRM),
        ),
      );
  });
  it("estimates every valid attempt before cropping and highlights the latest day's best", () => {
    const attempts = [
      attempt("2017-01-01", 90),
      attempt("2024-01-08", 200),
      attempt("2024-01-15", 200),
      attempt("2024-01-15", 100),
    ];
    const payload = buildParetoPayload(
      attempts,
      log,
      { displayName: "Synthetic lift", floor: 300 },
      null,
      "2024-01-15T00:00:00Z",
    );
    expect(payload.points).toHaveLength(4);
    expect(payload.unestimatedCount).toBe(0);
    expect(payload.latest).toMatchObject({
      date: "2024-01-15",
      oneRM: 200,
      frontier: false,
    });
    expect(payload.dominator).toMatchObject({ date: "2024-01-08", oneRM: 200 });
    expect(payload.confidenceCounts.low).toBe(1);
    expect(() =>
      verifyParetoPayload({ ...payload, evaluatedCount: 3 }),
    ).toThrow();
  });
  it("does not copy extra source fields into the public payload", () => {
    const source = {
      ...attempt("2024-01-08", 200),
      workoutUuid: "private",
      note: "private",
    };
    const [point] = evaluateAttempts(
      [source],
      createBodyweightEstimator(readings),
    );
    expect(point).not.toHaveProperty("workoutUuid");
    expect(point).not.toHaveProperty("note");
  });
});
