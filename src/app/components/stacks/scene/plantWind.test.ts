import { MeshoptDecoder } from "meshoptimizer";
import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";

import { extractDynamicColliderBoxes } from "./physicsColliders";
import {
  PLANT_KINDS,
  type PlantKind,
  classifyPlant,
  createPlantWindBinding,
  createPlantWindClock,
  plantLeafWeight,
  plantStemWeight,
  stepPlantWindClock,
} from "./plantWind";
import { createPlantWindDiagnosticsController } from "./plantWindDiagnostics";

async function load(kind: PlantKind) {
  const bytes = fs.readFileSync(`public/models/${kind}.glb`);
  const root = (
    await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
        "",
      )
  ).scene;
  root.updateWorldMatrix(true, true);
  let mesh!: THREE.Mesh;
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) mesh = node as THREE.Mesh;
  });
  return { root, mesh };
}
const values = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) =>
  Array.from({ length: a.count }, (_, i) => [a.getX(i), a.getY(i), a.getZ(i)]);

for (const kind of PLANT_KINDS)
  describe(kind, () => {
    it("classifies the real asset, holds every pot/base vertex, and moves foliage", async () => {
      const { root, mesh } = await load(kind);
      const source = mesh.geometry;
      const before = values(source.getAttribute("position"));
      // The seam monstera is scenery; only the other five models use Grabbable.
      const collider =
        kind === "monstera"
          ? null
          : extractDynamicColliderBoxes(root, "foliage-base");
      const b = createPlantWindBinding(mesh, root, kind);
      expect(b.parts.pot.island.triangles).toHaveLength(
        {
          monstera: 198,
          pothos: 152,
          "potted-plant": 140,
          sansevieria: 206,
          "yucca-plant": 166,
          "succulent-pot": 206,
        }[kind],
      );
      expect(b.parts.leaves).toHaveLength(
        {
          monstera: 7,
          pothos: 13,
          "potted-plant": 14,
          sansevieria: 8,
          "yucca-plant": 12,
          "succulent-pot": 48,
        }[kind],
      );
      b.update(3, -0.5, -0.4, 1);
      const after = values(mesh.geometry.getAttribute("position"));
      for (const i of b.parts.fixed.flatMap((part) => part.vertices))
        expect(after[i]).toEqual(before[i]!.map(Math.fround));
      const fixedRoots = Array.from(b.base, (_, i) => i).filter(
        (i) =>
          b.base[i] === 0 &&
          b.tip[i] === 0 &&
          !b.parts.pot.vertices.includes(i),
      );
      expect(fixedRoots.length).toBeGreaterThan(4);
      for (const i of fixedRoots)
        expect(after[i]).toEqual(before[i]!.map(Math.fround));
      expect(
        after.filter((v, i) =>
          v.some((n, c) => n !== Math.fround(before[i]![c]!)),
        ).length,
      ).toBeGreaterThan(200);
      if (collider)
        expect(
          extractDynamicColliderBoxes(root, "foliage-base").signature,
        ).toBe(collider.signature);
      expect(values(source.getAttribute("position"))).toEqual(before);
      expect(mesh.material).toBeDefined();
      for (const [i, n] of values(
        mesh.geometry.getAttribute("normal"),
      ).entries()) {
        if (b.base[i] !== 0 || b.tip[i] !== 0)
          expect(Math.hypot(...n)).toBeCloseTo(1, 3);
      }
      b.dispose();
    });
    it("keeps the attachment collar quiet and its common stem field continuous", async () => {
      const { root, mesh } = await load(kind);
      const b = createPlantWindBinding(mesh, root, kind);
      for (const leaf of b.parts.leaves) {
        expect(plantLeafWeight(leaf.attachment, leaf)).toBe(0);
        expect(
          plantLeafWeight(
            leaf.attachment
              .clone()
              .addScaledVector(leaf.axis, leaf.collar * 0.95),
            leaf,
          ),
        ).toBe(0);
        expect(
          plantLeafWeight(
            leaf.attachment.clone().addScaledVector(leaf.axis, leaf.length),
            leaf,
          ),
        ).toBeGreaterThan(leaf.length * 0.5);
        const a = plantStemWeight(leaf.attachment, b.parts.pot.island, kind);
        const s = plantStemWeight(
          leaf.stemAttachment,
          b.parts.pot.island,
          kind,
        );
        // Bound extra separation across the asset's existing surface gap at
        // strong wind. The independent leaf bend is exactly zero at the join.
        expect(Math.abs(a - s) * 0.3).toBeLessThan(0.006);
      }
      b.dispose();
    });
    it("returns exact rest arrays, keeps rest raycasts, and disposes only its clone", async () => {
      const { root, mesh } = await load(kind);
      const source = mesh.geometry;
      const sourceDispose = vi.spyOn(source, "dispose");
      const material = mesh.material;
      const rest = values(source.getAttribute("position")).map((v) =>
        v.map(Math.fround),
      );
      const normals = values(source.getAttribute("normal")).map((v) =>
        v.map(Math.fround),
      );
      const originalRaycast = vi.fn(function (this: THREE.Mesh) {
        expect(this.geometry).toBe(source);
      });
      mesh.raycast = originalRaycast;
      for (let cycle = 0; cycle < 3; cycle++) {
        const b = createPlantWindBinding(mesh, root, kind);
        const dispose = vi.spyOn(b.geometry, "dispose");
        expect(values(b.geometry.getAttribute("position"))).toEqual(rest);
        b.update(2, -0.2, -0.2, 1);
        mesh.raycast(new THREE.Raycaster(), []);
        expect(mesh.geometry).toBe(b.geometry);
        b.update(4, -0.1, -0.1, 0);
        expect(values(b.geometry.getAttribute("position"))).toEqual(rest);
        expect(values(b.geometry.getAttribute("normal"))).toEqual(normals);
        b.dispose();
        b.dispose();
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(mesh.geometry).toBe(source);
        expect(mesh.material).toBe(material);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mesh.raycast).toBe(originalRaycast);
      }
      expect(sourceDispose).not.toHaveBeenCalled();
    });
    it("does not depend on triangle/island order and rejects unreviewed geometry", async () => {
      const { root, mesh } = await load(kind);
      const geometry = mesh.geometry.clone();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          values(mesh.geometry.getAttribute("position")).flat(),
          3,
        ),
      );
      geometry.applyMatrix4(mesh.matrixWorld);
      const index = geometry.index!;
      const triangles = Array.from({ length: index.count / 3 }, (_, t) => [
        index.getX(t * 3),
        index.getX(t * 3 + 1),
        index.getX(t * 3 + 2),
      ]).reverse();
      geometry.setIndex(triangles.flat());
      expect(classifyPlant(geometry, kind).leaves).toHaveLength(
        {
          monstera: 7,
          pothos: 13,
          "potted-plant": 14,
          sansevieria: 8,
          "yucca-plant": 12,
          "succulent-pot": 48,
        }[kind],
      );
      geometry.scale(1, 1.3, 1);
      expect(() => classifyPlant(geometry, kind)).toThrow(
        /classification changed/,
      );
      geometry.dispose();
      root.clear();
    });
  });

