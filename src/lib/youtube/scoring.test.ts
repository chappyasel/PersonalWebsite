import { describe, expect, it } from "vitest";

import {
  aggregateWeightedScore,
  isWholeScore,
  learningValueScore,
  positivityScore,
} from "./scoring";

describe("YouTube scoring", () => {
  it("accepts only whole 0-10 scores", () => {
    expect(isWholeScore(0)).toBe(true);
    expect(isWholeScore(10)).toBe(true);
    expect(isWholeScore(5.5)).toBe(false);
    expect(isWholeScore(11)).toBe(false);
  });

  it("lets rigorous timely content score highly without high durability", () => {
    expect(learningValueScore({ depth: 9, relevance: 10, durability: 3 })).toBe(
      8,
    );
  });

  it("keeps arousal out of positivity", () => {
    const calm = positivityScore({
      positiveAffect: 7,
      negativeAffect: 1,
      optimism: 8,
      arousal: 0,
    });
    const intense = positivityScore({
      positiveAffect: 7,
      negativeAffect: 1,
      optimism: 8,
      arousal: 10,
    });
    expect(calm).toBe(intense);
  });

  it("weights by exposure and leaves unscored exposure out of the score", () => {
    const result = aggregateWeightedScore([
      { exposureSeconds: 100, score: 10 },
      { exposureSeconds: 900, score: 0 },
      { exposureSeconds: 1000, score: null },
    ]);
    expect(result.score).toBe(1);
    expect(result.coverage).toBe(0.5);
  });

  it("treats a zero score as covered", () => {
    expect(aggregateWeightedScore([{ exposureSeconds: 60, score: 0 }])).toEqual(
      { score: 0, coverage: 1, totalExposureSeconds: 60 },
    );
  });
});
