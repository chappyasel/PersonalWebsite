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
  accelerationCameraRetreatMetres: 0.32,
  brakingCameraApproachMetres: 0.2,
} as const;

export const VISION_RIDE_DRIVE_KEYS = {
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  accelerate: ["KeyW", "ArrowUp"],
  brake: ["KeyS", "ArrowDown"],
} as const;

export type VisionRideDriveState = Readonly<{
  steering: number;
  throttle: number;
}>;

export type VisionRideMotion = {
  steering: number;
  throttle: number;
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

export function driveAxes(pressed: ReadonlySet<string>) {
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
  wanted: VisionRideDriveState,
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

export function driveChaseOffsetMetres(throttle: number) {
  const response = driveVisualResponse(throttle);
  return response >= 0
    ? response * VISION_RIDE_DRIVING.accelerationCameraRetreatMetres
    : response * VISION_RIDE_DRIVING.brakingCameraApproachMetres;
}
