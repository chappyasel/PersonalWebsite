import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { artifactFaceCameraFrame } from "./artifactFacePose";
import type { ArtifactFaceBasis } from "./interactionProjection";

/** A camera at +z looking down -z, the shelf's usual view. */
const CAMERA_POSITION = new THREE.Vector3(0, 0, 3);
const CAMERA_QUATERNION = new THREE.Quaternion();

function basis(
  u: [number, number, number],
  v: [number, number, number],
  { width = 0.3, height = 0.2 } = {},
): ArtifactFaceBasis {
  return {
    u: new THREE.Vector3(...u).normalize(),
    v: new THREE.Vector3(...v).normalize(),
    origin: new THREE.Vector3(0, 0, 0),
    uMin: -width / 2,
    uMax: width / 2,
    vMin: -height / 2,
    vMax: height / 2,
  };
}

/** Every frame this produces must be a rotation, never a reflection: a print
 * is rigid, so a basis whose u x v disagrees with its normal would be asking
 * the object to turn inside out — which renders as the photo mirrored, or as
 * the print's blank back. */
function expectRightHanded(frame: {
  u: THREE.Vector3;
  v: THREE.Vector3;
  normal: THREE.Vector3;
}) {
  const cross = new THREE.Vector3().crossVectors(frame.u, frame.v);
  expect(cross.dot(frame.normal)).toBeCloseTo(1, 6);
  expect(frame.u.dot(frame.v)).toBeCloseTo(0, 6);
  expect(frame.u.dot(frame.normal)).toBeCloseTo(0, 6);
  expect(frame.v.dot(frame.normal)).toBeCloseTo(0, 6);
}

/** The photo must end up facing the viewer, upright and unmirrored. */
function expectFacesViewer(frame: {
  u: THREE.Vector3;
  v: THREE.Vector3;
  normal: THREE.Vector3;
}) {
  expectRightHanded(frame);
  expect(frame.normal.z).toBeGreaterThan(0); // out of the screen
  expect(frame.v.y).toBeGreaterThan(0); // screen-up
  expect(frame.u.x).toBeGreaterThan(0); // screen-right
}

