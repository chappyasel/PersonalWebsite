import { MeshoptDecoder } from "meshoptimizer";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import {
  DYNAMIC_COLLIDER_HORIZONTAL_INSET,
  FOLIAGE_BASE_HORIZONTAL_INSET,
  MAX_DYNAMIC_COLLIDER_SHAPES,
  MAX_STATIC_COLLIDER_SHAPES,
  extractColliderBoxes,
  extractDynamicColliderBoxes,
} from "./physicsColliders";

function mesh(
  size: [number, number, number] = [0.2, 0.2, 0.2],
  position: [number, number, number] = [0, 0, 0],
) {
  const value = new THREE.Mesh(new THREE.BoxGeometry(...size));
  value.position.set(...position);
  return value;
}

async function loadModel(name: string) {
  const bytes = fs.readFileSync(
    path.resolve(process.cwd(), `public/models/${name}.glb`),
  );
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  return (
    await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(buffer, "")
  ).scene;
}

describe("physics collider extraction", () => {
  it("preserves the local orientation of a rotated book", () => {
    const root = new THREE.Group();
    const book = mesh([0.18, 0.42, 0.06]);
    book.rotation.z = 0.4;
    root.add(book);

    const result = extractColliderBoxes(root, {
      maxShapes: MAX_DYNAMIC_COLLIDER_SHAPES,
      fallbackToBounds: true,
    });

    expect(result.boxes).toHaveLength(1);
    expect(result.boxes[0]!.quaternion.angleTo(book.quaternion)).toBeLessThan(
      1e-6,
    );
    expect(result.boxes[0]!.halfExtents.x).toBeCloseTo(0.09);
    expect(result.bounds!.getSize(new THREE.Vector3()).x).toBeGreaterThan(0.18);
  });

  it("merges touching boxes only when their orientations match", () => {
    const root = new THREE.Group();
    root.add(mesh([0.2, 0.2, 0.2], [-0.1, 0, 0]));
    root.add(mesh([0.2, 0.2, 0.2], [0.1, 0, 0]));
    const rotated = mesh([0.2, 0.2, 0.2], [0.31, 0, 0]);
    rotated.rotation.y = 0.3;
    root.add(rotated);

    expect(extractColliderBoxes(root).boxes).toHaveLength(2);
  });

  it("keeps disconnected dynamic parts granular instead of filling their gaps", () => {
    const root = new THREE.Group();
    for (let index = 0; index < 9; index++)
      root.add(mesh([0.02, 0.02, 0.02], [index * 0.05, 0, 0]));
    const result = extractDynamicColliderBoxes(root);
    expect(result.boxes).toHaveLength(9);
    expect(
      result.boxes.every((box) => box.source !== "root-aabb-fallback"),
    ).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it.each(["potted-plant", "barbell", "headphones", "sailboat", "desk-lamp"])(
    "splits the real %s model into a bounded compound",
    async (name) => {
      const root = await loadModel(name);
      const result = extractDynamicColliderBoxes(root);
      expect(result.boxes.length).toBeGreaterThan(1);
      expect(result.boxes.length).toBeLessThanOrEqual(
        MAX_DYNAMIC_COLLIDER_SHAPES,
      );
      expect(
        result.boxes.some((box) => box.source === "root-aabb-fallback"),
      ).toBe(false);
    },
  );

  it.each(["potted-plant", "succulent-pot", "pothos", "cactus", "yucca-plant"])(
    "reduces leafy %s collision to its solid planter base",
    async (name) => {
      const result = extractDynamicColliderBoxes(
        await loadModel(name),
        "foliage-base",
      );
      expect(result.boxes).toHaveLength(1);
      expect(result.boxes[0]!.source).toContain(":island:");
      expect(result.boxes[0]!.source).not.toBe("root-aabb-fallback");
      expect(result.reasons).toEqual([]);
    },
  );

  it("insets a planter horizontally while preserving its shelf contact", () => {
    const root = new THREE.Group();
    root.add(mesh([1, 0.4, 1], [0, 0.2, 0]));
    root.add(mesh([0.8, 1.2, 0.1], [0, 0.9, 0]));

    const result = extractDynamicColliderBoxes(root, "foliage-base");
    const planter = result.boxes[0]!;

    expect(planter.halfExtents.x).toBeCloseTo(
      0.5 * FOLIAGE_BASE_HORIZONTAL_INSET,
    );
    expect(planter.halfExtents.z).toBeCloseTo(
      0.5 * FOLIAGE_BASE_HORIZONTAL_INSET,
    );
    expect(planter.offset.y - planter.halfExtents.y).toBeCloseTo(0);
    expect(
      planter.halfExtents.x * DYNAMIC_COLLIDER_HORIZONTAL_INSET,
    ).toBeLessThan(0.4);
  });

  it("excludes sprites, invisible meshes, and registered dynamic descendants", () => {
    const root = new THREE.Group();
    const wrapper = new THREE.Group();
    const dynamic = new THREE.Group();
    dynamic.add(mesh());
    wrapper.add(dynamic, mesh([0.1, 0.1, 0.1], [0.5, 0, 0]));
    const invisible = mesh();
    invisible.visible = false;
    root.add(wrapper, invisible, new THREE.Sprite());
    const result = extractColliderBoxes(root, {
      excludeRoots: new Set([dynamic]),
    });
    expect(result.boxes).toHaveLength(1);
    expect(result.boxes[0]!.offset.x).toBeCloseTo(0.5);
  });

  it("publishes deterministic static truncation", () => {
    const root = new THREE.Group();
    for (let index = 0; index < MAX_STATIC_COLLIDER_SHAPES + 3; index++)
      root.add(mesh([0.01, 0.01, 0.01], [index * 0.03, 0, 0]));
    const result = extractColliderBoxes(root, {
      maxShapes: MAX_STATIC_COLLIDER_SHAPES,
    });
    expect(result.boxes).toHaveLength(MAX_STATIC_COLLIDER_SHAPES);
    expect(result.reasons).toEqual(["static-budget-truncated"]);
  });
});
