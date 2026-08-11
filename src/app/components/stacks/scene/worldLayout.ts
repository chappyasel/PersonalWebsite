// World-space layout for The Stacks — spacing, camera, and unit poses.
// No three.js imports so DOM-side modules can share the math.
import { UNIT_COUNT } from "../data";

export const UNIT_SPACING = 4.4;
/** The reading dock needs enough horizontal room to coexist with a complete
 * unit. Below this width the sheet/compact rail preserve the scene instead.
 * Kept here because DOM chrome, scene taps, and camera coverage must all use
 * the same seam. */
export const STACKS_DESKTOP_MIN_WIDTH = 1200;
// Range syntax makes the two modes exactly complementary. `max-width:1199px`
// leaves fractional CSS pixels (1199.x at zoom/DPR) matching neither query.
export const STACKS_MOBILE_QUERY = `(width < ${STACKS_DESKTOP_MIN_WIDTH}px)`;
export const STACKS_DESKTOP_QUERY = `(width >= ${STACKS_DESKTOP_MIN_WIDTH}px)`;
export const CAMERA = { z: 5.8, y: 0.25, fov: 33 };
/** Tablet portrait keeps almost all of the original wide framing. Phones use
 * the same safe camera distance with a slightly narrower lens below. */
export const CAMERA_NARROW = { z: 7.6, y: 0.3, fov: 40.5 };
const CAMERA_PHONE = { ...CAMERA_NARROW, fov: 38.5 };
const PHONE_ASPECT = 0.5;
const TABLET_PORTRAIT_ASPECT = 0.75;
export const MID_X = ((UNIT_COUNT - 1) * UNIT_SPACING) / 2;
export const TRAVEL_X = (UNIT_COUNT - 1) * UNIT_SPACING;
/** A short, real scrollable lead-in before About. The unit itself still has a
 * precise stop at x=0; the far-left stop intentionally crops roughly a third
 * of the reading chair so the secret remains discoverable without creating a
 * large empty runway before the first unit. */
export const TRAVEL_LEAD_IN = 1.5;
export const TRAVEL_RANGE_X = TRAVEL_X + TRAVEL_LEAD_IN;

export function cameraXForScrollOffset(offset: number) {
  return offset * TRAVEL_RANGE_X - TRAVEL_LEAD_IN;
}

export function scrollOffsetForUnit(unit: number) {
  if (TRAVEL_RANGE_X === 0) return 0;
  return (unit * UNIT_SPACING + TRAVEL_LEAD_IN) / TRAVEL_RANGE_X;
}

export function unitProgressForScrollOffset(offset: number) {
  if (TRAVEL_X === 0) return 0;
  const p = cameraXForScrollOffset(offset) / TRAVEL_X;
  return Math.min(1, Math.max(0, p));
}

export function cameraForAspect(aspect: number) {
  // 768×1024 is the canonical tablet-portrait seam. Treat the boundary as
  // portrait too: the desktop pose clips a shelf at exactly 3:4 even though
  // one pixel narrower correctly pulls back.
  if (aspect > TABLET_PORTRAIT_ASPECT) return CAMERA;
  if (aspect <= PHONE_ASPECT) return CAMERA_PHONE;

  // A phone needs roughly ten percent more apparent scale than the previous
  // 42° lens, while 768 portrait only needs a gentle correction. Interpolate
  // between those two known compositions so folding phones and split-screen
  // tablets do not hit another visual breakpoint in the middle.
  const tabletBlend =
    (aspect - PHONE_ASPECT) / (TABLET_PORTRAIT_ASPECT - PHONE_ASPECT);
  return {
    ...CAMERA_NARROW,
    fov:
      CAMERA_PHONE.fov + (CAMERA_NARROW.fov - CAMERA_PHONE.fov) * tabletBlend,
  };
}

export const unitPose = (i: number) =>
  ({
    position: [i * UNIT_SPACING, 0, i % 2 === 0 ? 0 : -0.55],
    rotation: [0, i % 2 === 0 ? 0.1 : -0.12, 0],
  }) as const;
