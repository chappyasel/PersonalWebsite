// One projector for everything the boot SVG draws.
//
// The loading screen is an elevation of the About unit in "plane units":
// scene units on the shelf's centre plane (unit-local z = 0), which the boot
// stage (boot/aboutBootStage.ts) lays over the live shelf per viewport. Until
// now each drawable projected itself its own way. The supports and the
// reading fan scaled by camera distance about the unit's origin as if the eye
// stood at x = 0 looking dead level; the standing frames were pure
// orthographic; the planks, the landmark anchors and the floor props had no
// depth at all. The live camera does none of that. At rest it stands 0.7 to
// 1.0 units right of the unit's origin, 0.25 above the top plank, looks down
// 3.15°, and the unit itself is yawed 0.1 rad, so the shelf's left end is
// 0.13 units nearer than its right. The lower plank visibly tilts (about
// 20 px across a 2056-wide window), a floor prop 0.62 nearer than the plane
// renders a tenth larger than its silhouette, and the two golf balls on the
// grass had no boot counterpart at all.
//
// The rule: every drawable is placed by projecting its 3D unit-local anchor
// through the About rest camera, and scaled by the anchor's depth ratio. A
// shape drawn from 3D corners (planks, supports) projects each corner the
// same way; a flat glyph (a generated silhouette, a frame's elevation) hangs
// off its projected anchor at the anchor's scale. With the eye at the origin
// looking level and no yaw this reduces exactly to the old
// `cameraZ / (cameraZ - z)` scaling, so the fan's mild perspective is the
// same maths with the real camera put back in.
//
// The camera is the canonical desktop rest pose (1440×900 with the rail's
// fallback width). On desktop only the eye's x moves with the viewport (the
// About shift plus its share of the dock truck), which shifts a point off the
// plane by (1 - scale) times that difference: under 0.05 plane units for the
// nearest floor prop across every desktop width, and a few thousandths for
// anything on a shelf. Narrow viewports stand the camera farther back, so
// their depth ratios are slightly milder than these.
import { UNIT_COUNT } from "../data";

import {
  ABOUT_LANDMARK_X,
  ABOUT_LOWER_LANDMARK_Z,
  ABOUT_MODEL_POSES,
  ABOUT_TOP_LANDMARK_Z,
  type AboutModelPoseId,
} from "./aboutScenePose";
import {
  cameraDepthDiagnosticsController,
  cameraDepthEffectEnabled,
} from "./cameraDepthDiagnostics";
import { SHELF_SURFACE } from "./shelfGeometry";
import {
  RAIL_RIGHT_PX_FALLBACK,
  STACKS_DESKTOP_MIN_WIDTH,
  aboutStopShift,
  cameraCompositionForViewport,
  cameraDepthOffsetsForViewport,
  scrollOffsetForUnit,
  unitPose,
  unitProgressForScrollOffset,
} from "./worldLayout";

export type Point3 = readonly [number, number, number];

export type AboutBootCamera = Readonly<{
  /** World-space eye and aim, exactly as CameraRig rests them. */
  eye: Point3;
  aim: Point3;
  /** The About unit's own yaw about its origin. Unit-local points are turned
   * through it before they are projected. */
  unitYaw: number;
}>;

export type AboutBootProjectedPoint = Readonly<{
  /** Plane units, y up: where the point lands on the shelf's centre plane as
   * the boot stage maps it. */
  x: number;
  y: number;
  /** The depth ratio: how much larger (nearer) or smaller (farther) a thing
   * at this point renders than it would on the plane. */
  scale: number;
}>;

/** CameraRig's About rest pose for a viewport, assembled from the exported
 * camera helpers the way the frame loop assembles it: the About shift plus
 * the composition's lateral truck for x, the composition's height, distance
 * and aim, and the depth offsets only if they ship on. */
export function aboutBootRestCamera(
  vw = 1440,
  vh = 900,
  railRightPx = RAIL_RIGHT_PX_FALLBACK,
): AboutBootCamera {
  const shift =
    vw < STACKS_DESKTOP_MIN_WIDTH ? 0 : aboutStopShift(vw, vh, railRightPx);
  const offset = scrollOffsetForUnit(0, shift);
  const scenePosition = unitProgressForScrollOffset(offset) * (UNIT_COUNT - 1);
  const composition = cameraCompositionForViewport(
    vw,
    vh,
    scenePosition,
    railRightPx,
  );
  const depth = cameraDepthOffsetsForViewport(
    vw,
    vh,
    scenePosition,
    cameraDepthEffectEnabled(
      cameraDepthDiagnosticsController.getSnapshot().enabled,
      false,
      false,
    ),
  );
  const eyeX = shift + composition.lateralOffset;
  const eyeY = composition.y + depth.eyeHeight;
  const horizontal = composition.z - composition.lookZ;
  const baselinePitch = Math.atan2(
    composition.lookY - composition.y,
    horizontal,
  );
  const aimY = eyeY + Math.tan(baselinePitch - depth.pitchRadians) * horizontal;
  return {
    eye: [eyeX, eyeY, composition.z],
    aim: [eyeX, aimY, composition.lookZ],
    unitYaw: unitPose(0).rotation[1],
  };
}

