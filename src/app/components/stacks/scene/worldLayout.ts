// World-space layout for the homepage 3D scene — spacing, camera, and unit poses.
// No three.js imports so DOM-side modules can share the math.
import {
  GOLF_FOCUS_END,
  GOLF_FOCUS_START,
  GOLF_STOP_POSITION,
  UNIT_COUNT,
} from "../data";
import { presentationProfileForViewport } from "../mobile/presentation";

import {
  POINTER_CAMERA_YAW_MAX_DEGREES,
  eyeXZForYawAroundTarget,
} from "./pointerCameraTilt";
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
/** The DoF target belongs in the middle of the shelf's physical depth. The
 * postprocessing effect measures distance on both sides of this point, so a
 * target near the rear edge would put almost every prop in the near blur. */
export const DEPTH_OF_FIELD_SHELF_Z =
  (SHELF_GEOMETRY.top.centerZ + SHELF_GEOMETRY.lower.centerZ) / 2;
/** Authored fast-scroll look lag. The meadow's camera-side apron is derived
 * against this full value so coverage, rather than reduced camera motion,
 * hides the transient corners. */
export const CAMERA_LOOK_X_MAX_LAG = 6;
/** Tablet portrait keeps almost all of the original wide framing. Phones use
 * the same safe camera distance with a slightly narrower lens below. */
export const CAMERA_NARROW = { z: 7.6, y: 0.3, fov: 40.5 };
// tan(38.5° / 2) / tan(32.5° / 2) = 1.20: the requested twenty-percent
// tighter phone composition, without changing camera distance or parallax.
export const CAMERA_PHONE = { ...CAMERA_NARROW, fov: 32.5 };
export const PHONE_ASPECT = 0.5;
export const TABLET_PORTRAIT_ASPECT = 0.75;
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

/** Whether the pointer may orbit the eye (pointerCameraTilt) on this
 * viewport. Only the desktop lens: the narrow lens stands at z 7.6 with a
 * wider fov, and from there even the plain pointer truck already grazes the
 * meadow's vegetation front line at the frame bottom (meadowField's extents
 * derivation), so a 2° orbit would need a nearer front line that costs the
 * lawn a quarter of its density. Narrow desktop windows take the portrait
 * composition anyway: no rail, no dock. The meadow check poses both. */
export function pointerOrbitEnabledForAspect(aspect: number): boolean {
  return aspect > TABLET_PORTRAIT_ASPECT;
}

export type CameraDepthOffsets = Readonly<{
  eyeHeight: number;
  pitchRadians: number;
}>;

type CameraDepthKnot = Readonly<{
  position: number;
  eyeHeight: number;
  pitchDegrees: number;
  arcPeak?: Readonly<{
    eyeHeight: number;
    pitchDegrees: number;
  }>;
}>;

export const CAMERA_DEPTH_MAX_EYE_HEIGHT = 0.1;
export const CAMERA_DEPTH_MAX_PITCH_DEGREES = 0.65;

const CAMERA_DEPTH_ZERO: CameraDepthOffsets = Object.freeze({
  eyeHeight: 0,
  pitchRadians: 0,
});

/** The Golf interaction owns three exact zero-offset knots. Its entrance and
 * exit still get authored travel, but the original pose owns the playable
 * interval. An arc peak is the complete offset at the midpoint, not an amount
 * added to the interpolated stop values. */
