import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { artifactFaceBasis } from "./interactionProjection";

/** A framed print: a thin photo plane plus a slightly larger paper backing,
 * the way FlatPrint builds one. `innerRotation` is the tilt authored on the
 * children — the flat rest pose and the hover hinge both live in here, INSIDE
 * the interaction root, which is the whole reason the root's own axes cannot
 * describe the face. */
function print({
  innerRotation = [0, 0, 0] as [number, number, number],
  width = 0.24,
  height = 0.24,
  border = 0.014,
} = {}) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.set(...innerRotation);
  root.add(inner);
  const paper = new THREE.Mesh(
    new THREE.BoxGeometry(width + border * 2, height + border * 2, 0.004),
  );
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(width, height));
  photo.position.z = 0.0025;
  inner.add(paper, photo);
  root.updateMatrixWorld(true);
  return root;
}

describe("artifact face basis", () => {
  it("finds the face of an upright print", () => {
    const basis = artifactFaceBasis(print());
    expect(basis).not.toBeNull();
    // In-plane axes, and a plane whose normal faces along z.
    expect(Math.abs(basis!.u.dot(basis!.v))).toBeLessThan(1e-6);
    expect(basis!.uMax - basis!.uMin).toBeCloseTo(0.24 + 0.028, 4);
    expect(basis!.vMax - basis!.vMin).toBeCloseTo(0.24 + 0.028, 4);
  });

  it("follows a print LYING FLAT, whose tilt is authored on its children", () => {
    // facingRotation [PI/2, 0, 0] is how the arch print is laid on the shelf.
    const flat = print({ innerRotation: [Math.PI / 2, 0, 0] });
    const basis = artifactFaceBasis(flat);
    expect(basis).not.toBeNull();
    // The face is now horizontal: its normal points up, so BOTH in-plane axes
    // are horizontal. Reading the root's local x/y instead would have
    // described a vertical plane and snapped the print upright on frame one.
    const normal = new THREE.Vector3().crossVectors(basis!.u, basis!.v);
    expect(Math.abs(normal.y)).toBeGreaterThan(0.99);
    expect(Math.abs(basis!.u.y)).toBeLessThan(1e-6);
    expect(Math.abs(basis!.v.y)).toBeLessThan(1e-6);
    // Extent is unchanged by the pose — a rotation cannot resize the print.
    expect(basis!.uMax - basis!.uMin).toBeCloseTo(0.268, 4);
    expect(basis!.vMax - basis!.vMin).toBeCloseTo(0.268, 4);
  });

  it("follows a hover-hinged print part way up", () => {
    const hinged = print({ innerRotation: [Math.PI / 2.6, 0, 0] });
    const basis = artifactFaceBasis(hinged);
    expect(basis).not.toBeNull();
    const normal = new THREE.Vector3().crossVectors(basis!.u, basis!.v);
    // Tilted: neither flat-on nor upright.
    expect(Math.abs(normal.y)).toBeGreaterThan(0.1);
    expect(Math.abs(normal.y)).toBeLessThan(0.99);
    // The measured face keeps its true size at every angle, which is what
    // stops the distance solve from shrinking a tilted print.
    expect(basis!.uMax - basis!.uMin).toBeCloseTo(0.268, 4);
    expect(basis!.vMax - basis!.vMin).toBeCloseTo(0.268, 4);
  });

  it("measures a non-square print's two sides separately", () => {
    const basis = artifactFaceBasis(print({ width: 0.306, height: 0.204 }));
    expect(basis).not.toBeNull();
    const spans = [basis!.uMax - basis!.uMin, basis!.vMax - basis!.vMin].sort(
      (a, b) => a - b,
    );
    expect(spans[0]).toBeCloseTo(0.204 + 0.028, 4);
    expect(spans[1]).toBeCloseTo(0.306 + 0.028, 4);
  });

  it("declines a subtree with no flat carrier", () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1)));
    root.updateMatrixWorld(true);
    expect(artifactFaceBasis(root)).toBeNull();
  });

  it("ignores meshes the scene has hidden or excluded", () => {
    const root = print();
    // A much larger hidden plane must not become the carrier; presentation
    // branches leave these mounted.
    const ghost = new THREE.Mesh(new THREE.PlaneGeometry(4, 4));
    ghost.visible = false;
    root.add(ghost);
    const excluded = new THREE.Mesh(new THREE.PlaneGeometry(4, 4));
    excluded.userData.physicsIgnore = true;
    root.add(excluded);
    root.updateMatrixWorld(true);
    const basis = artifactFaceBasis(root);
    expect(basis).not.toBeNull();
    expect(basis!.uMax - basis!.uMin).toBeCloseTo(0.268, 4);
  });
});
