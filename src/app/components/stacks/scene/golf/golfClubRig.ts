import { GOLF_BALL_RADIUS } from "../units/trainingGolfBall";
import * as THREE from "three";

import {
  GOLF_CLUB_FACE_CENTER_MODEL,
  GOLF_CLUB_GRIP_HEIGHT,
  GOLF_CLUB_HEAD_CONTACT_FROM_BASE,
  GOLF_CLUB_HEAD_MODEL_BOUNDS,
  GOLF_CLUB_MODEL_YAW,
  GOLF_CLUB_REST_BASE,
} from "./golfLayout";
import {
  GOLF_IMPACT_AT,
  GOLF_STRIKE_TIMING,
  type GolfStrikeSnapshot,
} from "./golfStrikeQueue";
import type { GolfVec3 } from "./golfTypes";

export type GolfClubPose = {
  position: GolfVec3;
  rotation: GolfVec3;
  shaftTwist: number;
};

export function golfClubHintRotation(
  amount: number,
  pointerX = 0,
  pointerY = 0,
) {
  const strength = THREE.MathUtils.clamp(amount, 0, 1);
  // The head hangs below the grip pivot, so its visible horizontal travel is
  // opposite the yaw input. Reverse the cursor before deriving that rotation.
  const x = -THREE.MathUtils.clamp(pointerX, -1, 1);
  const y = THREE.MathUtils.clamp(pointerY, -1, 1);
  return {
    x: THREE.MathUtils.degToRad(-1 + y * 0.8) * strength,
    y: THREE.MathUtils.degToRad(8 + x * 5) * strength,
    z: THREE.MathUtils.degToRad(-x * 2) * strength,
    lift: (0.028 + Math.max(0, y) * 0.008) * strength,
  };
}

/** Preserve the idle pointer pose at the start of address, then remove it
 * before the backswing begins so the authored strike remains untouched. */
export function golfClubIdleBlend(strike: GolfStrikeSnapshot): number {
  if (!strike.current) return 1;
  if (strike.stage !== "address") return 0;
  return 1 - ease(strike.elapsed / GOLF_STRIKE_TIMING.address);
}

export function golfClubPointerFollowRequested(
  golfFocused: boolean,
  strike: GolfStrikeSnapshot,
): boolean {
  return golfFocused && strike.current === null && strike.queued.length === 0;
}

const REST_LEAN = -0.08;
const REST_YAW = 0.04;
const BACKSWING = -1.02;
const IMPACT_LEAN = THREE.MathUtils.degToRad(7);
const SWING_PLANE_TILT = THREE.MathUtils.degToRad(12);
const RELEASE_TILT = THREE.MathUtils.degToRad(-5);
const HAND_PATH_RISE = 0.055;
export const GOLF_CLUB_ADDRESS_GAP = 0.025;
const GOLF_CLUB_FACE_PROTRUSION =
  GOLF_CLUB_HEAD_MODEL_BOUNDS.x[1] - GOLF_CLUB_FACE_CENTER_MODEL.x;
const FOLLOW_THROUGH_FRACTION = 0.25;
const FOLLOW_THROUGH =
  IMPACT_LEAN +
  (IMPACT_LEAN - BACKSWING) *
    ((GOLF_STRIKE_TIMING.recovery * FOLLOW_THROUGH_FRACTION) /
      GOLF_STRIKE_TIMING.downswing);

const restPivot = {
  x: GOLF_CLUB_REST_BASE.x,
  y: GOLF_CLUB_REST_BASE.y + GOLF_CLUB_GRIP_HEIGHT,
  z: GOLF_CLUB_REST_BASE.z,
};

/** Contact in a grip-centred rig. The long negative Y offset is intentional:
 * it is what makes rotations swing the clubhead around the hands instead of
 * turning the handle in place around the club's centre. */
export const GOLF_CLUB_HEAD_FROM_GRIP = {
  x: GOLF_CLUB_HEAD_CONTACT_FROM_BASE.x,
  y: GOLF_CLUB_HEAD_CONTACT_FROM_BASE.y - GOLF_CLUB_GRIP_HEIGHT,
  z: GOLF_CLUB_HEAD_CONTACT_FROM_BASE.z,
};

