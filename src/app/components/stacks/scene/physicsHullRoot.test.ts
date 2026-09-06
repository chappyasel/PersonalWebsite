import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { PhysicsSceneScope } from "./PhysicsSceneProvider";
import { type ShelfHandle, prepareScenePhysics, warm } from "./physics";

/** A Grabbable's shape: root (the handle's group) → nod → the model. The nod
 * is identity at rest and lifted and tilted while the pointer rests on the
 * prop, which is exactly when the first grab, and so the body's adoption,
 * happens. */
function fixture() {
  const root = new THREE.Group();
  const shelf = new THREE.Group();
  shelf.position.y = 0.035;
  root.add(shelf);
  const prop = new THREE.Group();
  shelf.add(prop);
  const nod = new THREE.Group();
  prop.add(nod);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.05, 0.42));
  mesh.position.y = 0.025;
  nod.add(mesh);
  root.updateWorldMatrix(true, true);
  return { root, shelf, prop, nod };
}

async function dropAfterHoveredAdoption(useHullRoot: boolean) {
  await warm();
  const { root, shelf, prop, nod } = fixture();
  // Hovered: the nod has lifted the prop 3 cm and tipped it toward the viewer.
  nod.position.y = 0.03;
  nod.rotation.x = -0.2;
  root.updateWorldMatrix(true, true);
  const entry: ShelfHandle = {
    key: `hull-root:${useHullRoot}`,
    unitIndex: 0,
    group: prop,
    hullRoot: useHullRoot ? nod : undefined,
    base: prop.position.clone(),
    spin: 0.9,
    shape: "box",
    massKg: 0.19,
    plane: "top",
    phase: { current: "rest" },
    physicsEnabled: true,
  };
  const scope = new PhysicsSceneScope();
  scope.registerRoot({
    id: `hull-root:${useHullRoot}`,
    kind: "unit",
    unitIndex: 0,
    root,
  });
  scope.registerHandle(entry);
  const prepared = prepareScenePhysics(scope, entry);
  expect(prepared.status).toBe("ready");
  if (prepared.status !== "ready") throw new Error("world not ready");
  const world = prepared.world;
  expect(world.grab(entry)).toBe(true);
  // Carrying: the nod relaxes (the Grabbable eases it home once hover ends).
  nod.position.set(0, 0, 0);
  nod.rotation.set(0, 0, 0);
  world.moveHeld(
    entry,
    {
      position: new THREE.Vector3(0, 0.3, 0),
      quaternion: new THREE.Quaternion(),
    },
    1 / 60,
  );
  world.release(entry, new THREE.Vector3());
  for (let i = 1; i <= 300; i++) world.tick(1 / 60, i);
  root.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(prop).min.y - shelf.position.y;
}

describe("hull measured under the nod", () => {
  it("lands the visual on the plank after a body adopted mid-hover", async () => {
    const bottom = await dropAfterHoveredAdoption(true);
    // Cannon's contact penetration and the horizontal inset are a couple of
    // millimetres; a hull built around the hovered pose was off by the lift.
    expect(Math.abs(bottom)).toBeLessThan(0.006);
  });

  it("documents the sink a root-measured hull produced", async () => {
    const bottom = await dropAfterHoveredAdoption(false);
    expect(bottom).toBeLessThan(-0.02);
  });
});
