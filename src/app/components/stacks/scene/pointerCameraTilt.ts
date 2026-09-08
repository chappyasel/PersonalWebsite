export const POINTER_CAMERA_TILT_MAX_DEGREES = 2;
export const POINTER_CAMERA_YAW_MAX_DEGREES = 3;

export type PointerCameraTiltState = Readonly<{
  enabled: boolean;
}>;

const POINTER_CAMERA_TILT_DEFAULT: PointerCameraTiltState = Object.freeze({
  enabled: true,
});

/** Map the full pointer height to a two-degree pitch in either direction.
 * Positive pointer Y is the top of the viewport, where the camera looks down. */
export function pointerCameraTiltDegrees(
  pointerY: number,
  maxDegrees = POINTER_CAMERA_TILT_MAX_DEGREES,
) {
  const finitePointerY = Number.isFinite(pointerY) ? pointerY : 0;
  return Math.min(1, Math.max(-1, finitePointerY)) * maxDegrees;
}

/** Map the pointer's run to either side of `centre` onto a three-degree yaw.
 * Positive pointer X is the right of the viewport, where the view turns
 * right: a head turn, in the same direction the horizontal parallax already
 * swings the aim. `centre` is the same neutral the parallax uses (the gap
 * beside the dock on desktop stops), so the two motions rest together. */
export function pointerCameraYawDegrees(
  pointerX: number,
  centre = 0,
  maxDegrees = POINTER_CAMERA_YAW_MAX_DEGREES,
) {
  const finitePointerX = Number.isFinite(pointerX) ? pointerX : 0;
  const finiteCentre =
    Number.isFinite(centre) && Math.abs(centre) < 1 ? centre : 0;
  const run =
    finitePointerX < finiteCentre ? 1 + finiteCentre : 1 - finiteCentre;
  const rel = Math.min(
    1,
    Math.max(-1, (finitePointerX - finiteCentre) / Math.max(0.05, run)),
  );
  return rel * maxDegrees;
}

/** Turn the head: swing the aim about a stationary eye by a pitch (up
 * positive) and a yaw (right positive), keeping the eye-to-aim distance.
 * The counterpart of the two orbit helpers, for the head-only pointer mode
 * where the shelf slides in the frame with the rest of the world. */
export function aimForHeadTurn({
  eyeX,
  eyeY,
  eyeZ,
  lookX,
  lookY,
  lookZ,
  pitchRadians,
  yawRadians,
}: {
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  pitchRadians: number;
  yawRadians: number;
}) {
  const dx = lookX - eyeX;
  const dy = lookY - eyeY;
  const dz = lookZ - eyeZ;
  const horizontal = Math.hypot(dx, dz);
  const distance = Math.hypot(horizontal, dy);
  const pitch = Math.atan2(dy, horizontal) + pitchRadians;
  // Yaw from the standing camera's forward (−z), right positive.
  const yaw = Math.atan2(dx, -dz) + yawRadians;
  const level = distance * Math.cos(pitch);
  return {
    x: eyeX + level * Math.sin(yaw),
    y: eyeY + distance * Math.sin(pitch),
    z: eyeZ - level * Math.cos(yaw),
  };
}

/** Change pitch by moving the eye around an unchanged look target. */
export function eyeYForTiltAroundTarget({
  eyeY,
  lookY,
  horizontalDistance,
  tiltRadians,
}: {
  eyeY: number;
  lookY: number;
  horizontalDistance: number;
  tiltRadians: number;
}) {
  const baselinePitch = Math.atan2(lookY - eyeY, horizontalDistance);
  const pitched = baselinePitch - tiltRadians;
  return lookY - Math.tan(pitched) * horizontalDistance;
}

/** Change yaw by moving the eye around an unchanged look target in the
 * ground plane. The distance to the target is preserved, so this is an
 * orbit rather than a truck. A positive yaw TURNS THE VIEW right, which
 * carries the eye toward −x (screen left for the standing camera): the aim
 * stays on the shelf, the background sweeps left as the head turns right,
 * and the near props sweep the other way. The first cut orbited the eye
 * toward the pointer instead, and because the parallax turns the aim the
 * same way, the two cancelled into a sideways truck with no turn in it. */
export function eyeXZForYawAroundTarget({
  eyeX,
  eyeZ,
  lookX,
  lookZ,
  yawRadians,
}: {
  eyeX: number;
  eyeZ: number;
  lookX: number;
  lookZ: number;
  yawRadians: number;
}) {
  const dx = eyeX - lookX;
  const dz = eyeZ - lookZ;
  const cos = Math.cos(yawRadians);
  const sin = Math.sin(yawRadians);
  return {
    x: lookX + dx * cos - dz * sin,
    z: lookZ + dx * sin + dz * cos,
  };
}

export function createPointerCameraTiltController() {
  let snapshot = POINTER_CAMERA_TILT_DEFAULT;
  const listeners = new Set<() => void>();

  const publish = (enabled: boolean) => {
    if (snapshot.enabled === enabled) return snapshot;
    snapshot = Object.freeze({ enabled });
    for (const listener of listeners) listener();
    return snapshot;
  };

  return {
    getSnapshot: () => snapshot,

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setEnabled: (enabled: boolean) => publish(enabled),

    reset: () => publish(POINTER_CAMERA_TILT_DEFAULT.enabled),
  };
}

export const pointerCameraTiltController = createPointerCameraTiltController();
