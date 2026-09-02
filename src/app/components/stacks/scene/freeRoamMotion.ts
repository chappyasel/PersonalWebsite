// Movement and look policy for the development free-roam camera.
//
// CameraRig owns the r3f wiring: the pointer and key listeners, their
// lifetimes, and the per-frame call into three. Everything that decides where
// the camera ends up lives here, so the rules can be exercised without a WebGL
// context.
//
// The mouse is never captured. The right button looks; the left button stays
// with the scene, where the layout editor selects a prop and drags its gizmo.
//
// The exports are exactly what CameraRig calls. The speeds, sensitivities and
// intervals below are deliberately NOT exported: a test that reads the same
// constant it is checking proves only that a number equals itself, so the
// tuning is pinned through the functions that apply it.
import * as THREE from "three";

/** Metres per second at full stick. */
const FREE_ROAM_SPEED = 4;
/** Radians of yaw per pixel of raw mouse movement. */
const FREE_ROAM_LOOK_SENSITIVITY = 0.0018;
/** Look damping rate. High enough to feel direct, low enough to hide jitter. */
const FREE_ROAM_LOOK_LAMBDA = 18;
/** Stop just short of straight up or down: at the pole, yaw becomes roll. */
const FREE_ROAM_MAX_PITCH = Math.PI / 2 - 0.01;
/** Shift is a precision modifier, not a brake. One third is slow enough to
 * park the camera on a prop and fast enough to still cross the room. */
const FREE_ROAM_PRECISION_SPEED_MULTIPLIER = 1 / 3;
/** A long frame must not teleport the camera through a wall. */
const FREE_ROAM_MAX_STEP_SECONDS = 0.05;
/** Persist the pose four times a second, not every frame. */
const FREE_ROAM_POSE_WRITE_INTERVAL_SECONDS = 0.25;

/**
 * The pointer button that looks: the secondary (right) button. The primary
 * button is left alone so a click still reaches the scene, which is how the
 * layout editor selects a prop and how the gizmo is dragged. Holding the
 * right button and moving turns the camera; releasing it stops. The context
 * menu that button would open is suppressed for the duration.
 */
export const FREE_ROAM_LOOK_BUTTON = 2;

/**
 * The keys free roam claims. Anything outside this set keeps its normal
 * meaning while the camera roams, so H still opens diagnostics and F still
 * leaves.
 */
export const FREE_ROAM_MOVEMENT_CODES: ReadonlySet<string> = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "ShiftLeft",
  "ShiftRight",
]);

type FreeRoamAxes = Readonly<{
  forward: number;
  right: number;
  vertical: number;
}>;

export type FreeRoamLook = Readonly<{ pitch: number; yaw: number }>;

/**
 * Held keys to a movement intent. Opposed keys cancel rather than fighting,
 * which is what keeps a stuck key from dragging the camera away.
 */
function freeRoamAxes(held: ReadonlySet<string>): FreeRoamAxes {
  return {
    forward: Number(held.has("KeyW")) - Number(held.has("KeyS")),
    right: Number(held.has("KeyD")) - Number(held.has("KeyA")),
    vertical: Number(held.has("KeyE")) - Number(held.has("KeyQ")),
  };
}

function freeRoamSpeedMultiplier(held: ReadonlySet<string>): number {
  return held.has("ShiftLeft") || held.has("ShiftRight")
    ? FREE_ROAM_PRECISION_SPEED_MULTIPLIER
    : 1;
}

/**
 * Apply raw pointer movement to the look TARGET, which the frame loop then
 * damps toward. Yaw runs free; pitch is clamped short of the poles.
 */
export function freeRoamLookAfterPointer(
  look: FreeRoamLook,
  movementX: number,
  movementY: number,
): FreeRoamLook {
  return {
    yaw: look.yaw - movementX * FREE_ROAM_LOOK_SENSITIVITY,
    pitch: THREE.MathUtils.clamp(
      look.pitch - movementY * FREE_ROAM_LOOK_SENSITIVITY,
      -FREE_ROAM_MAX_PITCH,
      FREE_ROAM_MAX_PITCH,
    ),
  };
}

/**
 * Frame-rate independent approach toward the look target. Deliberately
 * unclamped: an exponential approach cannot overshoot however long the frame
 * was, and snapping the view after a stall is better than lagging behind the
 * mouse the user already moved.
 */
export function dampFreeRoamLook(
  look: FreeRoamLook,
  target: FreeRoamLook,
  dt: number,
): FreeRoamLook {
  return {
    pitch: THREE.MathUtils.damp(
      look.pitch,
      target.pitch,
      FREE_ROAM_LOOK_LAMBDA,
      dt,
    ),
    yaw: THREE.MathUtils.damp(look.yaw, target.yaw, FREE_ROAM_LOOK_LAMBDA, dt),
  };
}

export function freeRoamStepSeconds(delta: number): number {
  return Math.min(delta, FREE_ROAM_MAX_STEP_SECONDS);
}

/**
 * The per-frame translation, in world space, for the keys currently held.
 *
 * WASD rotates with the camera's yaw, so W follows the viewed heading while
 * remaining on the world XZ plane. Pitch never contributes to translation;
 * looking up or down cannot make W climb or descend. Q/E remain on world Y.
 * The combined direction is normalised before the speed is applied, so moving
 * diagonally is not faster than moving straight.
 */
export function freeRoamTranslation(
  held: ReadonlySet<string>,
  yaw: number,
  delta: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const axes = freeRoamAxes(held);
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);
  target.set(
    axes.right * cosYaw - axes.forward * sinYaw,
    axes.vertical,
    -axes.right * sinYaw - axes.forward * cosYaw,
  );
  if (target.lengthSq() === 0) return target;
  return target
    .normalize()
    .multiplyScalar(
      FREE_ROAM_SPEED *
        freeRoamSpeedMultiplier(held) *
        freeRoamStepSeconds(delta),
    );
}

/** Rate-limit pose persistence against the frame clock, not wall time. */
export function shouldWriteFreeRoamPose(
  elapsedSeconds: number,
  lastWriteSeconds: number,
): boolean {
  return (
    elapsedSeconds - lastWriteSeconds >= FREE_ROAM_POSE_WRITE_INTERVAL_SECONDS
  );
}
