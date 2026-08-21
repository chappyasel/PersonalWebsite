import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  type InsectPerch,
  insectPerchCatalog,
  readInsectPerchWorld,
  resolveInsectPerch,
} from "./insectPerches";
import { registerSceneInteraction } from "./interactionRegistry";

describe("authored insect Perches", () => {
  it("provides at least seven distinctive sites on every unit", () => {
    const catalog = insectPerchCatalog();
    expect(catalog).toHaveLength(7);
    for (const unit of catalog) {
      expect(unit.length).toBeGreaterThanOrEqual(7);
      expect(new Set(unit.map((perch) => perch.id)).size).toBe(unit.length);
      expect(
        unit.every((perch) => "ownerId" in perch || "ownerPrefix" in perch),
      ).toBe(true);
    }
  });

  it("makes every moth site explicitly lamp-bound", () => {
    const lampPerches = insectPerchCatalog()
      .flat()
      .filter((perch) => "lampId" in perch);
    expect(lampPerches).toHaveLength(4);
    expect(lampPerches.every((perch) => Boolean(perch.lampId))).toBe(true);
  });

  it("authors recognizable object-top sites instead of anonymous shelf ledges", () => {
    const catalog = insectPerchCatalog().flat();
    expect(catalog.some((perch) => perch.id === "about:aic-crown")).toBe(true);
    expect(catalog.some((perch) => perch.id === "books:life-3-0-pages")).toBe(
      true,
    );
    // The bar. Both plates are outside the Flight Volume — the barbell lies
    // diagonally, so one is 0.29 m behind the back wall and the other 0.33 m
    // past the lateral face — and every predecessor of this Perch sat on one
    // of them.
    expect(catalog.some((perch) => perch.id === "training:barbell-bar")).toBe(
      true,
    );
    expect(
      catalog.some((perch) => perch.id === "training:barbell-front-plate"),
    ).toBe(false);
    expect(
      catalog.filter(
        (perch) =>
          perch.id.startsWith("systems:") && perch.id.endsWith("-frame"),
      ),
    ).toHaveLength(5);
    expect(
      catalog.some((perch) =>
        "ownerId" in perch ? perch.ownerId?.startsWith("shelf:") : false,
      ),
    ).toBe(false);
    expect(
      catalog
        .filter((perch) => perch.id.startsWith("projects:"))
        .map((perch) => ("ownerId" in perch ? perch.ownerId : null)),
    ).toEqual(
      expect.arrayContaining([
        "link:projects:weightlifting-icon",
        "link:projects:dice:top",
        "grab:projects:homework-icon",
        "grab:photo:projects-wwdc-v8",
      ]),
    );
    expect(
      catalog
        .flatMap((perch) => ("ownerId" in perch ? [perch.ownerId] : []))
        .includes("grab:notebook:projects"),
    ).toBe(false);
    expect(
      catalog
        .flatMap((perch) => ("ownerId" in perch ? [perch.ownerId] : []))
        .some((ownerId) => ownerId?.startsWith("grab:frame:")),
    ).toBe(false);
  });

  it("resolves actual mesh contact once and follows the owner transform", () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.y = 1;
    root.add(mesh);
    const unregister = registerSceneInteraction({
      id: "test:perch-owner",
      root,
      activeUnits: [0],
    });
    const perch: InsectPerch = {
      id: "test:perch",
      unitIndex: 0,
      kind: "perch",
      ownerId: "test:perch-owner",
      ownerPrefix: null,
      lampId: null,
      clearance: 0.12,
      tangent: null,
      contactDistanceTolerance: null,
      normalTolerance: 0.3,
      anchor: new THREE.Object3D(),
      normal: [0, 1, 0],
      resolvedRoot: null,
      resolvedSurface: null,
      resolvedOwnerId: null,
      localPosition: new THREE.Vector3(),
      localNormal: new THREE.Vector3(),
    };
    // This point is deliberately off the owner's 5×5 fractional lattice. The
    // authored point must be probed first rather than quantized to the grid.
    perch.anchor.position.set(0.17, 1.5, 0.23);
    const resolved = resolveInsectPerch(perch);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error(resolved.rejectionCode);
    expect(resolved.position.x).toBeCloseTo(0.17, 5);
    expect(resolved.position.z).toBeCloseTo(0.23, 5);
    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    readInsectPerchWorld(perch, position, normal, quaternion);
    expect(position.y).toBeCloseTo(1.5, 5);
    expect(position.z).toBeCloseTo(0.23, 5);
    const initialX = position.x;
    root.position.x = 2;
    readInsectPerchWorld(perch, position, normal, quaternion);
    expect(position.x).toBeCloseTo(initialX + 2, 5);
    expect(normal.y).toBeCloseTo(1, 5);
    mesh.position.x = 0.25;
    readInsectPerchWorld(perch, position, normal, quaternion);
    expect(position.x).toBeCloseTo(initialX + 2.25, 5);
    mesh.scale.set(2, 0.5, 1);
    mesh.rotation.z = 0.2;
    readInsectPerchWorld(perch, position, normal, quaternion);
    expect(normal.x).toBeCloseTo(-Math.sin(0.2), 5);
    expect(normal.y).toBeCloseTo(Math.cos(0.2), 5);
    perch.contactDistanceTolerance = 0.5;
    perch.anchor.position.x = 4;
    expect(resolveInsectPerch(perch)).toMatchObject({
      ok: false,
      rejectionCode: "contact-too-distant",
    });
    expect(perch.resolvedRoot).toBeNull();
    unregister();
    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it("treats a distant authored hint as advisory for an exact owner with a valid triangle", () => {
    const scene = new THREE.Scene();
    const owner = new THREE.Group();
    scene.add(owner);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.1, 0.02),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.y = 1;
    owner.add(mesh);
    const unregister = registerSceneInteraction({
      id: "test:exact-owner-stale-hint",
      root: owner,
      activeUnits: [0],
    });
    const perch: InsectPerch = {
      id: "test:exact-owner-stale-hint-perch",
      unitIndex: 0,
      kind: "perch",
      ownerId: "test:exact-owner-stale-hint",
      ownerPrefix: null,
      lampId: null,
      clearance: 0.12,
      tangent: [1, 0, 0],
      contactDistanceTolerance: null,
      normalTolerance: 0.9,
      anchor: new THREE.Object3D(),
      normal: [0, 1, 0],
      resolvedRoot: null,
      resolvedSurface: null,
      resolvedOwnerId: null,
      localPosition: new THREE.Vector3(),
      localNormal: new THREE.Vector3(),
    };
    perch.anchor.position.set(1.5, 1.05, 0);

    try {
      const result = resolveInsectPerch(perch);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.rejectionCode);
      expect(result.ownerId).toBe("test:exact-owner-stale-hint");
      expect(result.surface).toBe(mesh);
      expect(result.normal.y).toBeCloseTo(1, 6);
      expect(result.position.y).toBeCloseTo(1.05, 6);

      perch.contactDistanceTolerance = 0.4;
      expect(resolveInsectPerch(perch)).toMatchObject({
        ok: false,
        rejectionCode: "contact-too-distant",
      });
      perch.contactDistanceTolerance = null;
      perch.ownerId = null;
      perch.ownerPrefix = "test:exact-owner-stale-hint";
      expect(resolveInsectPerch(perch)).toMatchObject({
        ok: false,
        rejectionCode: "contact-too-distant",
      });
      perch.ownerId = "test:exact-owner-stale-hint";
      perch.ownerPrefix = null;
      perch.normal = [0, -1, 0];
      expect(resolveInsectPerch(perch)).toMatchObject({
        ok: false,
        rejectionCode: "contact-normal-mismatch",
      });
    } finally {
      unregister();
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  });

  it("keeps an acceptable authored contact instead of replacing it with a nearby fallback hit", () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.05),
      new THREE.MeshBasicMaterial(),
    );
    crown.position.set(0.1, 1.475, 0);
    root.add(crown);
    const fallback = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.04, 0.3),
      new THREE.MeshBasicMaterial(),
    );
    fallback.position.set(-0.07, 1.54, 0);
    root.add(fallback);
    const unregister = registerSceneInteraction({
      id: "test:authored-contact-owner",
      root,
      activeUnits: [0],
    });
    const perch: InsectPerch = {
      id: "test:authored-contact",
      unitIndex: 0,
      kind: "perch",
      ownerId: "test:authored-contact-owner",
      ownerPrefix: null,
      lampId: null,
      clearance: 0.12,
      tangent: null,
      contactDistanceTolerance: 0.18,
      normalTolerance: 0.3,
      anchor: new THREE.Object3D(),
      normal: [0, 1, 0],
      resolvedRoot: null,
      resolvedSurface: null,
      resolvedOwnerId: null,
      localPosition: new THREE.Vector3(),
      localNormal: new THREE.Vector3(),
    };
    perch.anchor.position.set(0.1, 1.65, 0);
    const resolved = resolveInsectPerch(perch);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error(resolved.rejectionCode);
    expect(resolved.surface).toBe(crown);
    expect(resolved.position.x).toBeCloseTo(0.1, 5);
    unregister();
    crown.geometry.dispose();
    crown.material.dispose();
    fallback.geometry.dispose();
    fallback.material.dispose();
  });

  it("ignores decorative sprites while resolving a mesh contact", () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.y = 1;
    root.add(mesh);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    sprite.position.y = 1.6;
    sprite.scale.set(20, 20, 1);
    root.add(sprite);
    const unregister = registerSceneInteraction({
      id: "test:sprite-perch-owner",
      root,
      activeUnits: [0],
    });
    const perch: InsectPerch = {
      id: "test:sprite-perch",
      unitIndex: 0,
      kind: "perch",
      ownerId: "test:sprite-perch-owner",
      ownerPrefix: null,
      lampId: null,
      clearance: 0.12,
      tangent: null,
      contactDistanceTolerance: null,
      normalTolerance: 0.3,
      anchor: new THREE.Object3D(),
      normal: [0, 1, 0],
      resolvedRoot: null,
      resolvedSurface: null,
      resolvedOwnerId: null,
      localPosition: new THREE.Vector3(),
      localNormal: new THREE.Vector3(),
    };
    perch.anchor.position.y = 1.5;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      expect(resolveInsectPerch(perch).ok).toBe(true);
      expect(consoleError).not.toHaveBeenCalledWith(
        expect.stringContaining(
          'Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.',
        ),
      );
    } finally {
      consoleError.mockRestore();
      unregister();
      mesh.geometry.dispose();
      mesh.material.dispose();
      sprite.material.dispose();
    }
  });
});

describe("every shelf carries the same number of Perches", () => {
  it("holds seven on each of the seven Units", () => {
    // Occupancy is meant to rise from insects STAYING rather than from more
    // traffic, but a Unit cannot hold four settled residents against four
    // Perches without every arrival competing for the last one. Books had four
    // against a shelf of two dozen props; Projects and Training had four each.
    const catalog = insectPerchCatalog();
    expect(catalog).toHaveLength(7);
    for (const [unitIndex, unit] of catalog.entries())
      expect(unit, `Unit ${unitIndex}`).toHaveLength(7);
  });

  it("names a distinct prop for every Perch on a shelf", () => {
    // Two Perches on one prop is one prop with two insects on it, not two
    // sites — and it reads as a queue.
    for (const [unitIndex, unit] of insectPerchCatalog().entries()) {
      const owners = unit.map((perch) =>
        "ownerId" in perch ? perch.ownerId : null,
      );
      expect(new Set(owners).size, `Unit ${unitIndex}`).toBe(owners.length);
    }
  });
});
