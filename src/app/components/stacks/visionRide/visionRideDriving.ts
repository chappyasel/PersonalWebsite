export const VISION_RIDE_DRIVING = {
  minimumSpeedMultiplier: 0.25,
  maximumSpeedMultiplier: 4,
  throttleRampPerSecond: 1 / 15,
  throttleReturnPerSecond: 0.2,
  steeringRampPerSecond: 1.8,
  steeringReturnPerSecond: 2.8,
  steeringOffsetMetres: 0.42,
  steeringYawRadians: 0.045,
  steeringRollRadians: 0.022,
  /** The pedal is the press itself, not the speed it builds: it floors in
   * about a third of a second and lifts in half a second, so the chase
   * camera answers a key the moment it goes down while the speed still
   * takes fifteen seconds to sweep. The earlier lean rode the throttle and
   * moved the eye three centimetres in the first second, which nobody saw. */
  pedalRampPerSecond: 2.8,
  pedalReturnPerSecond: 2,
  /** Apparent-size multiplier of the car's rear with the accelerator down
   * (the camera falls back as the car pulls away) and with the brake down
   * (the camera closes up). Multipliers, so the lean is the same fraction
   * of the frame at every orientation and at every point of the breath. */
  acceleratingRearScale: 0.88,
  brakingRearScale: 1.12,
} as const;

export const VISION_RIDE_DRIVE_KEYS = {
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  accelerate: ["KeyW", "ArrowUp"],
  brake: ["KeyS", "ArrowDown"],
} as const;

export type VisionRideDriveAxes = Readonly<{
  steering: number;
  throttle: number;
}>;

export type VisionRideDriveState = VisionRideDriveAxes &
  Readonly<{
    /** Signed pedal position in [-1, 1]: the accelerator or brake as
     * pressed, ramped fast. Drives the chase camera's lean; the throttle
     * above drives the speed. */
    pedal: number;
  }>;

export type VisionRideMotion = {
  steering: number;
  throttle: number;
  pedal: number;
  speedMultiplier: number;
  speedMetresPerSecond: number;
  travelDistanceMetres: number;
};

const clampAxis = (value: number) => Math.max(-1, Math.min(1, value));

export function isVisionRideDriveKey(code: string) {
  return Object.values(VISION_RIDE_DRIVE_KEYS).some((codes) =>
    (codes as readonly string[]).includes(code),
  );
}

export function driveAxes(pressed: ReadonlySet<string>): VisionRideDriveAxes {
  const held = (codes: readonly string[]) =>
    codes.some((code) => pressed.has(code)) ? 1 : 0;
  const keys = VISION_RIDE_DRIVE_KEYS;
  return {
    steering: held(keys.right) - held(keys.left),
    throttle: held(keys.accelerate) - held(keys.brake),
  };
}

function approach(current: number, target: number, step: number) {
  if (current < target) return Math.min(target, current + step);
  if (current > target) return Math.max(target, current - step);
  return current;
}

export function advanceDriveState(
  current: VisionRideDriveState,
  wanted: VisionRideDriveAxes,
  delta: number,
): VisionRideDriveState {
  const seconds = Math.max(0, delta);
  const throttleRate =
    wanted.throttle === 0
      ? VISION_RIDE_DRIVING.throttleReturnPerSecond
      : VISION_RIDE_DRIVING.throttleRampPerSecond;
  const steeringRate =
    wanted.steering === 0
      ? VISION_RIDE_DRIVING.steeringReturnPerSecond
      : VISION_RIDE_DRIVING.steeringRampPerSecond;
  const pedalRate =
    wanted.throttle === 0
      ? VISION_RIDE_DRIVING.pedalReturnPerSecond
      : VISION_RIDE_DRIVING.pedalRampPerSecond;
  return {
    steering: clampAxis(
      approach(
        current.steering,
        clampAxis(wanted.steering),
        steeringRate * seconds,
      ),
    ),
    throttle: clampAxis(
      approach(
        current.throttle,
        clampAxis(wanted.throttle),
        throttleRate * seconds,
      ),
    ),
    pedal: clampAxis(
      approach(current.pedal, clampAxis(wanted.throttle), pedalRate * seconds),
    ),
  };
}

export function driveVisualResponse(throttle: number) {
  const axis = clampAxis(throttle);
  const magnitude = Math.abs(axis);
  // A mild ease-out makes the first one to three seconds legible while the
  // full sweep still takes 15 seconds. It avoids the dead-feeling opening of
  // a purely linear brake without turning a tap into an arcade boost.
  const response = magnitude * (1.35 - magnitude * 0.35);
  return Math.sign(axis) * response;
}

export function driveSpeedMultiplier(throttle: number) {
  const response = driveVisualResponse(throttle);
  return response >= 0
    ? 1 + response * (VISION_RIDE_DRIVING.maximumSpeedMultiplier - 1)
    : 1 + response * (1 - VISION_RIDE_DRIVING.minimumSpeedMultiplier);
}

/**
 * Multiplier on the chase camera's distance to the car's rear face for a
 * pedal position: above 1 with the accelerator down, below 1 on the brake,
 * exactly 1 at rest. Apparent size is inverse to distance, so the rear
 * reads `acceleratingRearScale` times its size with the pedal floored. The
 * ramp is eased so the lean settles instead of stopping dead.
 */
export function driveChaseDistanceScale(pedal: number) {
  const axis = clampAxis(pedal);
  const magnitude = Math.abs(axis);
  const eased = magnitude * magnitude * (3 - 2 * magnitude);
  const rearScale =
    axis >= 0
      ? VISION_RIDE_DRIVING.acceleratingRearScale
      : VISION_RIDE_DRIVING.brakingRearScale;
  return 1 + eased * (1 / rearScale - 1);
}
