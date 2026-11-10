import { describe, expect, it } from "vitest";

import { lastWeighInBefore, relativeDayLabel } from "./entry";

// Invented numbers. None of them is the owner's.

describe("relativeDayLabel", () => {
  it("names today and yesterday", () => {
    expect(relativeDayLabel("2030-01-09", "2030-01-09")).toBe("Today");
    expect(relativeDayLabel("2030-01-08", "2030-01-09")).toBe("Yesterday");
    expect(relativeDayLabel("2029-12-31", "2030-01-01")).toBe("Yesterday");
  });

  it("shows an older date short, with the year only when it differs", () => {
    expect(relativeDayLabel("2030-01-07", "2030-01-09")).toBe("Mon, Jan 7");
    expect(relativeDayLabel("2029-12-30", "2030-01-01")).toBe(
      "Sun, Dec 30, 2029",
    );
  });
});

describe("lastWeighInBefore", () => {
  const before = { date: "2030-01-04", pounds: 99 };
  const week = (weights: (number | null)[], excludedDays: number[] = []) => ({
    week: "2030-01-07",
    weights,
    excludedDays,
  });

  it("takes the latest weigh-in earlier in the same week", () => {
    expect(
      lastWeighInBefore(
        "2030-01-10",
        week([100, 100.4, null, 101, 102, null, null]),
        before,
      ),
    ).toEqual({ date: "2030-01-08", pounds: 100.4 });
  });

  it("skips an excluded weigh-in", () => {
    expect(
      lastWeighInBefore(
        "2030-01-10",
        week([100, 130, null, null, null, null, null], [1]),
        before,
      ),
    ).toEqual({ date: "2030-01-07", pounds: 100 });
  });

  it("falls back to the weigh-in before the week, or nothing", () => {
    const blank = week([null, null, null, null, null, null, null]);
    expect(lastWeighInBefore("2030-01-07", blank, before)).toEqual(before);
    expect(
      lastWeighInBefore(
        "2030-01-07",
        week([100, null, null, null, null, null, null]),
        before,
      ),
    ).toEqual(before);
    expect(lastWeighInBefore("2030-01-09", blank, null)).toBeNull();
  });
});
