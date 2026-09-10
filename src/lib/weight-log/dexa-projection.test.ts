import { describe, expect, it } from "vitest";

import { projectDexaBulk } from "./dexa-projection";
import type { WeightLog } from "./schema";

const fixture = (): WeightLog["scans"] =>
  [
    [200, 150],
    [210, 152],
    [200, 149],
    [210, 153],
    [200, 148],
    [210, 154],
  ].map(([weight, leanMass], index) => ({
    date: `2020-0${index + 1}-01`,
    weight: weight!,
    leanMass: leanMass!,
    fatMass: weight! - leanMass! - 10,
    bodyFatPercent: null,
  }));

describe("current bulk projection", () => {
  it("matches the enumerable bootstrap distribution for three separate bulks", () => {
    const result = projectDexaBulk(fixture()).projection!;
    // The 81 equally likely mean-plus-residual combinations for fractions
    // [0.2, 0.4, 0.6] have 2.5%, 50%, 97.5% quantiles 1/15, 0.4, 11/15.
    expect(result).toMatchObject({
      target: 240,
      intervals: 3,
      blocks: 3,
      simulations: 20000,
    });
    expect(result.lowerFraction).toBeCloseTo(1 / 15);
    expect(result.medianFraction).toBeCloseTo(0.4);
    expect(result.upperFraction).toBeCloseTo(11 / 15);
    expect(result.lower).toBeCloseTo(156);
    expect(result.expected).toBeCloseTo(166);
    expect(result.upper).toBeCloseTo(176);
  });

  it("keeps the same seeded forecast on rerenders and sorts inputs without mutation", () => {
    const scans = fixture().reverse();
    const copy = structuredClone(scans);
    expect(projectDexaBulk(scans)).toEqual(projectDexaBulk(fixture()));
    expect(scans).toEqual(copy);
  });

  it("scales the interval with gain from the measured anchor", () => {
    const near = projectDexaBulk(fixture(), 225).projection!;
    const far = projectDexaBulk(fixture(), 240).projection!;
    expect(far.expected - far.anchor.leanMass).toBeCloseTo(
      2 * (near.expected - near.anchor.leanMass),
    );
    expect(far.upper - far.lower).toBeCloseTo(2 * (near.upper - near.lower));
  });

  it("does not count consecutive bulks sharing a scan as independent groups", () => {
    const scans = fixture().slice(0, 4);
    scans.push({
      ...scans[3]!,
      date: "2020-05-01",
      weight: 220,
      leanMass: 158,
    });
    const result = projectDexaBulk(scans);
    expect(result.projection).toBeNull();
    expect(result.reason).toContain("3 intervals in 2 groups");
  });

  it("requires a complete latest anchor and a forward target within the cap", () => {
    expect(projectDexaBulk([]).projection).toBeNull();
    const scans = fixture();
    scans.at(-1)!.leanMass = null;
    expect(projectDexaBulk(scans).reason).toContain("latest DEXA scan");
    expect(projectDexaBulk(fixture(), 210).projection).toBeNull();
    expect(projectDexaBulk(fixture(), 271).reason).toContain("60 lb");
    expect(projectDexaBulk(fixture(), NaN).projection).toBeNull();
  });

  it("excludes tiny gains, missing lean mass and year-long gaps without bridging scans", () => {
    const tiny = fixture();
    tiny[1]!.weight = 201;
    expect(projectDexaBulk(tiny).projection).toBeNull();
    const missing = fixture();
    missing[1]!.leanMass = null;
    expect(projectDexaBulk(missing).projection).toBeNull();
    const gap = fixture();
    gap.at(-1)!.date = "2022-01-01";
    expect(projectDexaBulk(gap).projection).toBeNull();
  });

  it("does not invent uncertainty from identical observed gain fractions", () => {
    const scans = fixture();
    for (let index = 1; index < scans.length; index += 2)
      scans[index]!.leanMass = scans[index - 1]!.leanMass! + 5;
    const result = projectDexaBulk(scans);
    expect(result.projection).toBeNull();
    expect(result.reason).toContain("too little variation");
  });
});
