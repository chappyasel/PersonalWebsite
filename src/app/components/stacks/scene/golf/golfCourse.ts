import { unitPose } from "../worldLayout";

import type { GolfSurface } from "./golfTypes";

export const TRAINING_UNIT_INDEX = 2;
export const GOLF_GREEN_CENTER_LOCAL = [-1.55, -17.2] as const;
/** The cup sits uphill of the green centre so the lip remains visible over
 * the foreground bank without moving the entire putting surface. */
export const GOLF_FLAG_LOCAL = [-1.55, -18.1] as const;
export const GOLF_GREEN = {
  width: 5.2,
  depth: 3.5,
  fringe: 0.2,
  slope: 0.02,
} as const;
export const GOLF_VEGETATION_CLEARANCE = {
  back: 0.4,
  front: 1.1,
  openingNearHalfWidth: 1.45,
  openingFarHalfWidth: 0.9,
  cupSightlineFront: 2.8,
  cupSightlineHalfWidth: 0.75,
} as const;
export const GOLF_CUP = { radius: 0.125, depth: 0.12 } as const;

const pose = unitPose(TRAINING_UNIT_INDEX);
const yaw = pose.rotation[1];
const c = Math.cos(yaw);
const s = Math.sin(yaw);

export const GOLF_COURSE_CENTER = {
  x:
    pose.position[0] +
    GOLF_GREEN_CENTER_LOCAL[0] * c +
    GOLF_GREEN_CENTER_LOCAL[1] * s,
  z:
    pose.position[2] -
    GOLF_GREEN_CENTER_LOCAL[0] * s +
    GOLF_GREEN_CENTER_LOCAL[1] * c,
  yaw,
} as const;

export function golfCourseLocalPoint(x: number, z: number) {
  const dx = x - GOLF_COURSE_CENTER.x;
  const dz = z - GOLF_COURSE_CENTER.z;
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

export function golfCourseEllipseDistance(x: number, z: number) {
  const local = golfCourseLocalPoint(x, z);
  return Math.hypot(
    local.x / (GOLF_GREEN.width / 2),
    local.z / (GOLF_GREEN.depth / 2),
  );
}

export function golfSurfaceAt(x: number, z: number): GolfSurface {
  const local = golfCourseLocalPoint(x, z);
  const green = Math.hypot(
    local.x / (GOLF_GREEN.width / 2),
    local.z / (GOLF_GREEN.depth / 2),
  );
  if (green <= 1) return "green";
  const fringe = Math.hypot(
    local.x / (GOLF_GREEN.width / 2 + GOLF_GREEN.fringe),
    local.z / (GOLF_GREEN.depth / 2 + GOLF_GREEN.fringe),
  );
  return fringe <= 1 ? "fringe" : "rough";
}

/** Blends the meadow into a gently pitched putting surface. The blend starts
 * outside the fringe, so the shared terrain mesh has no height seam. */
export function golfCourseHeight(
  x: number,
  z: number,
  meadowHeight: number,
  centerHeight: number,
): number {
  const local = golfCourseLocalPoint(x, z);
  const outerX = GOLF_GREEN.width / 2 + GOLF_GREEN.fringe;
  const outerZ = GOLF_GREEN.depth / 2 + GOLF_GREEN.fringe;
  const distance = Math.hypot(local.x / outerX, local.z / outerZ);
  if (distance >= 1) return meadowHeight;
  // Start feathering well inside the fringe. The far meadow bank is already
  // rolling at this depth, so a short blend can turn a visually seamless edge
  // into an abrupt collision normal even though both ends have zero slope.
  const blend = 1 - smoothstep(0.45, 1, distance);
  const greenHeight = centerHeight + local.z * GOLF_GREEN.slope;
  return meadowHeight + (greenHeight - meadowHeight) * blend;
}

export function suppressGolfVegetation(
  x: number,
  z: number,
  _seed: number,
): { grassScale: number; flowers: boolean } {
  const local = golfCourseLocalPoint(x, z);
  if (golfSurfaceAt(x, z) !== "rough") return { grassScale: 0, flowers: false };

  const outerX = GOLF_GREEN.width / 2 + GOLF_GREEN.fringe;
  const outerZ = GOLF_GREEN.depth / 2 + GOLF_GREEN.fringe;
  if (local.z < 0) {
    const protectedBack = Math.hypot(
      local.x / outerX,
      local.z / (outerZ + GOLF_VEGETATION_CLEARANCE.back),
    );
    if (protectedBack <= 1) return { grassScale: 0, flowers: false };
  } else {
    const openingProgress = Math.min(
      1,
      Math.max(0, (local.z - outerZ) / GOLF_VEGETATION_CLEARANCE.front),
    );
    const openingHalfWidth =
      GOLF_VEGETATION_CLEARANCE.openingNearHalfWidth +
      (GOLF_VEGETATION_CLEARANCE.openingFarHalfWidth -
        GOLF_VEGETATION_CLEARANCE.openingNearHalfWidth) *
        openingProgress;
    const insideOpeningDepth =
      local.z >= outerZ && local.z <= outerZ + GOLF_VEGETATION_CLEARANCE.front;
    if (insideOpeningDepth && Math.abs(local.x) <= openingHalfWidth)
      return { grassScale: 0, flowers: false };
    // Continue only a narrow slot toward the camera. This removes the one
    // projected tuft that can cover the cup while preserving the tall left
    // and right banks that frame the opening.
    const insideCupSightline =
      local.z >= outerZ &&
      local.z <= outerZ + GOLF_VEGETATION_CLEARANCE.cupSightlineFront;
    if (
      insideCupSightline &&
      Math.abs(local.x) <= GOLF_VEGETATION_CLEARANCE.cupSightlineHalfWidth
    )
      return { grassScale: 0, flowers: false };
  }
  return { grassScale: 1, flowers: true };
}

function smoothstep(a: number, b: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
