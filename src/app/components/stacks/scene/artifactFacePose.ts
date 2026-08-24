"use client";

// Which way a print has to turn to face you.
//
// The handoff aims the print's FACE at the camera, not its group: a flat or
// pinned print carries its tilt on children inside the interaction root, so
// the root's own axes describe nothing. `artifactFaceBasis` finds the face
// plane; this resolves that plane into the frame the target orientation is
// built from, and it is the whole rotation — yaw, pitch and roll together,
// since a basis is a basis.
//
// The ordering rule is the delicate part, and getting it wrong is silent.
// Deriving the axes by testing each one's sign against the camera and
// negating independently LOOKS right and is not: every negation flips
// u x v, so the normal lands toward or away from the viewer depending on
// which way the artist happened to author the mesh, and a print whose
// normal came out backwards turns its BACK to the camera. Half the poses
// win that coin toss, which is exactly how a bug like this survives a
// spot check.
//
// So the normal is decided FIRST, from geometry rather than from axis signs:
// you can only open a print whose face you can see, so the face normal is
// whichever of the two plane normals points at the camera. `v` is then the
// print's own axis closest to screen-up, and `u` is DERIVED as v x n rather
// than chosen. That last step is what makes mirroring unrepresentable —
// there is no independent sign left to get wrong — and it lands u on
// screen-right automatically.
import * as THREE from "three";

import type { ArtifactFaceBasis } from "./interactionProjection";

export type ArtifactFaceCameraFrame = {
  /** Screen-right at the target. */
  u: THREE.Vector3;
  /** Screen-up at the target. */
  v: THREE.Vector3;
  /** Out of the photo, toward the viewer. */
  normal: THREE.Vector3;
  /** The framed print's extent along u and v, in world units. */
  width: number;
  height: number;
};

const cameraUp = new THREE.Vector3();
const toCamera = new THREE.Vector3();

export function artifactFaceCameraFrame(
  basis: ArtifactFaceBasis,
  cameraQuaternion: THREE.Quaternion,
  cameraPosition: THREE.Vector3,
): ArtifactFaceCameraFrame | null {
  const normal = new THREE.Vector3().crossVectors(basis.u, basis.v);
  if (normal.lengthSq() < 1e-8) return null;
  normal.normalize();
  // The side you are looking at. Not a preference — the print's other face
  // has no photograph on it.
  toCamera.copy(cameraPosition).sub(basis.origin);
  if (normal.dot(toCamera) < 0) normal.negate();

  // Screen-up, chosen among the print's OWN axes so width and height keep
  // meaning something. World-vertical cannot make this choice: a print lying
  // flat has two horizontal axes and no authored up, while the camera always
  // has one.
  cameraUp.set(0, 1, 0).applyQuaternion(cameraQuaternion);
  const upIsV =
    Math.abs(basis.v.dot(cameraUp)) >= Math.abs(basis.u.dot(cameraUp));
  const v = (upIsV ? basis.v : basis.u).clone();
  const width = upIsV ? basis.uMax - basis.uMin : basis.vMax - basis.vMin;
  const height = upIsV ? basis.vMax - basis.vMin : basis.uMax - basis.uMin;
  if (v.dot(cameraUp) < 0) v.negate();
  // Square v against the settled normal before deriving, so a basis that was
  // not quite orthogonal cannot skew the frame.
  v.addScaledVector(normal, -v.dot(normal));
  if (v.lengthSq() < 1e-8) return null;
  v.normalize();

  // Derived, never chosen: u x v == normal holds by construction, so the
  // frame is always a rotation and never a reflection.
  const u = new THREE.Vector3().crossVectors(v, normal).normalize();
  return { u, v, normal, width, height };
}
