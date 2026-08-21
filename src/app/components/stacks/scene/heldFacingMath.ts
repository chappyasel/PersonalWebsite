import * as THREE from "three";

/** Resolve a content-facing rotation into the carried object's parent frame. */
export function localCameraFacingQuaternion(
  parentWorld: THREE.Quaternion,
  cameraWorld: THREE.Quaternion,
  contentFacing: THREE.Quaternion,
  target: THREE.Quaternion,
) {
  return target
    .copy(parentWorld)
    .invert()
    .multiply(cameraWorld)
    .multiply(contentFacing);
}

/** Clearance needed while a broad face-up prop returns to its shelf pose. */
export function tiltedFaceClearance(
  localQuaternion: THREE.Quaternion,
  maximum: number,
) {
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(localQuaternion);
  return maximum * Math.hypot(up.x, up.z);
}
