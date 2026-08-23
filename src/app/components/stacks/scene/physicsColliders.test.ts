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
import { MUSINGS_PAPER_STACK } from "./musingsShelfGeometry";

function mesh(
  size: [number, number, number] = [0.2, 0.2, 0.2],
  position: [number, number, number] = [0, 0, 0],
) {
  const value = new THREE.Mesh(new THREE.BoxGeometry(...size));
  value.position.set(...position);
  return value;
}

function roundedPhotoMesh() {
  const width = 0.246;
  const height = 0.35;
  const depth = 0.008;
  const radius = 0.003;
  const epsilon = 0.00001;
  const roundedRadius = radius - epsilon;
  const shape = new THREE.Shape();
  shape.absarc(epsilon, epsilon, epsilon, -Math.PI / 2, -Math.PI, true);
  shape.absarc(
    epsilon,
    height - roundedRadius * 2,
    epsilon,
    Math.PI,
    Math.PI / 2,
    true,
  );
  shape.absarc(
    width - roundedRadius * 2,
    height - roundedRadius * 2,
    epsilon,
    Math.PI / 2,
    0,
    true,
  );
  shape.absarc(
    width - roundedRadius * 2,
    epsilon,
    epsilon,
    0,
    -Math.PI / 2,
    true,
  );
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - radius * 2,
    bevelEnabled: true,
    bevelSegments: 8,
    steps: 1,
    bevelSize: radius - epsilon,
    bevelThickness: radius,
    curveSegments: 2,
  });
  geometry.center();
  return new THREE.Mesh(geometry);
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
  it("keeps a rounded photo authored at the minimum collider thickness", () => {
    const root = new THREE.Group();
    root.add(roundedPhotoMesh());

    const result = extractDynamicColliderBoxes(root);

    expect(result.boxes).toHaveLength(1);
    expect(result.boxes[0]!.halfExtents.z * 2).toBeCloseTo(0.008);
  });

  it("gives the five-sheet Musings paper stack a shelf-sized dynamic hull", () => {
    const root = new THREE.Group();
    const paperWidth = MUSINGS_PAPER_STACK.width;
    const paperDepth = MUSINGS_PAPER_STACK.depth;
    const paperThickness = MUSINGS_PAPER_STACK.sheetThickness;
    const sheetStep = MUSINGS_PAPER_STACK.sheetStep;
    for (let index = 0; index < MUSINGS_PAPER_STACK.sheetCount; index++) {
      const sheet = mesh(
        [paperWidth, paperThickness, paperDepth],
        [
          index * 0.006 - 0.012,
          paperThickness / 2 + index * sheetStep,
          index * -0.004 + 0.008,
        ],
      );
      sheet.rotation.y = ((index * 61.17) % 1) * 0.14 - 0.07;
      root.add(sheet);
    }
    root.add(
      mesh(
        [
          MUSINGS_PAPER_STACK.colliderWidth,
          MUSINGS_PAPER_STACK.colliderHeight,
          MUSINGS_PAPER_STACK.colliderDepth,
        ],
        [0, MUSINGS_PAPER_STACK.colliderCenterY, 0],
      ),
    );

    const result = extractDynamicColliderBoxes(root);
    const extent = result.bounds?.getSize(new THREE.Vector3());

    expect(result.boxes.length).toBeGreaterThan(0);
    expect(extent?.x).toBeGreaterThan(0.5);
    expect(extent?.z).toBeGreaterThan(0.4);
  });

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

  it.each(["potted-plant", "barbell", "headphones", "desk-lamp"])(
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

  it("splits the lighthouse into a bounded compound at its shelf scale", async () => {
    // At source scale (397 units tall) the lighthouse is dozens of islands
    // and falls back to one box. At the 0.0016 it ships at, every railing post
    // and pane bar is thinner than MIN_COLLIDER_EXTENT and drops out, and
    // what remains is the honest compound: tower, plinth, lantern, rails.
    // Extraction measures relative to the root it is handed, so the scale
    // has to sit BELOW that root, the way ModelProp's primitive sits under
    // the Grabbable carrier in the scene.
    const model = await loadModel("lighthouse");
    model.scale.setScalar(0.0016);
    const owner = new THREE.Group();
    owner.add(model);
    const result = extractDynamicColliderBoxes(owner);
    expect(result.boxes.length).toBeGreaterThan(1);
    expect(result.boxes.length).toBeLessThanOrEqual(
      MAX_DYNAMIC_COLLIDER_SHAPES,
    );
    expect(
      result.boxes.some((box) => box.source === "root-aabb-fallback"),
    ).toBe(false);
  });

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