/** The canonical camera every boot drawable is projected through. */
export const ABOUT_BOOT_CAMERA: AboutBootCamera = aboutBootRestCamera();

type Basis = Readonly<{
  eye: Point3;
  forward: Point3;
  right: Point3;
  up: Point3;
  /** The origin's depth along the view axis and its screen offsets, which
   * the plane mapping is anchored on. */
  originDepth: number;
  originU: number;
  originV: number;
}>;

const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Point3, b: Point3): Point3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Point3): Point3 => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

const basisCache = new WeakMap<AboutBootCamera, Basis>();

/** three's lookAt with the world's up: forward toward the aim, right along
 * the ground, up perpendicular to both. Cached per camera object. */
function basisFor(camera: AboutBootCamera): Basis {
  const cached = basisCache.get(camera);
  if (cached) return cached;
  const forward = normalize([
    camera.aim[0] - camera.eye[0],
    camera.aim[1] - camera.eye[1],
    camera.aim[2] - camera.eye[2],
  ]);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const toOrigin: Point3 = [-camera.eye[0], -camera.eye[1], -camera.eye[2]];
  const basis: Basis = {
    eye: camera.eye,
    forward,
    right,
    up,
    originDepth: dot(toOrigin, forward),
    originU: dot(toOrigin, right),
    originV: dot(toOrigin, up),
  };
  basisCache.set(camera, basis);
  return basis;
}

/** A unit-local point turned through the unit's yaw into world space. */
export function aboutBootWorldPoint(
  point: Point3,
  unitYaw: number,
): Point3 {
  const cos = Math.cos(unitYaw);
  const sin = Math.sin(unitYaw);
  return [
    point[0] * cos + point[2] * sin,
    point[1],
    -point[0] * sin + point[2] * cos,
  ];
}

/** Where a unit-local point lands on the shelf's centre plane, and how much
 * larger or smaller it renders there than something on the plane would. */
export function projectAboutBootPoint(
  point: Point3,
  camera: AboutBootCamera = ABOUT_BOOT_CAMERA,
): AboutBootProjectedPoint {
  const basis = basisFor(camera);
  const world = aboutBootWorldPoint(point, camera.unitYaw);
  const rel: Point3 = [
    world[0] - basis.eye[0],
    world[1] - basis.eye[1],
    world[2] - basis.eye[2],
  ];
  const depth = dot(rel, basis.forward);
  const scale = basis.originDepth / Math.max(1e-6, depth);
  return {
    x: dot(rel, basis.right) * scale - basis.originU,
    y: dot(rel, basis.up) * scale - basis.originV,
    scale,
  };
}

export type AboutBootQuad = readonly [
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
];

/** Four 3D corners to four plane points, y up. */
export function projectAboutBootQuad(
  corners: readonly [Point3, Point3, Point3, Point3],
  camera: AboutBootCamera = ABOUT_BOOT_CAMERA,
): AboutBootQuad {
  return corners.map((corner) => {
    const p = projectAboutBootPoint(corner, camera);
    return [p.x, p.y] as const;
  }) as unknown as AboutBootQuad;
}

export type AboutBootPlankProjection = Readonly<{
  /** The face toward the camera, top edge first, clockwise on screen. */
  front: AboutBootQuad;
  /** The upper surface, which the camera sees because it looks down at the
   * shelf: far edge first, so the near edge is the front face's top edge. */
  top: AboutBootQuad;
}>;

/** A plank as the camera sees it: its front face and its top surface. */
export function aboutBootPlankProjection(
  plank: Readonly<{
    width: number;
    centerY: number;
    thickness: number;
    depth: number;
    centerZ: number;
  }>,
  camera: AboutBootCamera = ABOUT_BOOT_CAMERA,
): AboutBootPlankProjection {
  const halfWidth = plank.width / 2;
  const top = plank.centerY + plank.thickness / 2;
  const bottom = plank.centerY - plank.thickness / 2;
  const near = plank.centerZ + plank.depth / 2;
  const far = plank.centerZ - plank.depth / 2;
  return {
    front: projectAboutBootQuad(
      [
        [-halfWidth, top, near],
        [halfWidth, top, near],
        [halfWidth, bottom, near],
        [-halfWidth, bottom, near],
      ],
      camera,
    ),
    top: projectAboutBootQuad(
      [
        [-halfWidth, top, far],
        [halfWidth, top, far],
        [halfWidth, top, near],
        [-halfWidth, top, near],
      ],
      camera,
    ),
  };
}