export const CAMERA_DEPTH_KNOTS: readonly CameraDepthKnot[] = [
  {
    position: 0,
    eyeHeight: 0.02,
    pitchDegrees: 0.1,
    arcPeak: { eyeHeight: 0.1, pitchDegrees: 0.65 },
  },
  {
    position: 1,
    eyeHeight: -0.02,
    pitchDegrees: -0.1,
    arcPeak: { eyeHeight: -0.05, pitchDegrees: 0.35 },
  },
  {
    position: GOLF_FOCUS_START,
    eyeHeight: 0,
    pitchDegrees: 0,
  },
  {
    position: GOLF_STOP_POSITION,
    eyeHeight: 0,
    pitchDegrees: 0,
  },
  {
    position: GOLF_FOCUS_END,
    eyeHeight: 0,
    pitchDegrees: 0,
    arcPeak: { eyeHeight: 0.08, pitchDegrees: 0.55 },
  },
  {
    position: 2,
    eyeHeight: 0.04,
    pitchDegrees: 0.3,
  },
  {
    position: 3,
    eyeHeight: -0.03,
    pitchDegrees: -0.2,
    arcPeak: { eyeHeight: 0.09, pitchDegrees: -0.55 },
  },
  {
    position: 4,
    eyeHeight: 0.02,
    pitchDegrees: 0.15,
  },
  {
    position: 5,
    eyeHeight: -0.02,
    pitchDegrees: -0.15,
    arcPeak: { eyeHeight: 0.07, pitchDegrees: 0.45 },
  },
  {
    position: 6,
    eyeHeight: 0.03,
    pitchDegrees: 0.2,
  },
];

const smootherstep = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

const cameraDepthArc = (t: number) => 16 * t * t * (1 - t) * (1 - t);

export function cameraDepthScaleForViewport(width: number, height: number) {
  const profile = presentationProfileForViewport(width, height);
  if (profile === "wide") return 1;
  if (profile === "short-landscape") return 0.85;
  const aspect = width / Math.max(1, height);
  const portraitBlend = Math.min(1, Math.max(0, (aspect - 0.5) / 0.25));
  return 0.6 + portraitBlend * 0.2;
}

/** Evaluate the authored vertical camera pose without consulting browser or
 * React state. Disabled evaluation returns the shared exact-zero value so the
 * original camera pipeline remains numerically unchanged. */
export function cameraDepthOffsetsForViewport(
  width: number,
  height: number,
  scenePosition: number,
  enabled = true,
): CameraDepthOffsets {
  if (!enabled) return CAMERA_DEPTH_ZERO;

  const finitePosition = Number.isFinite(scenePosition) ? scenePosition : 0;
  const position = Math.min(
    CAMERA_DEPTH_KNOTS[CAMERA_DEPTH_KNOTS.length - 1]!.position,
    Math.max(CAMERA_DEPTH_KNOTS[0]!.position, finitePosition),
  );
  let lower = CAMERA_DEPTH_KNOTS[0]!;
  let upper = lower;
  for (let index = 1; index < CAMERA_DEPTH_KNOTS.length; index += 1) {
    upper = CAMERA_DEPTH_KNOTS[index]!;
    if (position <= upper.position) break;
    lower = upper;
  }

  const span = upper.position - lower.position;
  const t = span > 0 ? (position - lower.position) / span : 0;
  const stopBlend = smootherstep(t);
  let eyeHeight =
    lower.eyeHeight + (upper.eyeHeight - lower.eyeHeight) * stopBlend;
  let pitchDegrees =
    lower.pitchDegrees + (upper.pitchDegrees - lower.pitchDegrees) * stopBlend;
  if (lower.arcPeak) {
    const arc = cameraDepthArc(t);
    eyeHeight += (lower.arcPeak.eyeHeight - eyeHeight) * arc;
    pitchDegrees += (lower.arcPeak.pitchDegrees - pitchDegrees) * arc;
  }

  const scale = cameraDepthScaleForViewport(width, height);
  eyeHeight = Math.min(
    CAMERA_DEPTH_MAX_EYE_HEIGHT,
    Math.max(-CAMERA_DEPTH_MAX_EYE_HEIGHT, eyeHeight * scale),
  );
  pitchDegrees = Math.min(
    CAMERA_DEPTH_MAX_PITCH_DEGREES,
    Math.max(-CAMERA_DEPTH_MAX_PITCH_DEGREES, pitchDegrees * scale),
  );
  return {
    eyeHeight,
    pitchRadians: (pitchDegrees * Math.PI) / 180,
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

export function ogCaptureFromSearch(search: string): boolean {
  return new URLSearchParams(search).has("og-capture");
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
  /** Lateral truck in world units: the eye AND the look target both move
   * by this, so the frame slides without yawing. On desktop stops 1..6 it
   * is `stopLateralOffset`, which centres the shelf in the clear gap
   * between the rail and the reading dock; About keeps its own solve
   * (`aboutStopShift`, applied through the scroll stop) and stays at 0. */
  lateralOffset: number;
  /** Where the pointer parallax reads as neutral, in NDC x. The gap's
   * midpoint on desktop (a mouse resting over the shelf gives the composed
   * frame), 0 elsewhere. */
  parallaxCentre: number;
  /** The look target's full swing LEFT (carrying the shelf toward the dock)
   * with the pointer at the viewport's left edge, world units. Where the
   * shelf fits the gap, its clearance to the dock: it can touch the glass,
   * never pass it. Where the gap is narrower than the shelf and the left
   * end rests under the nav, enough to bring that end out to the rail
   * margin, so every part of the shelf is reachable with the mouse alone.
   * The nav side is transparent and always gets `PARALLAX_SWING`.
   * `PARALLAX_SWING` where there is no dock. */
  parallaxDockSwing: number;
  lookY: number;
  lookZ: number;
};

export const PORTRAIT_FOV = 33;
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
    lateralOffset: lerp(from.lateralOffset, to.lateralOffset),
    parallaxCentre: lerp(from.parallaxCentre, to.parallaxCentre),
    parallaxDockSwing: lerp(from.parallaxDockSwing, to.parallaxDockSwing),
    lookY: lerp(from.lookY, to.lookY),
    lookZ: lerp(from.lookZ, to.lookZ),
  };
}