describe("artifact face camera frame", () => {
  it("resolves an upright print", () => {
    const frame = artifactFaceCameraFrame(
      basis([1, 0, 0], [0, 1, 0]),
      CAMERA_QUATERNION,
      CAMERA_POSITION,
    )!;
    expect(frame).not.toBeNull();
    expectFacesViewer(frame);
    expect(frame.width).toBeCloseTo(0.3, 6);
    expect(frame.height).toBeCloseTo(0.2, 6);
  });

  // The regression this module exists for. Negating u and v independently
  // against the camera flips u x v once, so this authoring — identical
  // geometry, opposite axis signs — used to resolve to a normal pointing
  // AWAY from the viewer and turned the print's back to the camera.
  it("faces the viewer even when the mesh axes are authored backwards", () => {
    const frame = artifactFaceCameraFrame(
      basis([-1, 0, 0], [0, 1, 0]),
      CAMERA_QUATERNION,
      CAMERA_POSITION,
    )!;
    expectFacesViewer(frame);
  });

  it("faces the viewer for either sign of either axis", () => {
    for (const su of [1, -1])
      for (const sv of [1, -1]) {
        const frame = artifactFaceCameraFrame(
          basis([su, 0, 0], [0, sv, 0]),
          CAMERA_QUATERNION,
          CAMERA_POSITION,
        )!;
        expect(frame).not.toBeNull();
        expectFacesViewer(frame);
      }
  });

  it("handles a print LYING FLAT, whose axes are both horizontal", () => {
    // Face-up on the shelf: in-plane axes are x and z, normal is world up.
    // Nothing about world-vertical can order these; the camera can.
    const camera = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-0.35, 0, 0), // pitched down at the shelf
    );
    const position = new THREE.Vector3(0, 1, 3);
    for (const su of [1, -1])
      for (const sz of [1, -1]) {
        const frame = artifactFaceCameraFrame(
          basis([su, 0, 0], [0, 0, sz]),
          camera,
          position,
        )!;
        expect(frame).not.toBeNull();
        expectRightHanded(frame);
        // Facing up toward a camera that is above it.
        expect(frame.normal.y).toBeGreaterThan(0);
      }
  });

  it("handles a yawed print", () => {
    const yaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      0.5,
    );
    const u = new THREE.Vector3(1, 0, 0).applyQuaternion(yaw);
    const v = new THREE.Vector3(0, 1, 0).applyQuaternion(yaw);
    const frame = artifactFaceCameraFrame(
      basis([u.x, u.y, u.z], [v.x, v.y, v.z]),
      CAMERA_QUATERNION,
      CAMERA_POSITION,
    )!;
    expectRightHanded(frame);
    expect(frame.normal.z).toBeGreaterThan(0);
    expect(frame.v.y).toBeGreaterThan(0);
    // The yaw is preserved as the object's pose; the frame just describes it.
    expect(frame.width).toBeCloseTo(0.3, 6);
  });

  it("keeps a rolled print's width on its own long axis", () => {
    const roll = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      0.3,
    );
    const u = new THREE.Vector3(1, 0, 0).applyQuaternion(roll);
    const v = new THREE.Vector3(0, 1, 0).applyQuaternion(roll);
    const frame = artifactFaceCameraFrame(
      basis([u.x, u.y, u.z], [v.x, v.y, v.z]),
      CAMERA_QUATERNION,
      CAMERA_POSITION,
    )!;
    expectFacesViewer(frame);
    // A small roll must not swap which side is the width.
    expect(frame.width).toBeCloseTo(0.3, 6);
    expect(frame.height).toBeCloseTo(0.2, 6);
  });

  it("swaps width and height when the print's long axis is the vertical one", () => {
    // Same plane, axes named the other way round: v is now the 0.3 side.
    const frame = artifactFaceCameraFrame(
      basis([0, 1, 0], [1, 0, 0], { width: 0.3, height: 0.2 }),
      CAMERA_QUATERNION,
      CAMERA_POSITION,
    )!;
    expectRightHanded(frame);
    // u is screen-right, and the screen-right extent is the 0.2 one here.
    expect(frame.width).toBeCloseTo(0.2, 6);
    expect(frame.height).toBeCloseTo(0.3, 6);
  });

  // The narrow failure the rewrite was for. Ordering the axes by testing each
  // against the camera and negating independently gets simple poses right —
  // axis-aligned prints, single-axis tilts — and turns the print's BACK to
  // the camera on 3.7% of general orientations, which takes a compound
  // yaw+pitch+roll to reach. A sweep is the only honest way to hold this:
  // hand-picked cases are exactly what it slips past.
  it("faces the viewer across a sweep of compound orientations", () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const toCamera = new THREE.Vector3(0, 0, 1);
    let tested = 0;
    for (let sample = 0; sample < 20000; sample += 1) {
      const spin = new THREE.Quaternion(
        random() * 2 - 1,
        random() * 2 - 1,
        random() * 2 - 1,
        random() * 2 - 1,
      ).normalize();
      const u = new THREE.Vector3(1, 0, 0).applyQuaternion(spin);
      const v = new THREE.Vector3(0, 1, 0).applyQuaternion(spin);
      // Skip near edge-on planes: a print you cannot see is not openable, and
      // its facing side is genuinely ambiguous.
      const plane = new THREE.Vector3().crossVectors(u, v).normalize();
      if (Math.abs(plane.dot(toCamera)) < 0.15) continue;
      tested += 1;
      const frame = artifactFaceCameraFrame(
        basis([u.x, u.y, u.z], [v.x, v.y, v.z]),
        CAMERA_QUATERNION,
        CAMERA_POSITION,
      );
      expect(frame).not.toBeNull();
      expectRightHanded(frame!);
      expect(frame!.normal.dot(toCamera)).toBeGreaterThan(0);
    }
    expect(tested).toBeGreaterThan(10000);
  });

  it("declines a degenerate plane", () => {
    expect(
      artifactFaceCameraFrame(
        basis([1, 0, 0], [1, 0, 0]),
        CAMERA_QUATERNION,
        CAMERA_POSITION,
      ),
    ).toBeNull();
  });
});