export function golfClubPose(
  strike: GolfStrikeSnapshot,
  ball: GolfVec3 | null,
  cup: GolfVec3,
): GolfClubPose {
  if (!strike.current || !ball)
    return {
      position: { ...restPivot },
      rotation: { x: REST_LEAN, y: REST_YAW, z: 0 },
      shaftTwist: 0,
    };

  const dx = cup.x - ball.x;
  const dz = cup.z - ball.z;
  const shotYaw = Math.atan2(-dx, -dz);
  const impactRotation = {
    x: IMPACT_LEAN,
    y: shotYaw,
    z: SWING_PLANE_TILT,
  };
  const rotatedContact = rotateContact(impactRotation, Math.PI);
  const impactFaceNormal = rotateFaceNormal(impactRotation, Math.PI);
  const impactOffset = GOLF_BALL_RADIUS + GOLF_CLUB_FACE_PROTRUSION;
  const impactContact = {
    x: ball.x - impactFaceNormal.x * impactOffset,
    y: ball.y - impactFaceNormal.y * impactOffset,
    z: ball.z - impactFaceNormal.z * impactOffset,
  };
  const impactPivot = {
    x: impactContact.x - rotatedContact.x,
    y: impactContact.y - rotatedContact.y,
    z: impactContact.z - rotatedContact.z,
  };
  const addressPivot = {
    x: impactPivot.x - impactFaceNormal.x * GOLF_CLUB_ADDRESS_GAP,
    y: impactPivot.y - impactFaceNormal.y * GOLF_CLUB_ADDRESS_GAP,
    z: impactPivot.z - impactFaceNormal.z * GOLF_CLUB_ADDRESS_GAP,
  };

  if (strike.stage === "address") {
    const t = ease(strike.elapsed / GOLF_STRIKE_TIMING.address);
    return {
      position: mixVec(restPivot, addressPivot, t),
      rotation: {
        x: mix(REST_LEAN, IMPACT_LEAN, t),
        y: mixAngle(REST_YAW, shotYaw, t),
        z: mix(0, SWING_PLANE_TILT, t),
      },
      shaftTwist: mix(0, Math.PI, t),
    };
  }
  if (strike.stage === "backswing") {
    const t = ease(
      (strike.elapsed - GOLF_STRIKE_TIMING.address) /
        GOLF_STRIKE_TIMING.backswing,
    );
    return {
      position: {
        ...addressPivot,
        y: addressPivot.y + HAND_PATH_RISE * t,
      },
      rotation: {
        x: mix(IMPACT_LEAN, BACKSWING, t),
        y: shotYaw,
        z: SWING_PLANE_TILT,
      },
      shaftTwist: Math.PI,
    };
  }
  if (strike.stage === "downswing") {
    const t = clamp01(
      (strike.elapsed -
        GOLF_STRIKE_TIMING.address -
        GOLF_STRIKE_TIMING.backswing) /
        GOLF_STRIKE_TIMING.downswing,
    );
    const handPath = mixVec(addressPivot, impactPivot, ease(t));
    return {
      position: {
        x: handPath.x,
        y: handPath.y + HAND_PATH_RISE * ease(1 - t),
        z: handPath.z,
      },
      // A quarter cosine is the angular path of a pendulum released from
      // rest: zero velocity at the top, maximum velocity through contact.
      rotation: {
        x:
          IMPACT_LEAN + (BACKSWING - IMPACT_LEAN) * Math.cos((Math.PI / 2) * t),
        y: shotYaw,
        z: SWING_PLANE_TILT,
      },
      shaftTwist: Math.PI,
    };
  }
  const recovery = clamp01(
    (strike.elapsed - GOLF_IMPACT_AT) / GOLF_STRIKE_TIMING.recovery,
  );
  if (recovery < FOLLOW_THROUGH_FRACTION) {
    const t = recovery / FOLLOW_THROUGH_FRACTION;
    return {
      position: impactPivot,
      // Match the downswing's non-zero impact velocity, then let the club
      // decelerate naturally as it rises into the follow-through.
      rotation: {
        x:
          IMPACT_LEAN +
          (FOLLOW_THROUGH - IMPACT_LEAN) * Math.sin((Math.PI / 2) * t),
        y: shotYaw,
        z: mix(SWING_PLANE_TILT, RELEASE_TILT, ease(t)),
      },
      shaftTwist: Math.PI + THREE.MathUtils.degToRad(8) * ease(t),
    };
  }
  const t = ease(
    (recovery - FOLLOW_THROUGH_FRACTION) / (1 - FOLLOW_THROUGH_FRACTION),
  );
  return {
    position: mixVec(impactPivot, restPivot, t),
    rotation: {
      x: mix(FOLLOW_THROUGH, REST_LEAN, t),
      y: mixAngle(shotYaw, REST_YAW, t),
      z: mix(RELEASE_TILT, 0, t),
    },
    shaftTwist: mix(Math.PI + THREE.MathUtils.degToRad(8), 0, t),
  };
}

