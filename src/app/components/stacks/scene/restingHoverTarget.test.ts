import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { hingeShift } from "./Lift";
import { cameraSideHoverTilt } from "./hoverTilt";
import { hingeFor, hingePivotForTilt, meshBoxInLocal } from "./interaction";
import { createRestingHoverRaycast } from "./restingHoverTarget";

function photoRig(enabled = () => true, hovered = () => false) {
  const carrier = new THREE.Group();
  const nod = new THREE.Group();
  const print = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.005, 0.21));
  print.position.y = 0.0025;
  nod.add(print);
  carrier.add(nod);
  const target = new THREE.Group();
  target.userData.physicsIgnore = true;
  target.raycast = createRestingHoverRaycast(() => nod, enabled, hovered);
  carrier.add(target);
  carrier.updateMatrixWorld(true);
  return { carrier, nod, print, target };
}

function pointerAt(
  point: THREE.Vector3,
  direction = new THREE.Vector3(0, -1, 0),
) {
  direction.normalize();
  return new THREE.Raycaster(
    point.clone().addScaledVector(direction, -1),
    direction,
  );
}

describe("resting photo hover target", () => {
  it("expands only after entry and retains a sweep below the Arch print", () => {
    let hovered = false;
    const { carrier, nod, print, target } = photoRig(
      () => true,
      () => hovered,
    );
    // Arch's square print, border and authored yaw, seen from shelf height.
    print.geometry = new THREE.BoxGeometry(0.268, 0.005, 0.268);
    print.rotation.y = 0.2202;
    carrier.updateMatrixWorld(true);
    const lowerEdgeRay = (x: number) =>
      pointerAt(
        new THREE.Vector3(x, -0.012, 0.13),
        new THREE.Vector3(0, -0.02, -1),
      );
    expect(lowerEdgeRay(0).intersectObject(carrier, true)).toHaveLength(0);
    expect(pointerAt(new THREE.Vector3()).intersectObject(target)).toHaveLength(
      1,
    );
    hovered = true;
    const angle = Math.PI / 3;
    const pivot = hingePivotForTilt(hingeFor(nod, false)!, angle);
    for (let frame = 0; frame <= 60; frame++) {
      nod.rotation.x = (angle * frame) / 60;
      nod.position.copy(hingeShift(pivot, nod.rotation, undefined));
      nod.position.y += (0.025 * frame) / 60;
      carrier.updateMatrixWorld(true);
      expect(
        lowerEdgeRay(-0.1 + frame / 300).intersectObject(target),
        `frame ${frame}`,
      ).toHaveLength(1);
    }
    expect(lowerEdgeRay(0.3).intersectObject(target)).toHaveLength(0);
    hovered = false;
    expect(lowerEdgeRay(0).intersectObject(target)).toHaveLength(0);
  });

  it("fills the gap between the flat footprint and lifted front edge", () => {
    let hovered = false;
    const { carrier, nod, target } = photoRig(
      () => true,
      () => hovered,
    );
    pointerAt(new THREE.Vector3()).intersectObject(target);
    const angle = Math.PI / 3;
    const pivot = hingePivotForTilt(hingeFor(nod, false)!, angle);
    nod.rotation.x = angle;
    nod.position.copy(hingeShift(pivot, nod.rotation, undefined));
    nod.position.y += 0.025;
    carrier.updateMatrixWorld(true);
    const gapRay = pointerAt(
      new THREE.Vector3(0, 0.015, 0.105),
      new THREE.Vector3(0, -0.02, -1),
    );
    expect(gapRay.intersectObject(carrier, true)).toHaveLength(0);
    hovered = true;
    expect(gapRay.intersectObject(target)).toHaveLength(1);
  });

  it("keeps the largest reached area until exit, then resets it", () => {
    let hovered = true;
    const { carrier, nod, target } = photoRig(
      () => true,
      () => hovered,
    );
    pointerAt(new THREE.Vector3()).intersectObject(target);
    const angle = (Math.PI / 3) * 1.12;
    const pivot = hingePivotForTilt(hingeFor(nod, false)!, angle);
    nod.rotation.x = angle;
    nod.position.copy(hingeShift(pivot, nod.rotation, undefined));
    nod.position.y += 0.028;
    carrier.updateMatrixWorld(true);
    const upperRay = pointerAt(
      new THREE.Vector3(0, 0.24, 0),
      new THREE.Vector3(0, 0, -1),
    );
    expect(upperRay.intersectObject(target)).toHaveLength(1);
    nod.rotation.set(0, 0, 0);
    nod.position.set(0, 0, 0);
    carrier.updateMatrixWorld(true);
    expect(upperRay.intersectObject(target)).toHaveLength(1);
    hovered = false;
    expect(upperRay.intersectObject(target)).toHaveLength(0);
    hovered = true;
    expect(upperRay.intersectObject(target)).toHaveLength(0);
  });

  it.each([-1, 1])(
    "keeps the resting footprint through opening and return, camera side %s",
    (side) => {
      const { carrier, nod, target } = photoRig();
      // A cursor near the rising edge used to lose the photo halfway open.
      const ray = pointerAt(new THREE.Vector3(0, 0.005, -0.08 * side));
      expect(ray.intersectObject(carrier, true).length).toBeGreaterThan(0);
      const angle = cameraSideHoverTilt({ z: side * 5.8 }, Math.PI / 3);
      const pivot = hingePivotForTilt(hingeFor(nod, false)!, angle);
      for (let frame = 0; frame <= 120; frame++) {
        const amount = 1 - Math.abs(frame - 60) / 60;
        nod.rotation.x = angle * amount;
        nod.position.copy(hingeShift(pivot, nod.rotation, undefined));
        nod.position.y += amount * 0.025;
        carrier.updateMatrixWorld(true);
        expect(
          ray.intersectObject(carrier, true).length,
          `frame ${frame}`,
        ).toBeGreaterThan(0);
      }
      // A nearby prop or empty shelf must still be able to take the pointer.
      expect(
        pointerAt(new THREE.Vector3(0.2, 0, 0)).intersectObject(target),
      ).toHaveLength(0);
    },
  );

  it("keeps the raised print interactive outside the resting footprint", () => {
    const { carrier, nod, target } = photoRig();
    pointerAt(new THREE.Vector3()).intersectObject(target);
    const angle = Math.PI / 3;
    nod.rotation.x = angle;
    nod.position.copy(
      hingeShift(
        hingePivotForTilt(hingeFor(nod, false)!, angle),
        nod.rotation,
        undefined,
      ),
    );
    nod.position.y += 0.025;
    carrier.updateMatrixWorld(true);
    const point = nod.localToWorld(new THREE.Vector3(0, 0.005, -0.05));
    const ray = pointerAt(point, new THREE.Vector3(0, -0.1, -1));
    expect(ray.intersectObject(target)).toHaveLength(0);
    expect(ray.intersectObject(nod, true).length).toBeGreaterThan(0);
  });

  it("follows carrier translation, rotation and scale without leaving a target behind", () => {
    const { carrier, target } = photoRig();
    const oldPointer = pointerAt(new THREE.Vector3());
    expect(oldPointer.intersectObject(target)).toHaveLength(1);
    carrier.position.set(2, 1, -1);
    carrier.rotation.set(0.2, 0.7, 0.1);
    carrier.scale.setScalar(1.4);
    carrier.updateMatrixWorld(true);
    const point = carrier.localToWorld(new THREE.Vector3());
    expect(pointerAt(point).intersectObject(target)).toHaveLength(1);
    expect(oldPointer.intersectObject(target)).toHaveLength(0);
  });

  it("disables the resting target during carrying and preview, and when hidden", () => {
    let enabled = true;
    const { carrier, target } = photoRig(() => enabled);
    const ray = pointerAt(new THREE.Vector3());
    expect(ray.intersectObject(target)).toHaveLength(1);
    enabled = false;
    expect(ray.intersectObject(target)).toHaveLength(0);
    enabled = true;
    carrier.visible = false;
    expect(ray.intersectObject(target)).toHaveLength(0);
    carrier.visible = true;
    expect(ray.intersectObject(target)).toHaveLength(1);
  });

  it("does not change measured prop dimensions or allocate helper geometry", () => {
    const { carrier, nod, target } = photoRig();
    pointerAt(new THREE.Vector3()).intersectObject(target);
    expect(meshBoxInLocal(carrier)).toEqual(meshBoxInLocal(nod));
    expect(target).not.toBeInstanceOf(THREE.Mesh);
  });

  it("retries empty geometry and respects ray distance limits", () => {
    const visual = new THREE.Group();
    const target = new THREE.Group();
    target.raycast = createRestingHoverRaycast(
      () => visual,
      () => true,
    );
    const ray = pointerAt(new THREE.Vector3());
    expect(ray.intersectObject(target)).toHaveLength(0);
    visual.add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.005, 0.21)));
    expect(ray.intersectObject(target)).toHaveLength(1);
    ray.far = 0.5;
    expect(ray.intersectObject(target)).toHaveLength(0);
    ray.far = 2;
    ray.near = 1.5;
    expect(ray.intersectObject(target)).toHaveLength(0);
  });
});
