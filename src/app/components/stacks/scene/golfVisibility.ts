import { GOLF_STOP_POSITION } from "../data";

import {
  GOLF_COURSE_CENTER,
  GOLF_CUP_WORLD_CENTER,
  GOLF_VEGETATION_CLEARANCE,
  TRAINING_UNIT_INDEX,
} from "./golf/golfCourse";
import { golfYawRig } from "./golfYawPivot";
import { SHELF_GEOMETRY } from "./shelfGeometry";
import {
  cameraCompositionForViewport,
  cameraXForScrollOffset,
  golfDollyForViewport,
  scrollOffsetForUnit,
  unitPose,
} from "./worldLayout";

/**
 * How much of the green the visitor can see. Golf mode used to be a scroll
 * window (data.ts, 1.36..1.62), which knows nothing about the pointer: the
 * pan, the head turn and the orbit move the view by a few units without
 * moving the scroll, so the owner could stand at the Books stop with the
 * mouse at the right and see the whole green without being in golf, or at
 * the window's far edge with the mouse at the right and see only the
 * Weightlifting shelf while still in golf. His rule, built here: golf is on
 * as soon as the entire green is in frame, and off as soon as the
 * Weightlifting shelf starts to cover it (or the frame edge or the Books
 * shelf does, coming the other way).
 *
 * Everything is measured on the horizontal axis of the frame. The green
 * the eye sees is not its whole footprint: the crest grass in front hides
 * the ellipse's outer parts, and what shows is the sightline opening the
 * vegetation is cleared to (golfCourse.ts). That opening, across the
 * green's centre, projects to a span of normalised device x; the frame
 * clips it to [-1, 1]; each neighbouring shelf, nearer than the green from
 * anywhere in the aisle, subtracts the span its props cover. Coverage is
 * what is left over the opening's width, 0..1.
 *
 * It is measured twice, on two poses the rig can name without knowing the
 * mode (CameraRig.tsx). The pre-golf pose is the scroll composition plus
 * the pointer's own pan, orbit and head turn: what the visitor sees with
 * golf off. The in-golf pose is the cup pivot at full weight for the same
 * pointer (golfYawPivot.ts): what golf itself would show. Golf mode needs
 * the green in both, so the pivot's sidestep, which sweeps the near shelf
 * across the green at the window's far edge with the mouse to the right,
 * takes the mode out there instead of hiding the green from inside it.
 * Measuring the blended pose the camera actually holds would feed the mode
 * back into its own input and hunt around the threshold; these two are
 * functions of the inputs alone. Each is normalised against the same pose
 * built at the golf stop for the same viewport and pointer, so a phone
 * whose stop crops the green, or a pivot that always covers a corner of it
 * at the tee, still counts as golf at the stop.
 */
export type GolfViewPose = Readonly<{
  eye: readonly [number, number, number];
  look: readonly [number, number, number];
  /** Vertical field of view, degrees. */
  fovDegrees: number;
  aspect: number;
}>;

export type GolfVisibilityOptions = Readonly<{
  /** Count the Books and Weightlifting shelves as occluders. On for the
   * site; the console can switch them off to see the frame edges alone. */
  occluders: boolean;
}>;

type WorldPoint = readonly [number, number, number];

/**
 * Normalised device x of a world point as seen from the pose, or null when
 * the point is at or behind the camera. The rig aims with `lookAt` and the
 * world's up, so the frame has no roll and one right vector suffices.
 */
export function projectedNdcX(
  pose: GolfViewPose,
  point: WorldPoint,
): number | null {
  const fx = pose.look[0] - pose.eye[0];
  const fy = pose.look[1] - pose.eye[1];
  const fz = pose.look[2] - pose.eye[2];
  const forwardLength = Math.hypot(fx, fy, fz);
  if (forwardLength === 0) return null;
  const forward = [fx / forwardLength, fy / forwardLength, fz / forwardLength];
  // right = forward × up, with up = +y.
  const rx = -forward[2]!;
  const rz = forward[0]!;
  const rightLength = Math.hypot(rx, rz);
  if (rightLength === 0) return null;
  const dx = point[0] - pose.eye[0];
  const dy = point[1] - pose.eye[1];
  const dz = point[2] - pose.eye[2];
  const depth = dx * forward[0]! + dy * forward[1]! + dz * forward[2]!;
  if (depth <= 1e-6) return null;
  const across = (dx * rx + dz * rz) / rightLength;
  const halfWidth =
    depth * Math.tan((pose.fovDegrees * Math.PI) / 360) * pose.aspect;
  return across / halfWidth;
}

