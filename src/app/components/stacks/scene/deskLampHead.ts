import * as THREE from "three";

/** Center of the arm/shade contact patch measured from desk-lamp.glb. The
 * original rear-vent point is not a hinge: rotating around it visibly tears
 * the shade away from the arm. */
export const DESK_LAMP_HEAD_PIVOT = [0, 0.34283, -0.010554] as const;
export const DESK_LAMP_HEAD_AXIS = [0, -0.9167, 0.3996] as const;
export const DESK_LAMP_HEAD_NODE = "stacks-desk-lamp-head";
export const DESK_LAMP_SHADE_NODE = "stacks-desk-lamp-shade";
export const DESK_LAMP_SHADE_GLOW_NODE = "stacks-desk-lamp-shade-glow";
export const DESK_LAMP_SHADE_LENGTH = 0.11;
export const DESK_LAMP_MOUTH_RADIUS = 0.0543;
export const DESK_LAMP_SHADE_VENT = [0, 0.3989, 0.0107] as const;

export type QuaternionTuple = readonly [number, number, number, number];
export type VectorTuple = readonly [number, number, number];

const NORMALIZED_HEAD_AXIS = new THREE.Vector3(
  ...DESK_LAMP_HEAD_AXIS,
).normalize();

/** One source of truth for every fixture point measured along the shade.
 * Distance zero is the mouth; negative values move back inside the cup. */
export function deskLampPointAlongAxis(distanceFromMouth: number): VectorTuple {
  const point = new THREE.Vector3(...DESK_LAMP_SHADE_VENT).addScaledVector(
    NORMALIZED_HEAD_AXIS,
    DESK_LAMP_SHADE_LENGTH + distanceFromMouth,
  );
  return [point.x, point.y, point.z];
}

export const DESK_LAMP_MOUTH = deskLampPointAlongAxis(0);

/** CircleGeometry faces +Z. This lays that normal onto the measured shade
 * axis; deriving it prevents the aperture plane and the light vector from
 * becoming two independently tuned directions. */
export const DESK_LAMP_MOUTH_TILT = Math.atan2(
  -NORMALIZED_HEAD_AXIS.y,
  NORMALIZED_HEAD_AXIS.z,
);

/** Resolve a head rotation from a target expressed in the lamp carrier's
 * unscaled frame. The hinge is offset from the shade axis, so simply pointing
 * the axis from the hinge misses the target. Instead, find a point on the
 * authored light ray with the target's hinge radius, then rotate that point
 * onto the target. The transformed mouth and direction therefore describe a
 * ray that passes through the target exactly. */
export function deskLampHeadQuaternionForTarget({
  target,
  rootYaw,
  rootScale,
}: {
  target: VectorTuple;
  rootYaw: number;
  rootScale: number;
}): QuaternionTuple {
  const root = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, rootYaw, 0),
  );
  const localTarget = new THREE.Vector3(...target)
    .applyQuaternion(root.clone().invert())
    .multiplyScalar(1 / rootScale);
  const pivot = new THREE.Vector3(...DESK_LAMP_HEAD_PIVOT);
  const targetFromHinge = localTarget.sub(pivot);
  const mouthFromHinge = new THREE.Vector3(...DESK_LAMP_MOUTH).sub(pivot);
  const along = mouthFromHinge.dot(NORMALIZED_HEAD_AXIS);
  const discriminant =
    along * along + targetFromHinge.lengthSq() - mouthFromHinge.lengthSq();
  const distanceAlongRay = -along + Math.sqrt(Math.max(0, discriminant));
  const pointOnRay = mouthFromHinge.addScaledVector(
    NORMALIZED_HEAD_AXIS,
    distanceAlongRay,
  );
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    pointOnRay.normalize(),
    targetFromHinge.normalize(),
  );
  return [rotation.x, rotation.y, rotation.z, rotation.w];
}

/** Apply the exact live articulation chain to a point measured on the head. */
export function articulatedDeskLampPoint({
  point,
  headQuaternion,
  rootPosition,
  rootYaw,
  rootScale,
}: {
  point: VectorTuple;
  headQuaternion: QuaternionTuple;
  rootPosition: VectorTuple;
  rootYaw: number;
  rootScale: number;
}): [number, number, number] {
  const pivot = new THREE.Vector3(...DESK_LAMP_HEAD_PIVOT);
  const head = new THREE.Quaternion(...headQuaternion);
  const root = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, rootYaw, 0),
  );
  const result = new THREE.Vector3(...point)
    .sub(pivot)
    .applyQuaternion(head)
    .add(pivot)
    .multiplyScalar(rootScale)
    .applyQuaternion(root)
    .add(new THREE.Vector3(...rootPosition));
  return [result.x, result.y, result.z];
}

export function articulatedDeskLampDirection({
  direction,
  headQuaternion,
  rootYaw,
}: {
  direction: VectorTuple;
  headQuaternion: QuaternionTuple;
  rootYaw: number;
}): [number, number, number] {
  const result = new THREE.Vector3(...direction)
    .applyQuaternion(new THREE.Quaternion(...headQuaternion))
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), rootYaw)
    .normalize();
  return [result.x, result.y, result.z];
}
