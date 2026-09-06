import type { Vector3 } from "three";

/**
 * A subject the depth of field follows instead of the shelf.
 *
 * The composer focuses on the active unit and, past a clear band around it,
 * blurs everything else (shelfDepthOfField.ts). A prop brought to the camera
 * sits four units in front of that focal plane, so without this it would
 * arrive as bokeh. Whoever is flying the prop writes its world position and a
 * 0..1 weight here every frame; the depth-of-field pass blends its target
 * from the shelf to the subject by that weight. Transient, written per frame,
 * read imperatively: it never goes through React state.
 */
export const focusPull = { weight: 0, x: 0, y: 0, z: 0 };

export type FocusPull = typeof focusPull;

export function focusPullTarget(
  base: readonly [number, number, number],
  pull: Readonly<FocusPull>,
  out: Vector3,
): Vector3 {
  const w = Math.min(1, Math.max(0, pull.weight));
  return out.set(
    base[0] + (pull.x - base[0]) * w,
    base[1] + (pull.y - base[1]) * w,
    base[2] + (pull.z - base[2]) * w,
  );
}
