import * as THREE from "three";

import {
  GOLF_CLUB_GRIP_HEIGHT,
  GOLF_CLUB_HEAD_CONTACT_FROM_BASE,
  GOLF_CLUB_MODEL_YAW,
  GOLF_CLUB_REST_BASE,
} from "./golfLayout";
import type { GolfStrikeSnapshot } from "./golfStrikeQueue";
import type { GolfVec3 } from "./golfTypes";

export type GolfClubPose = {
  position: GolfVec3;
  rotation: GolfVec3;
  shaftTwist: number;
};

const REST_LEAN = -0.08;
const REST_YAW = 0.04;
const BACKSWING = -1.02;

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
  const impactRotation = { x: 0, y: shotYaw, z: 0 };
  const rotatedContact = rotateContact(impactRotation, Math.PI);
  const impactPivot = {
    x: ball.x - rotatedContact.x,
    y: ball.y - rotatedContact.y,
    z: ball.z - rotatedContact.z,
  };

  if (strike.stage === "address") {
    const t = ease(strike.elapsed / 0.1);
    return {
      position: mixVec(restPivot, impactPivot, t),
      rotation: {
        x: mix(REST_LEAN, 0, t),
        y: mixAngle(REST_YAW, shotYaw, t),
        z: 0,
      },
      shaftTwist: mix(0, Math.PI, t),
    };
  }
  if (strike.stage === "backswing") {
    const t = ease((strike.elapsed - 0.1) / 0.15);
    return {
      position: impactPivot,
      rotation: { x: mix(0, BACKSWING, t), y: shotYaw, z: 0 },
      shaftTwist: Math.PI,
    };
  }
  if (strike.stage === "downswing") {
    const t = ease((strike.elapsed - 0.25) / 0.1);
    return {
      position: impactPivot,
      rotation: { x: mix(BACKSWING, 0, t), y: shotYaw, z: 0 },
      shaftTwist: Math.PI,
    };
  }
  const t = ease((strike.elapsed - 0.35) / 0.15);
  return {
    position: mixVec(impactPivot, restPivot, t),
    rotation: {
      x: mix(0, REST_LEAN, t),
      y: mixAngle(shotYaw, REST_YAW, t),
      z: 0,
    },
    shaftTwist: mix(Math.PI, 0, t),
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

/** World-space normal of the model's actual striking face. Keeping this in
 * the pure rig makes it possible to catch a visually backwards impact even
 * when the clubhead itself still reaches the ball. */
export function golfClubFaceNormal(pose: GolfClubPose): GolfVec3 {
  // The corrective half-turn presents the grooved face at impact. Its normal
  // is model +X after that correction, not the visually similar back plate.
  const normal = new THREE.Vector3(1, 0, 0);
  normal.applyEuler(
    new THREE.Euler(0, GOLF_CLUB_MODEL_YAW + pose.shaftTwist, 0, "YXZ"),
  );
  normal.applyEuler(
    new THREE.Euler(pose.rotation.x, pose.rotation.y, pose.rotation.z, "YXZ"),
  );
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
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}
