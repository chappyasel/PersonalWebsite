import { describe, expect, it } from "vitest";

import {
  VISION_RIDE_DRIVE_KEYS,
  VISION_RIDE_DRIVING,
  type VisionRideDriveState,
  advanceDriveState,
  driveAxes,
  driveChaseDistanceScale,
  driveSpeedMultiplier,
  driveVisualResponse,
  isVisionRideDriveKey,
} from "./visionRideDriving";

const rest: VisionRideDriveState = { steering: 0, throttle: 0, pedal: 0 };

function hold(
  wanted: { steering: number; throttle: number },
  seconds: number,
  from: VisionRideDriveState = rest,
) {
  let state = from;
  for (let frame = 0; frame < Math.round(seconds * 60); frame += 1)
    state = advanceDriveState(state, wanted, 1 / 60);
  return state;
}

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
    const accelerating = hold({ steering: 0, throttle: 1 }, 15);
    const braking = hold({ steering: 0, throttle: -1 }, 15);
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
    const accelerating = hold({ steering: 0, throttle: 1 }, 1);
    const braking = hold({ steering: 0, throttle: -1 }, 1);
    expect(driveSpeedMultiplier(accelerating.throttle)).toBeGreaterThan(1.2);
    expect(driveSpeedMultiplier(accelerating.throttle)).toBeLessThan(1.35);
    expect(driveSpeedMultiplier(braking.throttle)).toBeGreaterThan(0.9);
    expect(driveSpeedMultiplier(braking.throttle)).toBeLessThan(0.97);
  });

  it("returns to cruise after release and steers more responsively", () => {
    const steered = advanceDriveState(
      { steering: 0, throttle: 1, pedal: 1 },
      { steering: 1, throttle: 0 },
      0.5,
    );
    expect(steered.steering).toBeCloseTo(0.9, 9);
    expect(steered.throttle).toBeCloseTo(0.9, 9);
    expect(driveSpeedMultiplier(0)).toBe(1);
  });

  it("floors the pedal within half a second while the speed is still building", () => {
    // The camera lean rides the pedal, not the throttle: a press has to
    // read in the first frames, long before the fifteen-second speed sweep
    // has moved the multiplier at all.
    const tap = hold({ steering: 0, throttle: 1 }, 0.2);
    expect(tap.pedal).toBeGreaterThan(0.5);
    expect(tap.throttle).toBeLessThan(0.02);
    const pressed = hold({ steering: 0, throttle: 1 }, 0.5);
    expect(pressed.pedal).toBe(1);
    expect(pressed.throttle).toBeLessThan(0.04);
    const braked = hold({ steering: 0, throttle: -1 }, 0.5);
    expect(braked.pedal).toBe(-1);
    // Lifting off returns the pedal in about half a second while the
    // throttle it built keeps decaying for seconds.
    const lifted = hold(
      { steering: 0, throttle: 0 },
      0.55,
      hold({ steering: 0, throttle: 1 }, 5),
    );
    expect(lifted.pedal).toBe(0);
    expect(lifted.throttle).toBeGreaterThan(0.2);
  });

  it("leans the chase camera by a visible fraction of the car's distance", () => {
    expect(driveChaseDistanceScale(0)).toBe(1);
    expect(driveChaseDistanceScale(1)).toBeCloseTo(
      1 / VISION_RIDE_DRIVING.acceleratingRearScale,
      9,
    );
    expect(driveChaseDistanceScale(-1)).toBeCloseTo(
      1 / VISION_RIDE_DRIVING.brakingRearScale,
      9,
    );
    // Accelerating drops the eye back at least a tenth of the distance and
    // braking closes it by a tenth: enough to read as a nudge in the frame,
    // not enough to become a camera move of its own.
    expect(driveChaseDistanceScale(1)).toBeGreaterThan(1.1);
    expect(driveChaseDistanceScale(1)).toBeLessThan(1.2);
    expect(driveChaseDistanceScale(-1)).toBeLessThan(0.9);
    expect(driveChaseDistanceScale(-1)).toBeGreaterThan(0.85);
    // Eased at both ends, monotonic in between, clamped past the axis.
    expect(driveChaseDistanceScale(0.5)).toBeCloseTo(
      1 + (driveChaseDistanceScale(1) - 1) / 2,
      9,
    );
    let previous = driveChaseDistanceScale(-1);
    for (let pedal = -0.9; pedal <= 1.001; pedal += 0.1) {
      const scale = driveChaseDistanceScale(pedal);
      expect(scale).toBeGreaterThanOrEqual(previous);
      previous = scale;
    }
    expect(driveChaseDistanceScale(3)).toBe(driveChaseDistanceScale(1));
    expect(driveVisualResponse(0.1)).toBeGreaterThan(0.1);
    expect(driveVisualResponse(-0.1)).toBeLessThan(-0.1);
  });
});
