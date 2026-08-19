import { describe, expect, it } from "vitest";

import {
  getMeadowDisturbance,
  publishMeadowImpact,
  resetMeadowDisturbance,
} from "./meadowDisturbance";

describe("meadow disturbance bridge", () => {
  it("publishes a stable, one-shot ground-impact revision", () => {
    const before = getMeadowDisturbance();
    const revision = before.impact.revision;
    publishMeadowImpact({
      x: 2,
      y: -1.1,
      z: 0.5,
      directionX: 0.6,
      directionZ: -0.8,
      strength: 0.7,
    });
    const after = getMeadowDisturbance();
    expect(after).toBe(before);
    expect(after.impact).toMatchObject({
      x: 2,
      y: -1.1,
      z: 0.5,
      directionX: 0.6,
      directionZ: -0.8,
      strength: 0.7,
      revision: revision + 1,
    });
    resetMeadowDisturbance();
  });
});
