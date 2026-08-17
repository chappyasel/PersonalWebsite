import { SHELF_GEOMETRY } from "../shelfGeometry";
import { GOLF_BALL_RADIUS } from "../units/trainingGolfBall";

import type { GolfBallId, GolfVec3 } from "./golfTypes";

/** The golf bay sits in the open aisle between the Training shelf and its
 * neighbour. Balls are deliberately separated by at least 28 cm so their
 * interaction targets and physical colliders never begin overlapped. */
export const GOLF_BALL_STARTS: Record<GolfBallId, GolfVec3> = {
  one: {
    x: -2.46,
    y: SHELF_GEOMETRY.groundY + GOLF_BALL_RADIUS,
    z: 0.68,
  },
  two: {
    x: -1.92,
    y: SHELF_GEOMETRY.groundY + GOLF_BALL_RADIUS,
    z: 0.62,
  },
  three: {
    x: -2.22,
    y: SHELF_GEOMETRY.groundY + GOLF_BALL_RADIUS,
    z: 0.1,
  },
  four: {
    x: -1.68,
    y: SHELF_GEOMETRY.groundY + GOLF_BALL_RADIUS,
    z: 0.16,
  },
};

/** Loose tees are silent visual dressing, not launch stands. They lie in the
 * foreground grass, clear of both the clubhead and the four launch paths. */
export const GOLF_TEE_STARTS = [
  [-2.25, 0.98],
  [-2.05, 0.9],
  [-1.84, 0.84],
] as const;
export const GOLF_TEE_ROTATIONS = [
  [Math.PI / 2, 0.24, -0.12],
  [Math.PI / 2, 1.31, 0.08],
  [Math.PI / 2, 2.18, -0.05],
] as const;
export const GOLF_TEES_INTERACTIVE = false;

export const GOLF_CLUB_SCALE = 2.35;
export const GOLF_CLUB_GRIP_HEIGHT = 0.76866675 * GOLF_CLUB_SCALE;
/** The iron's authored striking face points along model +X. The corrective
 * half-turn held through impact combines with this display yaw to point it
 * down the rig's -Z shot axis. */
export const GOLF_CLUB_MODEL_YAW = -Math.PI / 2;
export const GOLF_CLUB_REST_BASE: GolfVec3 = {
  x: -2.6,
  y: SHELF_GEOMETRY.groundY,
  z: 0.32,
};

export const GOLF_CLUB_HEAD_MODEL_BOUNDS = {
  x: [-0.026, 0.026],
  y: [0, 0.186],
  z: [-0.135, 0.186],
} as const;

/** Measured from the grooved +X striking surface of the decoded GLB, after
 * its authored node transform and the scene scale but before display yaw. */
export const GOLF_CLUB_FACE_CENTER_MODEL: GolfVec3 = {
  x: 0.025,
  y: 0.09,
  z: 0.025,
};

const modelYawCos = Math.cos(GOLF_CLUB_MODEL_YAW);
const modelYawSin = Math.sin(GOLF_CLUB_MODEL_YAW);
export const GOLF_CLUB_HEAD_CONTACT_FROM_BASE: GolfVec3 = {
  x:
    GOLF_CLUB_FACE_CENTER_MODEL.x * modelYawCos +
    GOLF_CLUB_FACE_CENTER_MODEL.z * modelYawSin,
  y: GOLF_CLUB_FACE_CENTER_MODEL.y,
  z:
    -GOLF_CLUB_FACE_CENTER_MODEL.x * modelYawSin +
    GOLF_CLUB_FACE_CENTER_MODEL.z * modelYawCos,
};

export function golfClubContactBeforeModelYaw(): GolfVec3 {
  const c = Math.cos(-GOLF_CLUB_MODEL_YAW);
  const s = Math.sin(-GOLF_CLUB_MODEL_YAW);
  return {
    x:
      GOLF_CLUB_HEAD_CONTACT_FROM_BASE.x * c +
      GOLF_CLUB_HEAD_CONTACT_FROM_BASE.z * s,
    y: GOLF_CLUB_HEAD_CONTACT_FROM_BASE.y,
    z:
      -GOLF_CLUB_HEAD_CONTACT_FROM_BASE.x * s +
      GOLF_CLUB_HEAD_CONTACT_FROM_BASE.z * c,
  };
}

export const GOLF_BALL_IDS = Object.keys(GOLF_BALL_STARTS) as GolfBallId[];
