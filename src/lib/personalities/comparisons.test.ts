import { describe, expect, it } from "vitest";

import { assessmentTime, traitDifferences } from "./comparisons";

describe("direct comparisons and dated history", () => {
  it("keeps differences directional and excludes missing or invalid totals", () => {
    const a = { Openness: 60, Extraversion: 90, Agreeableness: NaN };
    const b = {
      Openness: 72,
      Extraversion: 70,
      Conscientiousness: 80,
      Agreeableness: 40,
    };
    expect(traitDifferences(a, b).map((d) => [d.trait, d.delta])).toEqual([
      ["Openness", 12],
      ["Extraversion", -20],
    ]);
    expect(traitDifferences(b, a).map((d) => d.delta)).toEqual([-12, 20]);
  });
  it("uses a UTC mid-month plotting position for month-only dates", () => {
    expect(assessmentTime("2025-08")).toBe(Date.UTC(2025, 7, 15, 12));
    expect(assessmentTime("2025-08-05")).toBe(Date.UTC(2025, 7, 5, 12));
    expect(assessmentTime(null)).toBeNull();
    expect(assessmentTime("bad-date")).toBeNull();
    expect(assessmentTime("2025-08-06")! - assessmentTime("2025-08-05")!).toBe(
      86400000,
    );
  });
});
