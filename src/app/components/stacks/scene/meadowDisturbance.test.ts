import { describe, expect, it } from "vitest";

import {
  MEADOW_IMPACT_EVENTS,
  getMeadowDisturbance,
  publishMeadowImpact,
  resetMeadowDisturbance,
  visitMeadowImpactsSince,
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
      radiusScale: 0.25,
      timeScale: 2,
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
      radiusScale: 0.25,
      timeScale: 2,
      revision: revision + 1,
    });
    resetMeadowDisturbance();
  });

  it("retains a bounded run of same-frame impacts in revision order", () => {
    const revision = getMeadowDisturbance().impact.revision;
    for (let index = 0; index < MEADOW_IMPACT_EVENTS + 2; index += 1)
      publishMeadowImpact({
        x: index,
        y: -1.1,
        z: 0,
        directionX: 1,
        directionZ: 0,
        strength: 0.5,
      });
    const visited: number[] = [];
    const latest = visitMeadowImpactsSince(revision, (impact) =>
      visited.push(impact.x),
    );
    expect(visited).toEqual(
      Array.from({ length: MEADOW_IMPACT_EVENTS }, (_, index) => index + 2),
    );
    expect(latest).toBe(revision + MEADOW_IMPACT_EVENTS + 2);
    resetMeadowDisturbance();
  });
});