/** Every stop uses the same shelf-relative distance. Odd units sit farther
 * back in world Z, so their camera and look target move back with them rather
 * than making those shelves appear smaller. Travel interpolates between the
 * adjacent stop compositions. With `railRightPx` (the live rail measurement,
 * desktop only; callers omit it under OG capture) stops 1..6 truck sideways
 * so the shelf sits in the gap beside the dock instead of half behind it. */
export function cameraCompositionForViewport(
  width: number,
  height: number,
  scenePosition: number,
  railRightPx?: number,
): CameraComposition {
  const fallback = cameraForAspect(width / Math.max(1, height));
  const portrait = presentationProfileForViewport(width, height) === "portrait";
  const overviewDistance = portrait
    ? portraitShelfOverviewDistance(width, height)
    : fallback.z;
  const framing =
    railRightPx === undefined
      ? null
      : desktopStopFraming(width, height, railRightPx);
  const stop = (unit: number): CameraComposition => {
    const unitZ = unitPose(unit).position[2];
    return {
      y: portrait ? 0.25 : fallback.y,
      z: unitZ + overviewDistance,
      fov: portrait ? PORTRAIT_FOV : fallback.fov,
      lateralOffset: unit === 0 || !framing ? 0 : framing.lateralOffset,
      parallaxCentre: framing ? framing.gapCentreNdc : 0,
      parallaxDockSwing: framing
        ? unit === 0
          ? framing.aboutDockSwing
          : framing.dockSwing
        : PARALLAX_SWING,
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
export const ABOUT_SHELF_LEFT = {
  x: (-SHELF_GEOMETRY.width / 2) * Math.cos(aboutYaw),
  z: (SHELF_GEOMETRY.width / 2) * Math.sin(aboutYaw),
} as const;

/** Clear air between the rail's widest label and the projected shelf edge. */
export const RAIL_SHELF_MARGIN_PX = 24;
/** The desktop rail's right edge before UnitRail has measured it: 28px of
 * inset plus the widest label in Georgia. The camera's first frames and the
 * pre-paint boot stage both solve against this, so a measurement that lands
 * close to it moves nothing visibly. */
export const RAIL_RIGHT_PX_FALLBACK = 179;
/** Maximum lateral camera displacement at the About stop. */
export const ABOUT_STOP_MAX_SHIFT = 2;

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
  return Math.min(ABOUT_STOP_MAX_SHIFT, Math.max(0, camX));
}

/** The desktop reading dock's left edge in CSS px, from the same two clamps
 * PlacardLayer gives the dock (`--pw` and its gutter), at the 16px root
 * size. A formula rather than a measurement because the dock is a pure
 * function of the viewport, unlike the rail, whose width is a font's. */
export const DESKTOP_DOCK_GEOMETRY = {
  rem: 16,
  widthMinRem: 27,
  widthMaxRem: 40,
  widthBaseRem: 13,
  widthFraction: 0.225,
  gutterMinRem: 1.25,
  gutterMaxRem: 2,
  gutterBaseRem: 0.6,
  gutterFraction: 0.011,
} as const;

export function desktopDockLeftPx(vw: number): number {
  const d = DESKTOP_DOCK_GEOMETRY;
  const rem = d.rem;
  const width = Math.min(
    d.widthMaxRem * rem,
    Math.max(d.widthMinRem * rem, d.widthFraction * vw + d.widthBaseRem * rem),
  );
  const gutter = Math.min(
    d.gutterMaxRem * rem,
    Math.max(d.gutterMinRem * rem, d.gutterBaseRem * rem + d.gutterFraction * vw),
  );
  return vw - width - gutter;
}

/** Maximum lateral truck at stops 1..6, in world units. Roughly 0.5-0.9 is
 * what the solve wants at every desktop width (a square 1200 window asks
 * for 1.08); the cap only guards the arithmetic against a rail measurement
 * gone wrong. Unlike About's shift this never moves a scroll stop, so
 * activeUnit rounding is not a constraint here. */
export const STOP_LATERAL_MAX = 1.2;
/** Clear air between the shelf's projected right edge and the dock's glass
 * where the gap cannot fit the whole shelf. */
export const DOCK_SHELF_MARGIN_PX = 16;
/** Full pointer-parallax swing of the look target, in world units, at a
 * pointer on the viewport's edge. */
export const PARALLAX_SWING = 0.45;
/** The dock-side swing may exceed PARALLAX_SWING where the shelf overflows
 * the nav (square desktop windows); this bounds how far. 1.4 is an 13° yaw
 * of the look target, reached only by a 1200x1000 window. */
export const PARALLAX_DOCK_SWING_MAX = 1.4;

export type DesktopStopFraming = Readonly<{
  /** Truck for stops 1..6 (world units, camera right of the shelf). */
  lateralOffset: number;
  /** The rail-to-dock gap's midpoint in NDC x. */
  gapCentreNdc: number;
  /** The look target's full dock-side swing for stops 1..6, world units. */
  dockSwing: number;
  /** The same for About, whose stop `aboutStopShift` pins to the rail. */
  aboutDockSwing: number;
}>;

/** The top plank's four corners relative to a unit's centre, through that
 * unit's authored yaw (stops alternate +0.10 and −0.12). */
function shelfCornersForYaw(
  yaw: number,
): ReadonlyArray<readonly [number, number]> {
  const hw = SHELF_GEOMETRY.width / 2;
  const { centerZ, depth } = SHELF_GEOMETRY.top;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const corners: Array<readonly [number, number]> = [];
  for (const x of [-hw, hw]) {
    for (const z of [centerZ - depth / 2, centerZ + depth / 2]) {
      corners.push([x * cos + z * sin, -x * sin + z * cos]);
    }
  }
  return corners;
}
const STOP_SHELF_CORNERS = [
  shelfCornersForYaw(unitPose(1).rotation[1]),
  shelfCornersForYaw(unitPose(2).rotation[1]),
];
const ABOUT_SHELF_CORNERS = [shelfCornersForYaw(unitPose(0).rotation[1])];

/** NDC x of the right-most plank corner seen from an eye that aims `swing`
 * left of itself and, with the pointer on the viewport's edge, has orbited
 * that aim by the full pointer yaw (view left, eye right). Solved in the
 * ground plane: the plank sits within 0.12 of the aim's height, so the pitch
 * moves this by well under a pixel. */
function rightmostShelfNdc(
  eyeX: number,
  eyeZ: number,
  swing: number,
  cornerSets: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  tanH: number,
): number {
  const aimX = eyeX - swing;
  const aimZ = CAMERA_LOOK_Z_OFFSET;
  const eye = eyeXZForYawAroundTarget({
    eyeX,
    eyeZ,
    lookX: aimX,
    lookZ: aimZ,
    yawRadians: -(POINTER_CAMERA_YAW_MAX_DEGREES * Math.PI) / 180,
  });
  const fx = aimX - eye.x;
  const fz = aimZ - eye.z;
  const fl = Math.hypot(fx, fz);
  const f = [fx / fl, fz / fl] as const;
  const right = [-f[1], f[0]] as const;
  let max = -Infinity;
  for (const corners of cornerSets) {
    for (const [cx, cz] of corners) {
      const dx = cx - eye.x;
      const dz = cz - eye.z;
      const depth = dx * f[0] + dz * f[1];
      const lateral = dx * right[0] + dz * right[1];
      max = Math.max(max, lateral / depth / tanH);
    }
  }
  return max;
}

/** The leftward aim swing at which the shelf's right edge lands on
 * `edgeNdc`, capped at `maxSwing`; zero when it already touches at rest.
 * The edge moves monotonically with the swing, so a bisection is exact to
 * far below a pixel in 28 steps. */
function swingToRightEdge(
  eyeX: number,
  eyeZ: number,
  cornerSets: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  edgeNdc: number,
  tanH: number,
  maxSwing: number,
): number {
  const at = (swing: number) =>
    rightmostShelfNdc(eyeX, eyeZ, swing, cornerSets, tanH);
  if (at(0) >= edgeNdc) return 0;
  if (at(maxSwing) <= edgeNdc) return maxSwing;
  let lo = 0;
  let hi = maxSwing;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < edgeNdc) lo = mid;
    else hi = mid;
  }
  return lo;
}

