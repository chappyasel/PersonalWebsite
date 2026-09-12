import { describe, expect, it } from "vitest";

import { type Scores, traits } from "./data";
import { personalityPca } from "./pca";

const row = (id: number, values: number[]) => ({
  id: String(id),
  scores: Object.fromEntries(
    traits.map((trait, j) => [trait, values[j]]),
  ) as Scores,
});

describe("personality PCA", () => {
  it("recovers a known rank-one axis, including opposite trait directions", () => {
    const data = [-2, -1, 0, 1, 2].map((x, i) =>
      row(i, [60 + x, 70 + 2 * x, 80 - x, 90 + 3 * x, 50 - 2 * x]),
    );
    const result = personalityPca(data)!;
    expect(result.components[0]!.explained).toBeCloseTo(1, 10);
    expect(result.components[1]!.variance).toBeCloseTo(0, 10);
    const c = result.components[0]!.coefficients;
    c.forEach((value) =>
      expect(Math.abs(value)).toBeCloseTo(1 / Math.sqrt(5), 10),
    );
    expect(c[0]! * c[2]!).toBeLessThan(0);
  });

  it("produces uncorrelated axes and preserves full-dimensional distances", () => {
    const data = Array.from({ length: 20 }, (_, i) =>
      row(i, [
        40 + i,
        50 + ((i * 7) % 23),
        65 + ((i * 3) % 17),
        50 + ((i * 11) % 29),
        40 + ((i * 5) % 31),
      ]),
    );
    const result = personalityPca(data)!;
    expect(
      result.components.reduce((sum, c) => sum + c.explained, 0),
    ).toBeCloseTo(1, 10);
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const covariance =
          result.points.reduce(
            (sum, p) => sum + p.coordinates[i]! * p.coordinates[j]!,
            0,
          ) /
          (data.length - 1);
        expect(covariance).toBeCloseTo(
          i === j ? result.components[i]!.variance : 0,
          9,
        );
      }
    }
    const actual = result.points[0]!.coordinates.reduce(
      (sum, x, j) => sum + (x - result.points[1]!.coordinates[j]!) ** 2,
      0,
    );
    const expected = traits.reduce(
      (sum, t, j) =>
        sum +
        ((data[0]!.scores[t] - data[1]!.scores[t]) / result.deviations[j]!) **
          2,
      0,
    );
    expect(actual).toBeCloseTo(expected, 9);
    const rescaled = personalityPca(
      data.map((r) => ({
        ...r,
        scores: { ...r.scores, Openness: r.scores.Openness * 10 + 17 },
      })),
    )!;
    result.points[0]!.coordinates.forEach((value, index) => {
      expect(rescaled.points[0]!.coordinates[index]).toBeCloseTo(value, 8);
    });
  });

  it("handles missing data, constant traits, and identical profiles", () => {
    expect(personalityPca([row(0, [1, 2, 3, 4, 5])])).toBeNull();
    expect(
      personalityPca([0, 1, 2].map((i) => row(i, [1, 2, 3, 4, 5]))),
    ).toBeNull();
    const result = personalityPca([
      ...[-1, 0, 1].map((x, i) => row(i, [60 + x, 70, 80, 90, 50])),
      { id: "missing", scores: { Openness: 80 } },
    ])!;
    expect(result.excluded).toBe(1);
    expect(result.constantTraits).toHaveLength(4);
    expect(result.components[0]!.explained).toBeCloseTo(1);
  });
});
