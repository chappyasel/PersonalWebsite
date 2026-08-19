// World-space layout for the homepage 3D scene — spacing, camera, and unit poses.
// No three.js imports so DOM-side modules can share the math.
import { UNIT_COUNT } from "../data";

import { SHELF_GEOMETRY } from "./shelfGeometry";

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
/** Authored fast-scroll look lag. The meadow's camera-side apron is derived
 * against this full value so coverage, rather than reduced camera motion,
 * hides the transient corners. */
export const CAMERA_LOOK_X_MAX_LAG = 6;
/** Tablet portrait keeps almost all of the original wide framing. Phones use
 * the same safe camera distance with a slightly narrower lens below. */
export const CAMERA_NARROW = { z: 7.6, y: 0.3, fov: 40.5 };
// tan(38.5° / 2) / tan(32.5° / 2) = 1.20: the requested twenty-percent
// tighter phone composition, without changing camera distance or parallax.
const CAMERA_PHONE = { ...CAMERA_NARROW, fov: 32.5 };
const PHONE_ASPECT = 0.5;
const TABLET_PORTRAIT_ASPECT = 0.75;
export const MID_X = ((UNIT_COUNT - 1) * UNIT_SPACING) / 2;
export const TRAVEL_X = (UNIT_COUNT - 1) * UNIT_SPACING;
/** A short, real scrollable lead-in before About. The seat now rests farther
 * back in the room and needs less lateral runway to remain discoverable; this
 * stop prevents visitors from panning into empty space at the far left. */
export const TRAVEL_LEAD_IN = 1.2;
export const TRAVEL_RANGE_X = TRAVEL_X + TRAVEL_LEAD_IN;

export function cameraXForScrollOffset(offset: number) {
  return offset * TRAVEL_RANGE_X - TRAVEL_LEAD_IN;
}

export function scrollOffsetForUnit(unit: number, aboutShift = 0) {
  if (TRAVEL_RANGE_X === 0) return 0;
  const stopX = unit * UNIT_SPACING + (unit === 0 ? aboutShift : 0);
  return (stopX + TRAVEL_LEAD_IN) / TRAVEL_RANGE_X;
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

  // A phone needs roughly twenty percent more apparent scale than the previous
  // 38.5° lens, while 768 portrait only needs a gentle correction. Interpolate
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

// Left edge of unit 0's shelf in world space: (−width/2, 0) through the
// unit's +0.10 yaw. The one scene anchor the About stop is solved against.
const aboutYaw = unitPose(0).rotation[1];
const ABOUT_SHELF_LEFT = {
  x: (-SHELF_GEOMETRY.width / 2) * Math.cos(aboutYaw),
  z: (SHELF_GEOMETRY.width / 2) * Math.sin(aboutYaw),
} as const;

/** Clear air between the rail's widest label and the projected shelf edge. */
export const RAIL_SHELF_MARGIN_PX = 24;

/** How far right of unit 0's shelf the ABOUT STOP rests — the "move the
 * initial scene" fix (owner round 2, item 8, refined at review). The nav
 * does not move; the resting camera slides right until the About shelf's
 * projected LEFT edge sits RAIL_SHELF_MARGIN_PX right of the rail's widest
 * row ("Featured Talks", measured live by UnitRail into railRightPxRef) —
 * the nav lands in the couch–shelf gap with a constant margin at every
 * desktop viewport, and the couch (which needs far less) clears the frame
 * as a side effect. Solved from the same projection the placard peek uses:
 *   frac = 0.5 + ((worldX − camX)/(camZ − worldZ)) · 0.5/tan(hHalf).
 * The cap keeps the stop well left of the unit-boundary midpoint (2.2), so
 * activeUnit can never round to 1 at rest; the floor keeps square-ish
 * viewports on the authored stop (where the gap cannot fit the rail —
 * status quo). Mobile chrome has no left rail; callers pass the shift only
 * on ≥1200px viewports. */
export function aboutStopShift(
  vw: number,
  vh: number,
  railRightPx: number,
): number {
  const aspect = vw / vh;
  const cam = cameraForAspect(aspect);
  const vHalf = ((cam.fov / 2) * Math.PI) / 180;
  const tanH = Math.tan(vHalf) * aspect;
  const frac = (railRightPx + RAIL_SHELF_MARGIN_PX) / vw;
  const camX =
    ABOUT_SHELF_LEFT.x -
    (frac - 0.5) * (cam.z - ABOUT_SHELF_LEFT.z) * 2 * tanH;
  return Math.min(2.0, Math.max(0, camX));
}