let framingCache: {
  key: string;
  value: DesktopStopFraming;
} | null = null;

/** The desktop framing at stops 1..6: how far right of a shelf's centre line
 * the camera stands so the shelf's projected centre lands at the midpoint of
 * the clear gap between the rail's widest label and the dock, plus what the
 * pointer parallax needs to keep the shelf out of the dock. Every stop used
 * to centre its shelf on the viewport, which put the shelf's right end
 * behind the dock at any width under ~2560px: at 2000 the dock owns the
 * frame from 1328px and the shelf ran to 1482 (owner screenshot, 2026-09-04).
 *
 * The rest pose is solved at the shelf plane, distance `cam.z` from the
 * eye, with a parallel optical axis: px per world unit = vw / (2·tanH·cam.z).
 * Where the gap is narrower than the shelf (below ~1400px) the RIGHT edge
 * holds DOCK_SHELF_MARGIN_PX off the dock and the left end runs under the
 * nav: the nav is transparent text and the dock is opaque cards, so the nav
 * is the side that can be seen through (owner, 2026-09-04).
 *
 * The dock-side pointer swing is solved on the REAL projection instead: the
 * camera turns toward the swung aim and, at the viewport's edge, has also
 * orbited that aim by the pointer yaw. The parallel-axis estimate that used
 * to stand in for this left the plank's corner 14–30px past the dock's
 * glass at 1440–1728 wide; the turned camera puts it exactly on the glass,
 * and the orbit (eye right, view left) foreshortens the near end so it
 * needs a little less swing than a pure turn would. Cached per viewport
 * because CameraRig asks every frame. Portrait and mobile shells have no
 * dock and no rail; callers pass no rail there. */
