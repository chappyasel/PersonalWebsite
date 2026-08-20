import * as THREE from "three";

/**
 * Signed local-X rotation that turns a prop's front normal toward the camera.
 *
 * A positive X rotation moves the top edge toward +Z, but it points the face
 * downward. That only faces the camera when the camera is below the prop. The
 * camera sits at different heights relative to top-shelf, lower-shelf, and
 * portrait compositions, so the sign has to come from the live camera rather
 * than from a scene-wide constant.
 */
export function cameraFacingHoverTilt(
  cameraDirection: Pick<THREE.Vector3, "y" | "z">,
  maximum: number,
) {
  if (maximum <= 0) return 0;
  const desired = -Math.atan2(cameraDirection.y, cameraDirection.z);
  if (Math.abs(desired) < Number.EPSILON) return 0;
  return THREE.MathUtils.clamp(desired, -maximum, maximum);
}