/** The ends of the sightline opening across the green's centre, world
 * space, at ground height: the green as the eye finds it between the
 * crest tufts. */
export const GOLF_GREEN_SIGHTLINE: readonly WorldPoint[] = (() => {
  const c = Math.cos(GOLF_COURSE_CENTER.yaw);
  const s = Math.sin(GOLF_COURSE_CENTER.yaw);
  const halfWidth = GOLF_VEGETATION_CLEARANCE.openingNearHalfWidth;
  const end = (lx: number): WorldPoint => [
    GOLF_COURSE_CENTER.x + lx * c,
    SHELF_GEOMETRY.groundY,
    GOLF_COURSE_CENTER.z - lx * s,
  ];
  return [end(-halfWidth), end(halfWidth)];
})();

/**
 * How much of a top plank's end is bare wood. The green's rows sit above
 * the plank itself from every stop, so what hides the green is the line of
 * props standing on it, which stops short of the ends: the last books on
 * the Books shelf and the dumbbell on the Weightlifting shelf both leave
 * about this much plank showing beside them. The occluder is the plank
 * less this at the end that faces the green.
 */
const SHELF_OCCLUDER_BARE_END = 0.15;

/** The end corners of a unit's top plank at its own height: the silhouette
 * a shelf presents against the green from anywhere in the aisle. `inset`
 * pulls the end in by the bare wood beyond the props. */
function shelfEndCorners(
  unit: number,
  end: -1 | 1,
  inset = 0,
): readonly WorldPoint[] {
  const pose = unitPose(unit);
  const c = Math.cos(pose.rotation[1]);
  const s = Math.sin(pose.rotation[1]);
  const lx = end * (SHELF_GEOMETRY.width / 2 - inset);
  const y = pose.position[1] + SHELF_GEOMETRY.top.centerY;
  return [-1, 1].map((side) => {
    const lz = SHELF_GEOMETRY.top.centerZ + (side * SHELF_GEOMETRY.top.depth) / 2;
    return [
      pose.position[0] + lx * c + lz * s,
      y,
      pose.position[2] - lx * s + lz * c,
    ] as const;
  });
}

const BOOKS_UNIT_INDEX = TRAINING_UNIT_INDEX - 1;
// The green lies between the two: Books faces it with its right end,
// Weightlifting with its left.
const occluders = [
  {
    unit: BOOKS_UNIT_INDEX,
    corners: [
      ...shelfEndCorners(BOOKS_UNIT_INDEX, -1),
      ...shelfEndCorners(BOOKS_UNIT_INDEX, 1, SHELF_OCCLUDER_BARE_END),
    ],
  },
  {
    unit: TRAINING_UNIT_INDEX,
    corners: [
      ...shelfEndCorners(TRAINING_UNIT_INDEX, -1, SHELF_OCCLUDER_BARE_END),
      ...shelfEndCorners(TRAINING_UNIT_INDEX, 1),
    ],
  },
] as const;

function projectedSpan(
  pose: GolfViewPose,
  points: readonly WorldPoint[],
): readonly [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const x = projectedNdcX(pose, point);
    if (x === null) return null;
    min = Math.min(min, x);
    max = Math.max(max, x);
  }
  return [min, max];
}

const overlap = (
  a: readonly [number, number],
  b: readonly [number, number],
) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));

/**
 * The fraction of the green's sightline the pose can see, 0..1: inside the
 * frame and not behind the Books or Weightlifting shelf. 0 when the green
 * is behind the camera.
 */
