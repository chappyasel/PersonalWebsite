export const POINTER_CAMERA_TILT_MAX_DEGREES = 1;

export type PointerCameraTiltState = Readonly<{
  enabled: boolean;
}>;

const POINTER_CAMERA_TILT_DEFAULT: PointerCameraTiltState = Object.freeze({
  enabled: true,
});

/** Map the full pointer height to a one-degree pitch in either direction.
 * Positive pointer Y is the top of the viewport, where the camera looks down. */
export function pointerCameraTiltDegrees(pointerY: number) {
  const finitePointerY = Number.isFinite(pointerY) ? pointerY : 0;
  return (
    Math.min(1, Math.max(-1, finitePointerY)) *
    POINTER_CAMERA_TILT_MAX_DEGREES
  );
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

export const pointerCameraTiltController =
  createPointerCameraTiltController();
