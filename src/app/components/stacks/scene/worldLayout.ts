// World-space layout for The Stacks — spacing, camera, and unit poses.
// No three.js imports so DOM-side modules can share the math.
import { UNIT_COUNT } from "../data";

export const UNIT_SPACING = 4.4;
export const CAMERA = { z: 5.8, y: 0.25, fov: 33 };
/** Narrow (portrait) viewports pull back and widen so a unit still frames. */
export const CAMERA_NARROW = { z: 7.6, y: 0.3, fov: 42 };
export const MID_X = ((UNIT_COUNT - 1) * UNIT_SPACING) / 2;
export const TRAVEL_X = (UNIT_COUNT - 1) * UNIT_SPACING;

export function cameraForAspect(aspect: number) {
  return aspect < 0.75 ? CAMERA_NARROW : CAMERA;
}

export const unitPose = (i: number) =>
  ({
    position: [i * UNIT_SPACING, 0, i % 2 === 0 ? 0 : -0.55],
    rotation: [0, i % 2 === 0 ? 0.1 : -0.12, 0],
  }) as const;
