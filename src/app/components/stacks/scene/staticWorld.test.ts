import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  findFrozenStaticWorldMutation,
  freezeStaticWorldRoot,
  updateManualWorldMatrix,
} from "./staticWorld";

describe("the explicit static-world allowlist", () => {
  it("freezes automatic local and world matrix work for the whole subtree", () => {
    const root = new THREE.Group();
    root.position.set(2, 3, 4);
    const child = new THREE.Mesh(new THREE.BoxGeometry());
    child.position.set(1, 0, 0);
    root.add(child);

    const release = freezeStaticWorldRoot(root, "test-root");

    expect(root.matrixAutoUpdate).toBe(false);
    expect(root.matrixWorldAutoUpdate).toBe(false);
    expect(child.matrixAutoUpdate).toBe(false);
    expect(child.matrixWorldAutoUpdate).toBe(false);
    expect(child.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([
      3, 3, 4,
    ]);

    release();
    expect(root.matrixAutoUpdate).toBe(true);
    expect(child.matrixWorldAutoUpdate).toBe(true);
    child.geometry.dispose();
  });

  it("flags a frozen object whose authored transform later changes", () => {
    const root = new THREE.Group();
    const child = new THREE.Object3D();
    child.name = "unexpected-motion";
    root.add(child);
    const release = freezeStaticWorldRoot(root, "test-root");

    child.position.x = 1;

    expect(findFrozenStaticWorldMutation()).toMatchObject({
      rootId: "test-root",
      object: child,
    });
    release();
  });

  it("updates an explicitly managed moving object's world matrix", () => {
    const parent = new THREE.Group();
    parent.position.x = 4;
    parent.updateMatrixWorld(true);
    const child = new THREE.Object3D();
    child.matrixAutoUpdate = false;
    child.matrixWorldAutoUpdate = false;
    parent.add(child);

    child.position.x = 3;
    updateManualWorldMatrix(child);

    expect(child.getWorldPosition(new THREE.Vector3()).x).toBe(7);
  });

  it("leaves a grabbable sibling live while a static root is frozen", () => {
    const scene = new THREE.Scene();
    const staticRoot = new THREE.Group();
    const grabbable = new THREE.Group();
    scene.add(staticRoot, grabbable);
    const release = freezeStaticWorldRoot(staticRoot, "test-root");

    grabbable.position.x = 2;
    scene.updateMatrixWorld(true);

    expect(staticRoot.matrixWorldAutoUpdate).toBe(false);
    expect(grabbable.matrixAutoUpdate).toBe(true);
    expect(grabbable.matrixWorldAutoUpdate).toBe(true);
    expect(grabbable.getWorldPosition(new THREE.Vector3()).x).toBe(2);
    release();
  });
});