export function desktopStopFraming(
  vw: number,
  vh: number,
  railRightPx: number,
): DesktopStopFraming {
  const key = `${vw}|${vh}|${railRightPx}`;
  if (framingCache?.key === key) return framingCache.value;
  const value = solveDesktopStopFraming(vw, vh, railRightPx);
  framingCache = { key, value };
  return value;
}

function solveDesktopStopFraming(
  vw: number,
  vh: number,
  railRightPx: number,
): DesktopStopFraming {
  const none: DesktopStopFraming = {
    lateralOffset: 0,
    gapCentreNdc: 0,
    dockSwing: PARALLAX_SWING,
    aboutDockSwing: PARALLAX_SWING,
  };
  if (vw < STACKS_DESKTOP_MIN_WIDTH) return none;
  const aspect = vw / Math.max(1, vh);
  const cam = cameraForAspect(aspect);
  const tanH = Math.tan(((cam.fov / 2) * Math.PI) / 180) * aspect;
  const pxPerWorld = vw / (2 * tanH * cam.z);
  const halfShelfPx = (SHELF_GEOMETRY.width / 2) * pxPerWorld;
  const railEdge = railRightPx + RAIL_SHELF_MARGIN_PX;
  const dockEdge = desktopDockLeftPx(vw);
  const mid = (railEdge + dockEdge) / 2;
  const centrePx = Math.min(mid, dockEdge - DOCK_SHELF_MARGIN_PX - halfShelfPx);
  const lateralOffset = Math.min(
    STOP_LATERAL_MAX,
    Math.max(0, (vw / 2 - centrePx) / pxPerWorld),
  );
  const landedRight = vw / 2 - lateralOffset * pxPerWorld + halfShelfPx;
  // About's stop is a scroll shift solved elsewhere; its shelf's left edge
  // projects from that shift the same way aboutStopShift derived it.
  const aboutShift = aboutStopShift(vw, vh, railRightPx);
  const aboutLeft =
    vw *
    (0.5 +
      (ABOUT_SHELF_LEFT.x - aboutShift) /
        ((cam.z - ABOUT_SHELF_LEFT.z) * 2 * tanH));
  // The look target sits CAMERA_LOOK_Z_OFFSET behind the shelf plane, so a
  // look offset moves the shelf by cam.z / (cam.z - offset) of itself.
  const lookPerShelfWorld = (cam.z - CAMERA_LOOK_Z_OFFSET) / cam.z;
  const glassNdc = (2 * dockEdge) / vw - 1;
  const dockSwingFor = (
    leftPx: number,
    eyeX: number,
    cornerSets: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  ) => {
    const underNav = Math.max(0, railEdge - leftPx) / pxPerWorld;
    // Fits: swing until the plank's corner touches the glass, on the turned
    // and orbited camera. Overflows: swing until the left end reaches the
    // rail margin, exact, and let the right end go under the opaque dock.
    const touch = swingToRightEdge(
      eyeX,
      cam.z,
      cornerSets,
      glassNdc,
      tanH,
      PARALLAX_SWING,
    );
    const reveal = underNav * lookPerShelfWorld;
    return Math.min(PARALLAX_DOCK_SWING_MAX, Math.max(touch, reveal));
  };
  return {
    lateralOffset,
    gapCentreNdc: (2 * mid) / vw - 1,
    dockSwing: dockSwingFor(
      landedRight - 2 * halfShelfPx,
      lateralOffset,
      STOP_SHELF_CORNERS,
    ),
    aboutDockSwing: dockSwingFor(aboutLeft, aboutShift, ABOUT_SHELF_CORNERS),
  };
}