it("requires live handoff, resets on retry/reduced motion, and clamps resume time", () => {
  const state = createPlantWindClock();
  const gate = {
    epoch: 1,
    live: false,
    reduced: false,
    paused: false,
    delta: 1 / 60,
  };
  for (let i = 0; i < 500; i++)
    expect(stepPlantWindClock(state, gate)).toBe(false);
  expect(state.ramp).toBe(0);
  gate.live = true;
  stepPlantWindClock(state, gate);
  expect(state.ramp).toBeLessThan(0.01);
  const snapshot = { ...state };
  gate.paused = true;
  gate.delta = 600;
  expect(stepPlantWindClock(state, gate)).toBe(false);
  expect(state).toEqual(snapshot);
  gate.paused = false;
  stepPlantWindClock(state, gate);
  expect(state.time - snapshot.time).toBeCloseTo(1 / 30);
  gate.reduced = true;
  stepPlantWindClock(state, gate);
  expect(state.ramp).toBe(0);
  gate.reduced = false;
  gate.epoch++;
  expect(stepPlantWindClock(state, gate)).toBe(false);
  expect(state.time).toBe(0);
});

it("keeps the plant pause toggle in session memory with clean subscriptions", () => {
  const store = createPlantWindDiagnosticsController();
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);
  expect(store.getSnapshot()).toBe(true);
  store.setEnabled(false);
  store.setEnabled(false);
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  store.setEnabled(true);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(createPlantWindDiagnosticsController().getSnapshot()).toBe(true);
});

it("preserves the Talks foliage-base collider even if extraction runs during wind", async () => {
  const { root, mesh } = await load("pothos");
  const before = extractDynamicColliderBoxes(root, "foliage-base");
  const binding = createPlantWindBinding(mesh, root, "pothos");
  binding.update(8, -0.25, -0.25, 1);
  const after = extractDynamicColliderBoxes(root, "foliage-base");
  expect(after.signature).toBe(before.signature);
  expect(after.boxes).toHaveLength(1);
  expect(
    after.boxes[0]!.halfExtents.distanceTo(before.boxes[0]!.halfExtents),
  ).toBeLessThan(1e-6);
  binding.dispose();
});
