import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  ThreeInsectFlightWorld,
  diagnoseInsectPerch,
  insectCollisionIndexRevision,
  registerInsectCollisionRoot,
} from "./insectFlightWorld";
import { type InsectPerch, registerInsectPerch } from "./insectPerches";
import type { InsectKinematicSample } from "./insectPilot";
import { registerSceneInteraction } from "./interactionRegistry";
import { MEADOW_GROUND_BASE } from "./meadowField";

function sampleCruise(
  _flightId: number,
  time: number,
  out: InsectKinematicSample,
) {
  out.position.x = time;
  out.position.y = 0;
  out.position.z = 0;
  out.velocity.x = 1;
  out.velocity.y = 0;
  out.velocity.z = 0;
  out.acceleration.x = 0;
  out.acceleration.y = 0;
  out.acceleration.z = 0;
}

describe("Three insect flight world", () => {
  it.each([
    ["AI Collective edge", 0.019],
    ["portrait frame edge", 0.016],
  ])(
    "accepts a real resolved triangle contact on the original thin %s",
    (_name, thickness) => {
      const unitIndex = thickness === 0.019 ? 91 : 92;
      const scene = new THREE.Scene();
      const root = new THREE.Group();
      const owner = new THREE.Group();
      scene.add(root);
      root.add(owner);
      const support = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.1, thickness),
        new THREE.MeshBasicMaterial(),
      );
      support.position.y = 0.5;
      owner.add(support);
      const anchor = new THREE.Object3D();
      anchor.position.set(0, 0.55, 0);
      root.add(anchor);
      const ownerId = `test:thin-edge:${unitIndex}`;
      const perch: InsectPerch = {
        id: `test:thin-edge-perch:${unitIndex}`,
        unitIndex,
        kind: "perch",
        ownerId,
        ownerPrefix: null,
        lampId: null,
        clearance: 0.12,
        tangent: [1, 0, 0],
        contactDistanceTolerance: 0.05,
        normalTolerance: 0.9,
        anchor,
        normal: [0, 1, 0],
        resolvedRoot: null,
        resolvedSurface: null,
        resolvedOwnerId: null,
        localPosition: new THREE.Vector3(),
        localNormal: new THREE.Vector3(),
      };
      const unregisterRoot = registerInsectCollisionRoot(unitIndex, root);
      const unregisterOwner = registerSceneInteraction({
        id: ownerId,
        root: owner,
        activeUnits: [unitIndex],
      });
      const unregisterPerch = registerInsectPerch(perch);
      const world = new ThreeInsectFlightWorld(
        `butterfly:thin-edge:${unitIndex}`,
        "butterfly",
        sampleCruise,
      );
      world.setContext(unitIndex, 0);

      try {
        const diagnostic = diagnoseInsectPerch(perch.id, "butterfly", 0);
        expect(diagnostic.resolvedContact).not.toBeNull();
        expect(diagnostic.rejectionCode).toBe("none");
        expect(
          world.tryReserve(
            perch.id,
            world.occupantId,
            diagnostic.collisionRevision,
          ),
        ).toEqual({ ok: true });
      } finally {
        world.dispose();
        unregisterPerch();
        unregisterOwner();
        unregisterRoot();
        support.geometry.dispose();
        support.material.dispose();
      }
    },
  );

  it("builds continuous collision from visible unit meshes and refreshes revisions", () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);
    const barrier = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.5, 0.5),
      new THREE.MeshBasicMaterial(),
    );
    root.add(barrier);
    const unregister = registerInsectCollisionRoot(2, root);
    const world = new ThreeInsectFlightWorld(
      "butterfly:test",
      "butterfly",
      sampleCruise,
    );
    world.setContext(2, 0);
    expect(
      world.sweepSphere({ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0.01),
    ).toBe(false);
    const firstRevision = insectCollisionIndexRevision(2, 0);

    barrier.visible = false;
    world.setContext(2, 0.3);
    expect(
      world.sweepSphere({ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0.01),
    ).toBe(true);
    expect(insectCollisionIndexRevision(2, 0.3)).toBeGreaterThan(
      firstRevision ?? 0,
    );

    world.dispose();
    unregister();
    barrier.geometry.dispose();
    barrier.material.dispose();
  });

  it("ignores invisible interaction planes and fails closed without a root", () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
    );
    root.add(plane);
    const unregister = registerInsectCollisionRoot(4, root);
    const world = new ThreeInsectFlightWorld("moth:test", "moth", sampleCruise);
    world.setContext(4, 0);
    expect(
      world.sweepSphere({ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0.05),
    ).toBe(true);

    unregister();
    expect(
      world.sweepSphere({ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0.05),
    ).toBe(false);
    plane.geometry.dispose();
    plane.material.dispose();
  });

  it("allows only outward recovery when geometry moves over a pilot", () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);
    const obstacle = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.2),
      new THREE.MeshBasicMaterial(),
    );
    root.add(obstacle);
    const unregister = registerInsectCollisionRoot(5, root);
    const world = new ThreeInsectFlightWorld(
      "butterfly:escape",
      "butterfly",
      sampleCruise,
    );
    world.setContext(5, 0);
    const trapped = { x: 0, y: 0, z: 0 };
    const outward = { x: 0.04, y: 0, z: 0 };
    expect(world.sweepSphere(trapped, outward, 0.02)).toBe(false);
    expect(world.sweepSphere(trapped, outward, 0.02, false, true)).toBe(true);
    expect(world.sweepSphere(outward, trapped, 0.02, false, true)).toBe(false);
    world.dispose();
    unregister();
    obstacle.geometry.dispose();
    obstacle.material.dispose();
  });

  it("treats the meadow as a hard floor for integrated flight", () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);
    const unregister = registerInsectCollisionRoot(6, root);
    const world = new ThreeInsectFlightWorld(
      "butterfly:ground-floor",
      "butterfly",
      sampleCruise,
    );
    world.setContext(6, 0);
    const radius = 0.08;

    expect(
      world.sweepSphere(
        { x: 0, y: MEADOW_GROUND_BASE + radius + 0.02, z: 0 },
        { x: 0.1, y: MEADOW_GROUND_BASE + radius + 0.02, z: 0 },
        radius,
      ),
    ).toBe(true);
    expect(
      world.sweepSphere(
        { x: 0, y: MEADOW_GROUND_BASE + radius + 0.02, z: 0 },
        { x: 0.1, y: MEADOW_GROUND_BASE + radius - 0.01, z: 0 },
        radius,
        false,
        true,
      ),
    ).toBe(false);
    expect(
      world.sweepFolded(
        { x: 0, y: MEADOW_GROUND_BASE + radius - 0.01, z: 0 },
        { x: 0.1, y: MEADOW_GROUND_BASE + radius - 0.01, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 0, z: 0 },
      ),
    ).toBe(false);

    world.dispose();
    unregister();
  });
});
