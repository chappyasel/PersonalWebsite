// World-space layout for the homepage 3D scene — spacing, camera, and unit poses.
// No three.js imports so DOM-side modules can share the math.
import { UNIT_COUNT } from "../data";
import { presentationProfileForViewport } from "../mobile/presentation";

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
export const MOBILE_GOLF_DOLLY = 1.4;
export const DESKTOP_GOLF_DOLLY = 0.45;
export const MOBILE_GOLF_LOOK_Y_OFFSET = -0.18;

export function golfDollyForViewport(width: number, golfFocused: boolean) {
  if (!golfFocused) return 0;
  return width < STACKS_DESKTOP_MIN_WIDTH
    ? MOBILE_GOLF_DOLLY
    : DESKTOP_GOLF_DOLLY;
}

export function golfLookYOffsetForViewport(
  width: number,
  golfFocused: boolean,
) {
  return width < STACKS_DESKTOP_MIN_WIDTH && golfFocused
    ? MOBILE_GOLF_LOOK_Y_OFFSET
    : 0;
}
export const CAMERA = { z: 5.8, y: 0.25, fov: 33 };
export const CAMERA_LOOK_Y = -0.08;
export const CAMERA_LOOK_Z_OFFSET = -0.2;
/** The DoF plane belongs to the shelf, not to the camera aim. Set it 50 mm
 * forward of the top plank's physical back edge so the books and objects
 * across the rear half of the shelf stay in the clear band. */
export const DEPTH_OF_FIELD_SHELF_Z =
  SHELF_GEOMETRY.top.centerZ - SHELF_GEOMETRY.top.depth / 2 + 0.05;
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

/** Offline OG capture may tighten the lens without altering visitor framing.
 * Keep the range narrow enough that a malformed query cannot create an
 * unusable camera. */
export function captureFovFromSearch(search: string): number | null {
  const params = new URLSearchParams(search);
  if (!params.has("og-capture")) return null;
  const raw = params.get("og-fov");
  if (raw === null) return null;
  const fov = Number(raw);
  return Number.isFinite(fov) && fov >= 24 && fov <= 45 ? fov : null;
}

export function captureHeadOnFromSearch(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has("og-capture") && params.get("og-head-on") === "1";
}

export function captureLookYFromSearch(search: string): number | null {
  const params = new URLSearchParams(search);
  if (!params.has("og-capture")) return null;
  const raw = params.get("og-look-y");
  if (raw === null) return null;
  const lookY = Number(raw);
  return Number.isFinite(lookY) && lookY >= -0.4 && lookY <= 0.2 ? lookY : null;
}

export function captureCameraYFromSearch(search: string): number | null {
  const params = new URLSearchParams(search);
  if (!params.has("og-capture")) return null;
  const raw = params.get("og-camera-y");
  if (raw === null) return null;
  const cameraY = Number(raw);
  return Number.isFinite(cameraY) && cameraY >= 0 && cameraY <= 1
    ? cameraY
    : null;
}

export type CameraComposition = {
  y: number;
  z: number;
  fov: number;
  lookXOffset: number;
  lookY: number;
  lookZ: number;
};

const PORTRAIT_FOV = 33;
export const SHELF_OVERVIEW_MARGIN = 1.06;
export const SHELF_OVERVIEW_MIN_DISTANCE = 6.4;
/** Very tall windows must not pull farther back than the canonical phone
 * composition merely to preserve empty horizontal margins. */
export const SHELF_OVERVIEW_MAX_DISTANCE = 10.25;

/** Distance that leaves the complete shelf just inside a portrait frame.
 * The minimum keeps tablet framing from becoming tighter than phone framing. */
export function portraitShelfOverviewDistance(width: number, height: number) {
  const aspect = width / Math.max(1, height);
  const halfHorizontalFov =
    Math.tan((PORTRAIT_FOV * Math.PI) / 360) * Math.max(0.01, aspect);
  const horizontalFit =
    (SHELF_GEOMETRY.width * SHELF_OVERVIEW_MARGIN) / (2 * halfHorizontalFov);
  return Math.min(
    SHELF_OVERVIEW_MAX_DISTANCE,
    Math.max(SHELF_OVERVIEW_MIN_DISTANCE, horizontalFit),
  );
}

function lerpComposition(
  from: CameraComposition,
  to: CameraComposition,
  amount: number,
): CameraComposition {
  const t = Math.min(1, Math.max(0, amount));
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    y: lerp(from.y, to.y),
    z: lerp(from.z, to.z),
    fov: lerp(from.fov, to.fov),
    lookXOffset: lerp(from.lookXOffset, to.lookXOffset),
    lookY: lerp(from.lookY, to.lookY),
    lookZ: lerp(from.lookZ, to.lookZ),
  };
}

/** Every stop uses the same shelf-relative distance. Odd units sit farther
 * back in world Z, so their camera and look target move back with them rather
 * than making those shelves appear smaller. Travel interpolates between the
 * adjacent stop compositions. */
export function cameraCompositionForViewport(
  width: number,
  height: number,
  scenePosition: number,
): CameraComposition {
  const fallback = cameraForAspect(width / Math.max(1, height));
  const portrait = presentationProfileForViewport(width, height) === "portrait";
  const overviewDistance = portrait
    ? portraitShelfOverviewDistance(width, height)
    : fallback.z;
  const stop = (unit: number): CameraComposition => {
    const unitZ = unitPose(unit).position[2];
    return {
      y: portrait ? 0.25 : fallback.y,
      z: unitZ + overviewDistance,
      fov: portrait ? PORTRAIT_FOV : fallback.fov,
      lookXOffset: 0,
      lookY: CAMERA_LOOK_Y,
      lookZ: unitZ + CAMERA_LOOK_Z_OFFSET,
    };
  };
  const lower = Math.min(
    UNIT_COUNT - 1,
    Math.max(0, Math.floor(scenePosition)),
  );
  const upper = Math.min(UNIT_COUNT - 1, lower + 1);
  return lerpComposition(stop(lower), stop(upper), scenePosition - lower);
}

export function apparentHeightScale(distance: number, fovDegrees: number) {
  return (
    1 / (Math.max(0.001, distance) * Math.tan((fovDegrees * Math.PI) / 360))
  );
}

export const unitPose = (i: number) =>
  ({
    position: [i * UNIT_SPACING, 0, i % 2 === 0 ? 0 : -0.55],
    rotation: [0, i % 2 === 0 ? 0.1 : -0.12, 0],
  }) as const;

/** The live traverse keeps each shelf's slight authored yaw. Offline OG
 * capture can square the unit to the optical axis for a formal hero frame. */
export function unitPoseForCapture(unit: number, headOnCapture: boolean) {
  const pose = unitPose(unit);
  if (!headOnCapture) return pose;
  return { position: pose.position, rotation: [0, 0, 0] as const };
}

/** World-space target consumed by the post-processing depth pass. */
export function depthOfFieldTargetForUnit(unit: number) {
  const pose = unitPose(unit);
  return [
    pose.position[0],
    CAMERA_LOOK_Y,
    pose.position[2] + DEPTH_OF_FIELD_SHELF_Z,
  ] as const;
}

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
    ABOUT_SHELF_LEFT.x - (frac - 0.5) * (cam.z - ABOUT_SHELF_LEFT.z) * 2 * tanH;
  return Math.min(2.0, Math.max(0, camX));
}
