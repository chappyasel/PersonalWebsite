import { describe, expect, it } from "vitest";

import {
  type Assessment,
  type Scores,
  chronological,
  comparable,
  norms,
} from "./data";
import { resultCode, takenOn, validateAssessment } from "./validation";
import {
  aggregateDistance,
  profileDistance,
} from "~/app/personalities/compare/model";

const middle: Scores = {
  Openness: 79.2,
  Conscientiousness: 85.2,
  Extraversion: 73.2,
  Agreeableness: 87.6,
  Neuroticism: 57.6,
};
describe("personality comparisons and history", () => {
  it("does not cancel opposite signed deviations", () => {
    const scores: Scores = {
      Openness: 93.6,
      Conscientiousness: 64.8,
      Extraversion: 93.6,
      Agreeableness: 73.2,
      Neuroticism: 79.2,
    };
    expect(aggregateDistance(middle, norms)).toBe(0);
    expect(aggregateDistance(scores, norms)).toBeCloseTo(1);
    expect(profileDistance(scores, middle, norms)).toBeCloseTo(1);
    expect(profileDistance(middle, scores, norms)).toBeCloseTo(1);
    expect(aggregateDistance({ Openness: 60 }, norms)).toBeUndefined();
  });
  it("keeps unknown dates and percentiles out of newest raw-score selection", () => {
    const raw = {
      id: "raw",
      personId: "person",
      takenOn: "2024-06-01",
      addedAt: "2024-06-01",
      source: "manual",
      externalResultId: null,
      sourceReference: null,
      testVersion: "ipip-120",
      scoreKind: "raw",
      scoreMax: 120,
      scores: middle,
      facets: [],
      notes: "",
    } as Assessment;
    const undated = {
      ...raw,
      id: "undated",
      takenOn: null,
      addedAt: "2026-01-01",
    };
    expect([undated, raw].sort(chronological)[0]).toBe(raw);
    expect(comparable({ ...raw, scoreKind: "percentile", scoreMax: 100 })).toBe(
      false,
    );
    expect(takenOn("2021-12")).toBe("2021-12");
    expect(() => takenOn("2023-02-29")).toThrow();
    expect(() =>
      validateAssessment({ ...raw, scores: { ...middle, Openness: 121 } }),
    ).toThrow();
  });
  it("rejects arbitrary import hosts", () => {
    expect(resultCode("abcdef0123456789abcdef01")).toBe(
      "abcdef0123456789abcdef01",
    );
    expect(() =>
      resultCode("https://localhost/result/abcdef0123456789abcdef01"),
    ).toThrow();
    expect(() =>
      resultCode(
        "https://bigfive-test.com.evil.test/result/abcdef0123456789abcdef01",
      ),
    ).toThrow();
  });
});