export function golfClubContactPoint(pose: GolfClubPose): GolfVec3 {
  const contact = rotateContact(pose.rotation, pose.shaftTwist);
  return {
    x: pose.position.x + contact.x,
    y: pose.position.y + contact.y,
    z: pose.position.z + contact.z,
  };
}

/** Signed clearance between the rendered iron head and a golf ball. A
 * negative value means the head's oriented bounds intersect the ball. */
export function golfClubHeadClearance(
  pose: GolfClubPose,
  ball: GolfVec3,
): number {
  const local = new THREE.Vector3(
    ball.x - pose.position.x,
    ball.y - pose.position.y,
    ball.z - pose.position.z,
  );
  local.applyQuaternion(
    new THREE.Quaternion()
      .setFromEuler(
        new THREE.Euler(
          pose.rotation.x,
          pose.rotation.y,
          pose.rotation.z,
          "YXZ",
        ),
      )
      .invert(),
  );
  local.applyQuaternion(
    new THREE.Quaternion()
      .setFromEuler(
        new THREE.Euler(0, GOLF_CLUB_MODEL_YAW + pose.shaftTwist, 0, "YXZ"),
      )
      .invert(),
  );
  local.y += GOLF_CLUB_GRIP_HEIGHT;

  const closest = new THREE.Vector3(
    THREE.MathUtils.clamp(
      local.x,
      GOLF_CLUB_HEAD_MODEL_BOUNDS.x[0],
      GOLF_CLUB_HEAD_MODEL_BOUNDS.x[1],
    ),
    THREE.MathUtils.clamp(
      local.y,
      GOLF_CLUB_HEAD_MODEL_BOUNDS.y[0],
      GOLF_CLUB_HEAD_MODEL_BOUNDS.y[1],
    ),
    THREE.MathUtils.clamp(
      local.z,
      GOLF_CLUB_HEAD_MODEL_BOUNDS.z[0],
      GOLF_CLUB_HEAD_MODEL_BOUNDS.z[1],
    ),
  );
  return local.distanceTo(closest) - GOLF_BALL_RADIUS;
}

/** World-space normal of the model's actual striking face. Keeping this in
 * the pure rig makes it possible to catch a visually backwards impact even
 * when the clubhead itself still reaches the ball. */
export function golfClubFaceNormal(pose: GolfClubPose): GolfVec3 {
  return rotateFaceNormal(pose.rotation, pose.shaftTwist);
}

function rotateFaceNormal(rotation: GolfVec3, shaftTwist: number): GolfVec3 {
  // The corrective half-turn presents the grooved face at impact. Its normal
  // is model +X after that correction, not the visually similar back plate.
  const normal = new THREE.Vector3(1, 0, 0);
  normal.applyEuler(
    new THREE.Euler(0, GOLF_CLUB_MODEL_YAW + shaftTwist, 0, "YXZ"),
  );
  normal.applyEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z, "YXZ"));
  return { x: normal.x, y: normal.y, z: normal.z };
}

function rotateContact(rotation: GolfVec3, shaftTwist: number): GolfVec3 {
  const value = new THREE.Vector3(
    GOLF_CLUB_HEAD_FROM_GRIP.x,
    GOLF_CLUB_HEAD_FROM_GRIP.y,
    GOLF_CLUB_HEAD_FROM_GRIP.z,
  );
  value.applyEuler(new THREE.Euler(0, shaftTwist, 0, "YXZ"));
  value.applyEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z, "YXZ"));
  return { x: value.x, y: value.y, z: value.z };
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * THREE.MathUtils.clamp(t, 0, 1);
}

function mixAngle(a: number, b: number, t: number) {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}

function mixVec(a: GolfVec3, b: GolfVec3, t: number): GolfVec3 {
  return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t) };
}

function ease(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function clamp01(value: number) {
  return THREE.MathUtils.clamp(value, 0, 1);
}