export type AboutBootBoxBounds = Readonly<{
  x: number;
  width: number;
  /** Plane units, y up. */
  top: number;
  bottom: number;
}>;

/** The plane-space bounding box of an axis-aligned unit-local box: every
 * corner projected, then the extremes. Uprights and feet are drawn from
 * this rather than as eight-cornered solids; at their depth the difference
 * is under two pixels. */
export function aboutBootBoxBounds(
  box: Readonly<{
    centerX: number;
    width: number;
    centerZ: number;
    depth: number;
    top: number;
    bottom: number;
  }>,
  camera: AboutBootCamera = ABOUT_BOOT_CAMERA,
): AboutBootBoxBounds {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const dx of [-box.width / 2, box.width / 2]) {
    for (const dz of [-box.depth / 2, box.depth / 2]) {
      for (const y of [box.top, box.bottom]) {
        const p = projectAboutBootPoint(
          [box.centerX + dx, y, box.centerZ + dz],
          camera,
        );
        xs.push(p.x);
        ys.push(p.y);
      }
    }
  }
  const x = Math.min(...xs);
  return {
    x,
    width: Math.max(...xs) - x,
    top: Math.max(...ys),
    bottom: Math.min(...ys),
  };
}

/** Where a GLB model's origin stands in the unit: the landmark's x on its
 * plank at its live depth, or a floor prop's base. The silhouette generator
 * projects each model's triangles from here, and the boot places the model's
 * group here, so the two agree by construction. */
export function aboutBootModelAnchor(id: AboutModelPoseId): Point3 {
  const pose = ABOUT_MODEL_POSES[id] as { base?: Point3 };
  if (pose.base) return pose.base;
  const x = (ABOUT_LANDMARK_X as Record<string, number>)[id];
  const top = (ABOUT_TOP_LANDMARK_Z as Record<string, number>)[id];
  const lower = (ABOUT_LOWER_LANDMARK_Z as Record<string, number>)[id];
  if (x === undefined) throw new Error(`No About landmark x for ${id}`);
  if (top !== undefined) return [x, SHELF_SURFACE.top, top];
  if (lower !== undefined) return [x, SHELF_SURFACE.lower, lower];
  throw new Error(`No About landmark depth for ${id}`);
}

/** The 2D point the generator rasters for one model vertex.
 *
 * The vertex is placed in the unit (anchor plus the posed vertex at the
 * model's scale) and projected through the camera, then taken relative to
 * the anchor's own projection and divided by the anchor's depth ratio and
 * the model scale. That is the orthographic elevation's coordinate system,
 * so the raster, the profile and the projection matrix downstream are
 * unchanged, and once the boot places the group at the anchor and scales it
 * by the ratio the traced outline lands where the camera would draw it: a
 * floor prop shows its plates from the eye's real height and side, not from
 * a level eye at x = 0. */
export function aboutBootSilhouettePoint(
  anchor: Point3,
  scale: number,
  posed: Point3,
  camera: AboutBootCamera = ABOUT_BOOT_CAMERA,
): readonly [number, number] {
  const at = projectAboutBootPoint(anchor, camera);
  const p = projectAboutBootPoint(
    [
      anchor[0] + posed[0] * scale,
      anchor[1] + posed[1] * scale,
      anchor[2] + posed[2] * scale,
    ],
    camera,
  );
  return [(p.x - at.x) / at.scale / scale, (p.y - at.y) / at.scale / scale];
}

/** The camera's share of a traced silhouette's signature, so a change to
 * the rest pose or to a model's anchor marks the outline stale. Rounded, so
 * two V8 builds cannot disagree about it in the last bit. The globe stays
 * orthographic: its map is drawn onto the ball by an orthographic
 * projection of the same sphere, and a perspective outline would no longer
 * be that sphere. */
export function aboutBootSilhouetteCameraSignature(id: AboutModelPoseId) {
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  const perspective = id !== "globe";
  if (!perspective) return { perspective, camera: null, anchor: null };
  return {
    perspective,
    camera: {
      eye: ABOUT_BOOT_CAMERA.eye.map(round),
      aim: ABOUT_BOOT_CAMERA.aim.map(round),
      unitYaw: round(ABOUT_BOOT_CAMERA.unitYaw),
    },
    anchor: aboutBootModelAnchor(id).map(round),
  };
}
