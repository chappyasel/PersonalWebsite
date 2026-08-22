import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { PhysicsSceneScope } from "./PhysicsSceneProvider";
import { MUSINGS_PAPER_STACK } from "./musingsShelfGeometry";
import {
  type ShelfHandle,
  prepareScenePhysics,
  resolveShelf,
  warm,
} from "./physics";
import { SHELF_SURFACE } from "./shelfGeometry";

describe("Musings paper physics", () => {
  // One moveHeld call is all a carry frame gets, and the held-collision probe
  // caps it at twelve conservative steps: the paper reaches roughly 0.02 above
  // the plank and four degrees of tilt, not the 0.3 and 120° asked for below.
  // So this drives the case that actually broke — a near-flat 13 mm slab shoved
  // straight down at the 4 u/s throw ceiling from resting height. Settling
  // face-up is a property of that near-flat pose; physics.ts owns no righting
  // rule, and a sheet released past 90° lands on its other face.
  it("keeps a full-speed release on the lower shelf instead of the floor", async () => {
    await warm();
    const unit = new THREE.Group();
    const lowerShelf = new THREE.Group();
    lowerShelf.position.y = SHELF_SURFACE.lower;
    unit.add(lowerShelf);

    const paper = new THREE.Group();
    const collider = new THREE.Mesh(
      new THREE.BoxGeometry(
        MUSINGS_PAPER_STACK.colliderWidth,
        MUSINGS_PAPER_STACK.colliderHeight,
        MUSINGS_PAPER_STACK.colliderDepth,
      ),
    );
    collider.position.y = MUSINGS_PAPER_STACK.colliderCenterY;
    paper.add(collider);
    lowerShelf.add(paper);
    unit.updateWorldMatrix(true, true);

    const entry: ShelfHandle = {
      key: "grab:paper:5",
      unitIndex: 5,
      group: paper,
      base: paper.position.clone(),
      spin: 0.9,
      shape: "box",
      massKg: 0.024,
      phase: { current: "rest" },
      physicsEnabled: true,
    };
    const scope = new PhysicsSceneScope();
    scope.registerRoot({
      id: "test:musings-paper",
      kind: "unit",
      unitIndex: 5,
      root: unit,
    });
    scope.registerHandle(entry);

    expect(resolveShelf(paper).plane).toBe("lower");
    const prepared = prepareScenePhysics(scope, entry);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;

    expect(prepared.world.grab(entry)).toBe(true);
    prepared.world.moveHeld(
      entry,
      {
        position: new THREE.Vector3(0, 0.3, 0),
        quaternion: new THREE.Quaternion().setFromEuler(
          new THREE.Euler((Math.PI * 2) / 3, 0, 0),
        ),
      },
      1 / 60,
    );
    expect(prepared.world.release(entry, new THREE.Vector3(0, -4, 0))).toBe(
      true,
    );
    for (let frame = 0; frame < 180; frame += 1)
      prepared.world.tick(1 / 120, frame + 1);

    expect(entry.group.position.y).toBeGreaterThan(-0.01);
    expect(entry.group.position.y).toBeLessThan(0.03);
    expect(entry.body?.sleepState).toBe(2);
    const printedSide = new THREE.Vector3(0, 1, 0).applyQuaternion(
      entry.group.quaternion,
    );
    expect(printedSide.y).toBeGreaterThan(0.9);
  });
});
