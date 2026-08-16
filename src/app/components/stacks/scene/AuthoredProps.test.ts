import { describe, expect, it } from "vitest";

import { shakerPose } from "./AuthoredProps";

describe("silent shaker egg", () => {
  it("shakes in a restrained window and returns exactly to rest", () => {
    expect(shakerPose(0)).toEqual({ yaw: 0, roll: -0 });
    expect(Math.abs(shakerPose(250).yaw)).toBeGreaterThan(0.01);
    expect(shakerPose(600)).toEqual({ yaw: 0, roll: 0 });
    expect(shakerPose(900)).toEqual({ yaw: 0, roll: 0 });
  });

  it("skips under reduced motion and replays deterministically", () => {
    expect(shakerPose(250, true)).toEqual({ yaw: 0, roll: 0 });
    expect(shakerPose(175)).toEqual(shakerPose(175));
  });
});
