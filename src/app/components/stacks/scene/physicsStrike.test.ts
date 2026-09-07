import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { PhysicsSceneScope } from "./PhysicsSceneProvider";
import { type ShelfHandle, prepareScenePhysics, warm } from "./physics";
import { SHELF_GEOMETRY } from "./shelfGeometry";

/** The golf bay striking a loose prop resting on the bay floor. The launch
 * velocity is the one the bay computed; the first third of a second of flight
 * has to follow it, or a can "hit towards the cup" reads as a hop into the
 * ground. Horizontal speed is what a wrong spin or a lingering ground contact
 * would eat, so that is what is pinned. */
async function strike(
  shape: "sphere" | "box",
  geometry: THREE.BufferGeometry,
  massKg: number,
  launch: THREE.Vector3,
) {
  await warm();
  const unit = new THREE.Group();
  const prop = new THREE.Group();
  const mesh = new THREE.Mesh(geometry);
  geometry.computeBoundingBox();
  // Bottom-at-origin, like every GLB and the can shells.
  mesh.position.y = -geometry.boundingBox!.min.y;
  prop.add(mesh);
  prop.position.set(-2.3, SHELF_GEOMETRY.groundY, 0.4);
  unit.add(prop);
  unit.updateWorldMatrix(true, true);
  const entry: ShelfHandle = {
    key: `grab:test:${shape}`,
    unitIndex: 2,
    group: prop,
    base: prop.position.clone(),
    spin: 0.9,
    shape,
    massKg,
    plane: "floor",
    phase: { current: "rest" },
    physicsEnabled: true,
  };
  const scope = new PhysicsSceneScope();
  scope.registerRoot({
    id: "test:bay",
    kind: "unit",
    unitIndex: 2,
    root: unit,
  });
  scope.registerHandle(entry);
  const prepared = prepareScenePhysics(scope, entry);
  expect(prepared.status).toBe("ready");
  if (prepared.status !== "ready") throw new Error("no world");
  // Let it settle onto the floor first, as a dropped prop would have.
  for (let frame = 0; frame < 120; frame += 1)
    prepared.world.tick(1 / 120, frame + 1);
  const start = prop.position.clone();
  expect(prepared.world.strike(entry, launch)).toBe(true);
  const body = entry.body!;
  const v0 = new THREE.Vector3(
    body.velocity.x,
    body.velocity.y,
    body.velocity.z,
  );
  const samples: THREE.Vector3[] = [];
  for (let frame = 0; frame < 36; frame += 1) {
    prepared.world.tick(1 / 120, 1000 + frame);
    if ((frame + 1) % 12 === 0) samples.push(prop.position.clone().sub(start));
  }
  return { v0, samples };
}

describe("golf bay strike on a loose prop", () => {
  it("sends a tennis-sized sphere off at the launch velocity", async () => {
    const launch = new THREE.Vector3(0.4, 6, -5.9);
    const { v0, samples } = await strike(
      "sphere",
      new THREE.SphereGeometry(0.067, 16, 12),
      0.058,
      launch,
    );
    expect(v0.distanceTo(launch)).toBeLessThan(0.05);
    // 0.3 s in: horizontal ≈ v·t (damping 0.05/s is negligible), vertical
    // ≈ v·t − g t²/2 = 1.8 − 0.44.
    const at = samples[2]!;
    expect(
      at.z,
      `z after 0.3 s: ${at
        .toArray()
        .map((n) => n.toFixed(3))
        .join(",")}`,
    ).toBeLessThan(-5.9 * 0.3 * 0.8);
    expect(at.y).toBeGreaterThan(1.0);
  });

  it("sends a can-sized box off at the launch velocity too", async () => {
    const launch = new THREE.Vector3(0.2, 3.6, -3.56);
    const { v0, samples } = await strike(
      "box",
      new THREE.BoxGeometry(0.14, 0.23, 0.14),
      0.36,
      launch,
    );
    expect(v0.distanceTo(launch)).toBeLessThan(0.05);
    const at = samples[2]!;
    // A box carries linearDamping 0.5/s: e^-0.15 ≈ 0.86 of the way.
    expect(
      at.z,
      `z after 0.3 s: ${at
        .toArray()
        .map((n) => n.toFixed(3))
        .join(",")}`,
    ).toBeLessThan(-3.56 * 0.3 * 0.7);
    expect(at.y).toBeGreaterThan(0.55);
  });
});
