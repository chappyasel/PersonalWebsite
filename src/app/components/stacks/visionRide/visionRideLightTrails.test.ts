import { describe, expect, it } from "vitest";

import {
  VISION_RIDE_LIGHT_TRAIL,
  lightTrailCarPose,
  lightTrailParticleDistance,
  lightTrailRestAnchor,
} from "./visionRideLightTrails";

const motion = {
  weaveRate: 0.8,
  weaveAmount: 0.32,
  bounceRate: 5.2,
  bounceAmount: 0.035,
  rollRate: 1.4,
  rollAmount: 0.012,
};

describe("Vision ride light trails", () => {
  it("moves particles toward the chase camera and wraps them at the tail", () => {
    const start = lightTrailParticleDistance({
      index: 0,
      sideIndex: 0,
      travelDistanceMetres: 0,
    });
    const moving = lightTrailParticleDistance({
      index: 0,
      sideIndex: 0,
      travelDistanceMetres: 1.25,
    });
    const wrapped = lightTrailParticleDistance({
      index: 0,
      sideIndex: 0,
      travelDistanceMetres: VISION_RIDE_LIGHT_TRAIL.lengthMetres,
    });
    expect(start).toBe(0);
    expect(moving).toBeCloseTo(1.25, 9);
    expect(wrapped).toBeCloseTo(0, 9);
  });

  it("matches the measured rear-lamp centers instead of guessed emitters", () => {
    expect(VISION_RIDE_LIGHT_TRAIL.lampLocalX).toBeCloseTo(0.76, 9);
    expect(VISION_RIDE_LIGHT_TRAIL.lampLocalY).toBeCloseTo(0.76, 9);
    expect(VISION_RIDE_LIGHT_TRAIL.lampLocalZ).toBeCloseTo(-2.11, 9);
    const left = lightTrailRestAnchor(-1);
    const right = lightTrailRestAnchor(1);
    expect(left.x).toBeCloseTo(-right.x, 9);
    expect(left.y).toBeCloseTo(0.795, 9);
    expect(left.z).toBeCloseTo(-2.69, 9);
  });

  it("carries the same weave, bounce, and roll as the car", () => {
    const pose = lightTrailCarPose({
      time: 8,
      motion,
    });
    expect(pose.x).toBeCloseTo(
      Math.sin(8 * motion.weaveRate) * motion.weaveAmount,
      9,
    );
    expect(pose.y).toBeGreaterThan(0);
    expect(pose.roll).not.toBe(0);
  });
});
