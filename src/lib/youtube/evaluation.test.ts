import { describe, expect, it } from "vitest";

import { evaluateScores } from "./evaluation";

describe("score evaluation", () => {
  it("reports error, bias, agreement, and ranking correlation", () => {
    const result = evaluateScores([
      { predicted: 1, actual: 0 },
      { predicted: 5, actual: 5 },
      { predicted: 9, actual: 10 },
    ]);
    expect(result.mae).toBeCloseTo(2 / 3);
    expect(result.bias).toBe(0);
    expect(result.withinOne).toBe(1);
    expect(result.correlation).toBeCloseTo(1);
  });
});
