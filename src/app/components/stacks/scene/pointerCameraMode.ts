import {
  POINTER_CAMERA_TILT_MAX_DEGREES,
  POINTER_CAMERA_YAW_MAX_DEGREES,
} from "./pointerCameraTilt";

/**
 * How the pointer moves the standing camera, as one point in a small space
 * the Scene console can preset or dial:
 *
 * - `truck`   scales the original pointer parallax's eye lift (0.08 per unit
 *             of pointer Y, with the aim lifting 0.12), 1 = as shipped.
 * - `orbitPitch` / `orbitYaw`   degrees the EYE orbits around the aim at the
 *             viewport's edges (pointerCameraTilt); the shelf stays centred
 *             and the viewpoint changes.
 * - `headPitch` / `headYaw`   degrees the AIM swings about a stationary eye,
 *             a pure head turn; the shelf slides in the frame with the rest
 *             of the world.
 *
 * Three presets sit in that space: the parallax the site shipped with (no
 * orbit, no head turn), the orbit it has now, and a head-only extreme where
 * the eye never moves for the pointer. Custom is any other point; moving a
 * dial forks the preset into it, picking a preset restores its values.
 */
export type PointerCameraPreset = "parallax" | "orbit" | "head" | "custom";

export type PointerCameraValues = Readonly<{
  truck: number;
  orbitPitch: number;
  orbitYaw: number;
  headPitch: number;
  headYaw: number;
}>;

export type PointerCameraValueKey = keyof PointerCameraValues;

export type PointerCameraModeState = Readonly<
  { preset: PointerCameraPreset } & PointerCameraValues
>;

export const POINTER_CAMERA_PRESETS: Readonly<
  Record<Exclude<PointerCameraPreset, "custom">, PointerCameraValues>
> = Object.freeze({
  parallax: Object.freeze({
    truck: 1,
    orbitPitch: 0,
    orbitYaw: 0,
    headPitch: 0,
    headYaw: 0,
  }),
  orbit: Object.freeze({
    truck: 1,
    orbitPitch: POINTER_CAMERA_TILT_MAX_DEGREES,
    orbitYaw: POINTER_CAMERA_YAW_MAX_DEGREES,
    headPitch: 0,
    headYaw: 0,
  }),
  head: Object.freeze({
    truck: 0,
    orbitPitch: 0,
    orbitYaw: 0,
    headPitch: POINTER_CAMERA_TILT_MAX_DEGREES,
    headYaw: POINTER_CAMERA_YAW_MAX_DEGREES,
  }),
});

export const POINTER_CAMERA_VALUE_LIMITS: Readonly<
  Record<PointerCameraValueKey, Readonly<{ min: number; max: number }>>
> = Object.freeze({
  truck: Object.freeze({ min: 0, max: 1 }),
  orbitPitch: Object.freeze({ min: 0, max: 6 }),
  orbitYaw: Object.freeze({ min: 0, max: 6 }),
  headPitch: Object.freeze({ min: 0, max: 10 }),
  headYaw: Object.freeze({ min: 0, max: 10 }),
});

export const POINTER_CAMERA_VALUE_KEYS: readonly PointerCameraValueKey[] =
  Object.freeze(["truck", "orbitPitch", "orbitYaw", "headPitch", "headYaw"]);

export const POINTER_CAMERA_MODE_DEFAULT: PointerCameraModeState =
  Object.freeze({
    preset: "orbit",
    ...POINTER_CAMERA_PRESETS.orbit,
  });

/** The five dials without the preset name, so a spread cannot carry a stale
 * preset over the one the dials now describe. */
function valuesOf(state: PointerCameraValues): PointerCameraValues {
  return {
    truck: state.truck,
    orbitPitch: state.orbitPitch,
    orbitYaw: state.orbitYaw,
    headPitch: state.headPitch,
    headYaw: state.headYaw,
  };
}

function clampValue(key: PointerCameraValueKey, value: number): number {
  const limits = POINTER_CAMERA_VALUE_LIMITS[key];
  if (!Number.isFinite(value)) return POINTER_CAMERA_PRESETS.orbit[key];
  return Math.min(limits.max, Math.max(limits.min, value));
}

/** The preset these values are, or "custom" when they are none of them. */
export function pointerCameraPresetForValues(
  values: PointerCameraValues,
): PointerCameraPreset {
  for (const [preset, candidate] of Object.entries(POINTER_CAMERA_PRESETS)) {
    if (
      POINTER_CAMERA_VALUE_KEYS.every((key) => candidate[key] === values[key])
    )
      return preset as PointerCameraPreset;
  }
  return "custom";
}

export function createPointerCameraModeController(
  initial = POINTER_CAMERA_MODE_DEFAULT,
) {
  let snapshot: PointerCameraModeState = initial;
  const listeners = new Set<() => void>();

  const publish = (next: PointerCameraModeState) => {
    if (
      snapshot.preset === next.preset &&
      POINTER_CAMERA_VALUE_KEYS.every((key) => snapshot[key] === next[key])
    )
      return snapshot;
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
    return snapshot;
  };

  return {
    getSnapshot: () => snapshot,

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** A named preset restores its values; "custom" keeps the current ones. */
    setPreset: (preset: PointerCameraPreset) =>
      publish(
        preset === "custom"
          ? { ...snapshot, preset }
          : { preset, ...POINTER_CAMERA_PRESETS[preset] },
      ),

    /** A dial moves one value and names the result: a preset if it lands on
     * one, otherwise custom. */
    setValue: (key: PointerCameraValueKey, value: number) => {
      const values: PointerCameraValues = {
        ...valuesOf(snapshot),
        [key]: clampValue(key, value),
      };
      return publish({
        ...values,
        preset: pointerCameraPresetForValues(values),
      });
    },

    reset: () => publish(POINTER_CAMERA_MODE_DEFAULT),
  };
}

export const pointerCameraModeController = createPointerCameraModeController();
