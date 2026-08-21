import { SHELF_GEOMETRY } from "../shelfGeometry";
import { GOLF_BALL_RADIUS } from "../units/trainingGolfBall";

import type { GolfBallId, GolfVec3 } from "./golfTypes";

/** The source model is 341.72 units tall from its pointed tip to its cup. A
 * little over half of the scaled tee is pushed into the meadow. */
export const GOLF_TEE_SCALE = 0.00036;
export const GOLF_TEE_MODEL_HEIGHT = 341.72 * GOLF_TEE_SCALE;
export const GOLF_TEE_VISIBLE_HEIGHT = 0.04;
export const GOLF_TEE_BURIED_DEPTH =
  GOLF_TEE_MODEL_HEIGHT - GOLF_TEE_VISIBLE_HEIGHT;

/** The golf bay sits in the open aisle between the Training shelf and its
 * neighbour. Balls are deliberately separated by at least 28 cm so their
 * interaction targets and physical colliders never begin overlapped. */
export const GOLF_BALL_STARTS: Record<GolfBallId, GolfVec3> = {
  one: {
    x: -2.46,
    y: SHELF_GEOMETRY.groundY + GOLF_TEE_VISIBLE_HEIGHT + GOLF_BALL_RADIUS,
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

/** Once its tee has been removed, ball one resets beside the empty tee hole
 * at ordinary ground height. Keeping this authored avoids a physics-dependent
 * reset mark and leaves enough room if the tee later returns home. */
export const GOLF_BALL_UNTEED_START: GolfVec3 = {
  x: GOLF_BALL_STARTS.one.x + 0.14,
  y: SHELF_GEOMETRY.groundY + GOLF_BALL_RADIUS,
  z: GOLF_BALL_STARTS.one.z,
};

/** One tee now explains why the first ball is elevated. The other two are
 * loose spares, scattered within reach without forming a decorative row. */
export const GOLF_TEE_LAYOUT = [
  {
    id: "stand",
    position: [
      GOLF_BALL_STARTS.one.x,
      SHELF_GEOMETRY.groundY,
      GOLF_BALL_STARTS.one.z,
    ],
    modelPosition: [0, -GOLF_TEE_BURIED_DEPTH, 0],
    rotation: [0, 0.18, 0],
    tint: "#f2ede2",
    draggable: true,
  },
  {
    id: "near-spare",
    position: [-2.05, SHELF_GEOMETRY.groundY + 0.014, 0.91],
    modelPosition: [0, 0, 0],
    rotation: [Math.PI / 2, 1.31, 0.08],
    tint: "#f2ede2",
    draggable: true,
  },
  {
    id: "white-spare",
    position: [-1.78, SHELF_GEOMETRY.groundY + 0.014, 0.79],
    modelPosition: [0, 0, 0],
    rotation: [Math.PI / 2, 2.42, -0.06],
    tint: "#f2ede2",
    draggable: true,
  },
] as const;
export const GOLF_TEES_INTERACTIVE = GOLF_TEE_LAYOUT.some(
  (tee) => tee.draggable,
);

export const GOLF_CLUB_SCALE = 2.35;
export const GOLF_CLUB_GRIP_HEIGHT = 0.76866675 * GOLF_CLUB_SCALE;
/** The iron's authored striking face points along model +X. The corrective
 * half-turn held through impact combines with this display yaw to point it
 * down the rig's -Z shot axis. */
export const GOLF_CLUB_MODEL_YAW = -Math.PI / 2;
export const GOLF_CLUB_REST_BASE: GolfVec3 = {
  x: -2.9,
  y: SHELF_GEOMETRY.groundY,
  z: 0.02,
};

/** Conservative grip-pivot bounds shared by touch projection and unit
 * visibility tests. The visual club lives inside this volume at rest. */
export const GOLF_CLUB_PROJECTED_LOCAL_BOUNDS = {
  min: [-0.34, -GOLF_CLUB_GRIP_HEIGHT - 0.18, -0.34] as const,
  max: [0.4, 0.25, 0.4] as const,
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
