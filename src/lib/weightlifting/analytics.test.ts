import { describe, expect, it } from "vitest";

import { type TrainingRow, computeTrainingAnalytics } from "./analytics";

const row = (
  iso: string,
  overrides: Partial<Omit<TrainingRow, "date">> = {},
): TrainingRow => ({
  date: new Date(iso),
  durationSeconds: 3600,
  volume: 10_000,
  sets: 20,
  ...overrides,
});

describe("computeTrainingAnalytics", () => {
  it("returns empty buckets and zero totals for no rows", () => {
    const result = computeTrainingAnalytics([]);
    expect(result.weekly).toEqual([]);
    expect(result.monthly).toEqual([]);
    expect(result.yearly).toEqual([]);
    expect(result.totals).toEqual({
      workouts: 0,
      volume: 0,
      hours: 0,
      sets: 0,
    });
  });

  it("keys weeks by their Monday", () => {
    // 2026-07-15 is a Wednesday → week of Monday 2026-07-13
    const result = computeTrainingAnalytics([row("2026-07-15T18:30:00Z")]);
    expect(result.weekly).toHaveLength(1);
    expect(result.weekly[0]!.period).toBe("2026-07-13");
  });

  it("keeps a Sunday in the week of the preceding Monday", () => {
    // 2026-07-19 is a Sunday → still Monday 2026-07-13
    const result = computeTrainingAnalytics([row("2026-07-19T09:00:00Z")]);
    expect(result.weekly[0]!.period).toBe("2026-07-13");
  });

  it("buckets by month and year", () => {
    const result = computeTrainingAnalytics([
      row("2026-01-15T10:00:00Z"),
      row("2026-02-20T10:00:00Z"),
      row("2025-12-31T10:00:00Z"),
    ]);
    expect(result.monthly.map((b) => b.period)).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(result.yearly.map((b) => b.period)).toEqual(["2025", "2026"]);
    expect(result.yearly[0]!.workouts).toBe(1);
    expect(result.yearly[1]!.workouts).toBe(2);
  });

  it("attributes dates by UTC day, not local time", () => {
    // 23:30 UTC on Dec 31 stays in 2025 regardless of local timezone
    const result = computeTrainingAnalytics([row("2025-12-31T23:30:00Z")]);
    expect(result.yearly).toHaveLength(1);
    expect(result.yearly[0]!.period).toBe("2025");
    expect(result.monthly[0]!.period).toBe("2025-12");
  });

  it("handles cardio workouts (zero volume, zero sets) without NaN", () => {
    const result = computeTrainingAnalytics([
      row("2026-03-01T10:00:00Z", { volume: 0, sets: 0 }),
    ]);
    expect(result.yearly[0]!.volume).toBe(0);
    expect(result.yearly[0]!.sets).toBe(0);
    expect(result.yearly[0]!.hours).toBe(1);
    expect(Number.isNaN(result.totals.volume)).toBe(false);
  });

  it("accumulates multiple workouts on the same day", () => {
    const result = computeTrainingAnalytics([
      row("2026-03-01T08:00:00Z", { volume: 5_000, sets: 10 }),
      row("2026-03-01T18:00:00Z", { volume: 7_000, sets: 15 }),
    ]);
    expect(result.monthly[0]!.workouts).toBe(2);
    expect(result.monthly[0]!.volume).toBe(12_000);
    expect(result.monthly[0]!.sets).toBe(25);
    expect(result.monthly[0]!.hours).toBe(2);
  });

  it("reconciles yearly buckets against totals", () => {
    const rows = [
      row("2024-05-01T10:00:00Z", { volume: 8_000, sets: 18 }),
      row("2025-06-01T10:00:00Z", { volume: 9_000, sets: 22 }),
      row("2025-07-01T10:00:00Z", { volume: 11_000, sets: 24 }),
    ];
    const result = computeTrainingAnalytics(rows);
    const summed = result.yearly.reduce(
      (acc, b) => ({
        workouts: acc.workouts + b.workouts,
        volume: acc.volume + b.volume,
        sets: acc.sets + b.sets,
      }),
      { workouts: 0, volume: 0, sets: 0 },
    );
    expect(summed.workouts).toBe(result.totals.workouts);
    expect(summed.volume).toBe(result.totals.volume);
    expect(summed.sets).toBe(result.totals.sets);
  });

  it("returns buckets sorted chronologically regardless of input order", () => {
    const result = computeTrainingAnalytics([
      row("2026-05-01T10:00:00Z"),
      row("2024-01-01T10:00:00Z"),
      row("2025-03-01T10:00:00Z"),
    ]);
    expect(result.yearly.map((b) => b.period)).toEqual([
      "2024",
      "2025",
      "2026",
    ]);
    const weeks = result.weekly.map((b) => b.period);
    expect(weeks).toEqual([...weeks].sort());
  });
});