export function golfGreenCoverage(
  pose: GolfViewPose,
  options: GolfVisibilityOptions = { occluders: true },
): number {
  const green = projectedSpan(pose, GOLF_GREEN_SIGHTLINE);
  if (!green) return 0;
  const width = green[1] - green[0];
  if (width <= 0) return 0;
  const frame: readonly [number, number] = [-1, 1];
  let visible = overlap(green, frame);
  if (visible <= 0) return 0;
  if (options.occluders) {
    for (const occluder of occluders) {
      const span = projectedSpan(pose, occluder.corners);
      if (!span) continue;
      const shelf: readonly [number, number] = [
        Math.max(span[0], frame[0]),
        Math.min(span[1], frame[1]),
      ];
      if (shelf[1] > shelf[0]) visible -= overlap(green, shelf);
    }
  }
  return Math.min(1, Math.max(0, visible / width));
}

/**
 * The pose the rig composes at the golf stop with no pointer in it and the
 * golf dolly applied, for a viewport. The coverage it sees is the most the
 * viewport can ever offer without the mouse, so `golfGreenCoverage` is
 * normalised against it: on desktop that is the whole green, on a phone
 * the stop itself may crop the green and must still count as golf.
 */
export function golfStopViewPose(
  width: number,
  height: number,
  railRightPx?: number,
): GolfViewPose {
  const composition = cameraCompositionForViewport(
    width,
    height,
    GOLF_STOP_POSITION,
    railRightPx,
  );
  const eyeX =
    cameraXForScrollOffset(scrollOffsetForUnit(GOLF_STOP_POSITION)) +
    composition.lateralOffset;
  return {
    eye: [
      eyeX,
      composition.y,
      composition.z - golfDollyForViewport(width, true),
    ],
    look: [eyeX, composition.lookY, composition.lookZ],
    fovDegrees: composition.fov,
    aspect: width / Math.max(1, height),
  };
}

/** Coverage relative to what the viewport's own golf stop can show. */
export function normalisedGolfCoverage(coverage: number, reference: number) {
  return Math.min(1, coverage / Math.max(0.25, reference));
}

type MutablePose = {
  eye: [number, number, number];
  look: [number, number, number];
  fovDegrees: number;
  aspect: number;
};

const scratchPose = (): MutablePose => ({
  eye: [0, 0, 0],
  look: [0, 0, 0],
  fovDegrees: 33,
  aspect: 1,
});

/**
 * The pose golf holds at full weight for a pointer run: `base` with the cup
 * pivot applied (golfYawPivot.ts). `base` is the rig's pre-orbit eye and
 * aim with the pan faded out, which is what the rig hands the pivot.
 */
export function golfInGolfPose(
  base: GolfViewPose,
  run: number,
  out: MutablePose = scratchPose(),
): GolfViewPose {
  const rig = golfYawRig({
    eyeX: base.eye[0],
    eyeZ: base.eye[2],
    lookX: base.look[0],
    lookZ: base.look[2],
    pivotX: GOLF_CUP_WORLD_CENTER.x,
    pivotZ: GOLF_CUP_WORLD_CENTER.z,
    run,
  });
  out.eye[0] = rig.eyeX;
  out.eye[1] = base.eye[1];
  out.eye[2] = rig.eyeZ;
  out.look[0] = rig.lookX;
  out.look[1] = base.look[1];
  out.look[2] = rig.lookZ;
  out.fovDegrees = base.fovDegrees;
  out.aspect = base.aspect;
  return out;
}

const inGolfScratch = scratchPose();
const stopInGolfScratch = scratchPose();

/**
 * Golf mode's coverage, 0..1: the lesser of the pre-golf pose's and the
 * in-golf pose's, each relative to the golf stop's own for the same
 * viewport and pointer run. `stop` is `golfStopViewPose` for the viewport;
 * `stopCoverage` its coverage, cached by the caller.
 */
export function golfModeCoverage(
  poses: Readonly<{
    preGolf: GolfViewPose;
    inGolfBase: GolfViewPose;
    stop: GolfViewPose;
    stopCoverage: number;
    run: number;
  }>,
  options: GolfVisibilityOptions = { occluders: true },
): number {
  const preGolf = normalisedGolfCoverage(
    golfGreenCoverage(poses.preGolf, options),
    poses.stopCoverage,
  );
  const inGolf = normalisedGolfCoverage(
    golfGreenCoverage(
      golfInGolfPose(poses.inGolfBase, poses.run, inGolfScratch),
      options,
    ),
    golfGreenCoverage(
      golfInGolfPose(poses.stop, poses.run, stopInGolfScratch),
      options,
    ),
  );
  return Math.min(preGolf, inGolf);
}
