import { describe, expect, it } from "vitest";

import {
  GOLF_BALL_RADIUS,
  GOLF_SHOT_RETURN_MS,
  GOLF_SHOT_VELOCITIES,
  createDimpledGolfBallGeometry,
  createGolfBallBumpTexture,
} from "./trainingGolfBall";

describe("Weightlifting golf balls", () => {
  it("launches every ball toward the background and respawns after five seconds", () => {
    expect(GOLF_SHOT_RETURN_MS).toBe(5_000);
    expect(Object.values(GOLF_SHOT_VELOCITIES)).toHaveLength(4);
    for (const [, upward, intoHills] of Object.values(GOLF_SHOT_VELOCITIES)) {
      expect(upward).toBeGreaterThan(0);
      expect(intoHills).toBeLessThan(0);
    }
  });

  it("uses real recessed surface geometry while preserving the ball silhouette", () => {
    const geometry = createDimpledGolfBallGeometry();
    const positions = geometry.getAttribute("position");
    const radii = Array.from({ length: positions.count }, (_, index) =>
      Math.hypot(
        positions.getX(index),
        positions.getY(index),
        positions.getZ(index),
      ),
    );

    expect(Math.max(...radii)).toBeCloseTo(GOLF_BALL_RADIUS, 5);
    expect(Math.min(...radii)).toBeLessThan(GOLF_BALL_RADIUS * 0.97);
    expect(
      radii.filter((radius) => radius < GOLF_BALL_RADIUS * 0.985).length,
    ).toBeGreaterThan(100);
  });

  it("adds a spherical dimple height field that survives scene-scale blur", () => {
    const texture = createGolfBallBumpTexture();
    const data = texture.image.data as Uint8Array;
    let minimum = 255;
    let maximum = 0;
    for (const value of data) {
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
    expect(minimum).toBeLessThan(64);
    expect(maximum).toBe(255);
    expect(texture.image.width).toBe(256);
    expect(texture.image.height).toBe(128);
  });
});
