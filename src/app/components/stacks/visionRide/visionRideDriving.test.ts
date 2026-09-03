import { describe, expect, it } from "vitest";

import {
  VISION_RIDE_DRIVE_KEYS,
  VISION_RIDE_DRIVING,
  advanceDriveState,
  driveAxes,
  driveChaseOffsetMetres,
  driveSpeedMultiplier,
  driveVisualResponse,
  isVisionRideDriveKey,
} from "./visionRideDriving";

describe("Vision Ride driving", () => {
  it("maps WASD and arrow keys onto steering and throttle", () => {
    expect(driveAxes(new Set())).toEqual({ steering: 0, throttle: 0 });
    expect(driveAxes(new Set(["KeyA", "ArrowUp"]))).toEqual({
      steering: -1,
      throttle: 1,
    });
    expect(driveAxes(new Set(["KeyW", "ArrowDown"]))).toEqual({
      steering: 0,
      throttle: 0,
    });
    for (const codes of Object.values(VISION_RIDE_DRIVE_KEYS))
      for (const code of codes) expect(isVisionRideDriveKey(code)).toBe(true);
    expect(isVisionRideDriveKey("Space")).toBe(false);
  });

  it("takes about fifteen seconds to reach either speed extreme", () => {
    let accelerating = { steering: 0, throttle: 0 };
    let braking = { steering: 0, throttle: 0 };
    for (let frame = 0; frame < 900; frame += 1) {
      accelerating = advanceDriveState(
        accelerating,
        { steering: 0, throttle: 1 },
        1 / 60,
      );
      braking = advanceDriveState(
        braking,
        { steering: 0, throttle: -1 },
        1 / 60,
      );
    }
    expect(driveSpeedMultiplier(accelerating.throttle)).toBeCloseTo(
      VISION_RIDE_DRIVING.maximumSpeedMultiplier,
      6,
    );
    expect(driveSpeedMultiplier(braking.throttle)).toBeCloseTo(
      VISION_RIDE_DRIVING.minimumSpeedMultiplier,
      6,
    );
  });

  it("gives held throttle a restrained but legible opening response", () => {
    let accelerating = { steering: 0, throttle: 0 };
    let braking = { steering: 0, throttle: 0 };
    for (let frame = 0; frame < 60; frame += 1) {
      accelerating = advanceDriveState(
        accelerating,
        { steering: 0, throttle: 1 },
        1 / 60,
      );
      braking = advanceDriveState(
        braking,
        { steering: 0, throttle: -1 },
        1 / 60,
      );
    }
    expect(driveSpeedMultiplier(accelerating.throttle)).toBeGreaterThan(1.2);
    expect(driveSpeedMultiplier(accelerating.throttle)).toBeLessThan(1.35);
    expect(driveSpeedMultiplier(braking.throttle)).toBeGreaterThan(0.9);
    expect(driveSpeedMultiplier(braking.throttle)).toBeLessThan(0.97);
  });

  it("returns to cruise after release and steers more responsively", () => {
    const steered = advanceDriveState(
      { steering: 0, throttle: 1 },
      { steering: 1, throttle: 0 },
      0.5,
    );
    expect(steered.steering).toBeCloseTo(0.9, 9);
    expect(steered.throttle).toBeCloseTo(0.9, 9);
    expect(driveSpeedMultiplier(0)).toBe(1);
  });

  it("adds a tiny chase-camera lag and a signed color response", () => {
    expect(driveChaseOffsetMetres(0)).toBe(0);
    expect(driveChaseOffsetMetres(1)).toBeCloseTo(
      VISION_RIDE_DRIVING.accelerationCameraRetreatMetres,
      9,
    );
    expect(driveChaseOffsetMetres(-1)).toBeCloseTo(
      -VISION_RIDE_DRIVING.brakingCameraApproachMetres,
      9,
    );
    expect(driveVisualResponse(0.1)).toBeGreaterThan(0.1);
    expect(driveVisualResponse(-0.1)).toBeLessThan(-0.1);
  });
});
