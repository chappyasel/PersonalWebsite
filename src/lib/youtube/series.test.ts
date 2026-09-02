import { describe, expect, it } from "vitest";

import { enumeratePeriods, seriesPeriods } from "./series";

describe("enumeratePeriods", () => {
  it("steps by the group size", () => {
    expect(enumeratePeriods("2026-08-24", "2026-08-27", "day")).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
    ]);
    expect(enumeratePeriods("2026-08-03", "2026-08-24", "week")).toEqual([
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
      "2026-08-24",
    ]);
    expect(enumeratePeriods("2026-01-01", "2026-10-01", "quarter")).toEqual([
      "2026-01-01",
      "2026-04-01",
      "2026-07-01",
      "2026-10-01",
    ]);
  });
});

describe("seriesPeriods", () => {
  const groupBy = "day" as const;

  it("carries the window past the last watch to the coverage boundary", () => {
    expect(
      seriesPeriods({
        dataPeriods: ["2026-08-24", "2026-08-25"],
        groupBy,
        rangeStartKey: null,
        coverageKey: "2026-08-30",
      }),
    ).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
  });

  it("stops at the boundary rather than running to today", () => {
    const periods = seriesPeriods({
      dataPeriods: ["2026-08-25"],
      groupBy,
      rangeStartKey: "2026-08-24",
      coverageKey: "2026-08-30",
    });
    expect(periods.at(-1)).toBe("2026-08-30");
  });

  it("opens at the range start even when watching began later", () => {
    expect(
      seriesPeriods({
        dataPeriods: ["2026-08-29"],
        groupBy,
        rangeStartKey: "2026-08-27",
        coverageKey: "2026-08-30",
      }),
    ).toEqual(["2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"]);
  });

  it("plots an empty window as zeros when the range is covered", () => {
    expect(
      seriesPeriods({
        dataPeriods: [],
        groupBy,
        rangeStartKey: "2026-08-28",
        coverageKey: "2026-08-30",
      }),
    ).toEqual(["2026-08-28", "2026-08-29", "2026-08-30"]);
  });

  it("never truncates a period that has watch events", () => {
    expect(
      seriesPeriods({
        dataPeriods: ["2026-08-25", "2026-09-01"],
        groupBy,
        rangeStartKey: null,
        coverageKey: "2026-08-30",
      }).at(-1),
    ).toBe("2026-09-01");
  });

  it("falls back to the data's own extent with no boundary", () => {
    expect(
      seriesPeriods({
        dataPeriods: ["2026-08-25", "2026-08-27"],
        groupBy,
        rangeStartKey: null,
        coverageKey: null,
      }),
    ).toEqual(["2026-08-25", "2026-08-26", "2026-08-27"]);
  });

  it("returns nothing when the boundary predates the range", () => {
    expect(
      seriesPeriods({
        dataPeriods: [],
        groupBy,
        rangeStartKey: "2026-08-28",
        coverageKey: "2026-07-01",
      }),
    ).toEqual([]);
  });
});
