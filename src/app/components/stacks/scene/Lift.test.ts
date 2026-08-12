import { describe, expect, it } from "vitest";

import { HOVER_MOTION_SCALE, amplifyHoverMotion } from "./Lift";

describe("shared shelf hover motion", () => {
  it("doubles travel, rotation, and scale delta without changing speed", () => {
    expect(HOVER_MOTION_SCALE).toBe(2);
    expect(amplifyHoverMotion([0, 0.03, 0.02], 0.05, 1.02, 0.06)).toEqual({
      offset: [0, 0.06, 0.04],
      settle: 0.1,
      grow: 1.04,
      tip: 0.12,
    });
  });

  it("preserves explicit refusals", () => {
    expect(amplifyHoverMotion([0, 0, 0], 0, 1, 0)).toEqual({
      offset: [0, 0, 0],
      settle: 0,
      grow: 1,
      tip: 0,
    });
  });
});