/** The truck alone; see `desktopStopFraming`. */
export function stopLateralOffset(
  vw: number,
  vh: number,
  railRightPx: number,
): number {
  return desktopStopFraming(vw, vh, railRightPx).lateralOffset;
}

/** The pointer's contribution to the look target's x, in world units.
 * `pointerX` is NDC; neutral is the composition's gap centre rather than
 * the viewport centre. Each side of neutral maps its whole run to the
 * viewport edge onto that side's full swing, so there is no dead zone: the
 * mouse always moves the scene, and the dock side simply moves less where
 * the shelf has less room (or more, where it has to come out from under
 * the nav). Leftward yaws the camera left and carries the shelf toward the
 * dock. With a centred composition and equal swings (mobile, OG capture)
 * this is the original `pointerX * 0.45`. */
export function parallaxLookOffset(
  pointerX: number,
  composition: Pick<CameraComposition, "parallaxCentre" | "parallaxDockSwing">,
): number {
  const centre = composition.parallaxCentre;
  if (pointerX < centre) {
    const rel = Math.max(-1, (pointerX - centre) / Math.max(0.05, 1 + centre));
    return rel * composition.parallaxDockSwing;
  }
  const rel = Math.min(1, (pointerX - centre) / Math.max(0.05, 1 - centre));
  return rel * PARALLAX_SWING;
}
