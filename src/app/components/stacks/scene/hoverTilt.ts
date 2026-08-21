import * as THREE from "three";

/**
 * Signed local-X rotation that turns a prop's front normal toward the camera.
 *
 * A positive X rotation moves the top edge toward +Z, but it points the face
 * downward. That only faces the camera when the camera is below the prop. The
 * camera sits at different heights relative to top-shelf, lower-shelf, and
 * portrait compositions, so the sign has to come from the live camera rather
 * than from a scene-wide constant.
 *
 * NOT THE HOVER NOD, since 2026-08-20. This is a FACE-SHOWING solver and the
 * angle it returns is the camera's elevation over the prop, with `maximum` as
 * a ceiling rather than the amount. On this camera (y 0.25, z 5.8) that meant
 * a top-shelf prop tilted 2.1 degrees no matter what the constant said, a
 * lower-shelf one 10.9, and only floor props ever reached the cap — so raising
 * the constant moved almost nothing, which is exactly how "the movements are
 * all too subtle" survived two amplitude passes. It also leans a prop's top
 * AWAY from a camera sitting above it, pivoting on the rear edge so the front
 * lifts off the plank, which reads as recoiling rather than answering.
 * `cameraSideHoverTilt` is what the nod uses now. Kept because showing a flat
 * prop's face to the camera is still a real gesture, and a signature reaction
 * for a photograph or a cover will want it.
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

/**
 * A fixed opening angle whose sign follows the camera side of a flat prop.
 *
 * Unlike cameraFacingHoverTilt, this does not stop when the surface points at
 * the camera. It is for covers and photographs that need to open by an exact
 * authored amount while keeping the camera-nearest edge planted.
 */
/**
 * Signed local-X rotation that leans a prop's top TOWARD the camera by an
 * exact angle.
 *
 * The angle is the amount, not a ceiling: every prop leans the same authored
 * distance wherever it sits, which is the property `cameraFacingHoverTilt`
 * could not give the nod. Only the SIGN comes from the camera, and only from
 * which side of the prop it is on, because leaning toward a viewer is a
 * horizontal question and their height does not change the answer.
 *
 * The pivot follows for free: `hingePivotForTilt` hands a positive tilt the
 * front-bottom edge, so the prop rocks forward onto the edge nearest you and
 * lifts its rear, the way a real object tips when it leans out at you.
 */
export function cameraSideHoverTilt(
  cameraDirection: Pick<THREE.Vector3, "z">,
  angle: number,
) {
  if (angle <= 0) return 0;
  return cameraDirection.z < 0 ? -angle : angle;
}

/**
 * Signed local-Z travel that moves a prop TOWARD the camera.
 *
 * The slide that stands in for a lean there was no room for (see
 * `leanClearance.ts`). Same sign convention as `cameraSideHoverTilt`, and
 * deliberately the same input, so a prop that trades its lean for a slide
 * moves toward the same side it would have leaned toward. Pulling a book out
 * of a stack away from the viewer would be a worse answer than not moving.
 */
export function cameraSideSlide(
  cameraDirection: Pick<THREE.Vector3, "z">,
  distance: number,
) {
  if (distance <= 0) return 0;
  return cameraDirection.z < 0 ? -distance : distance;
}
