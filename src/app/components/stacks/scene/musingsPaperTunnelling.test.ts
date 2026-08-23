import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { PhysicsSceneScope } from "./PhysicsSceneProvider";
import { MUSINGS_PAPER_STACK } from "./musingsShelfGeometry";
import { type ShelfHandle, prepareScenePhysics, warm } from "./physics";
import { SHELF_SURFACE } from "./shelfGeometry";

/** Carry the paper to a pose, throw it straight down, and report where it came
 * to rest in shelf-local units. Zero is the plank surface; the room floor is
 * about -0.27. */
function releaseOntoLowerShelf({
  holdY,
  tiltDegrees,
  speed,
  frameDelta,
}: {
  holdY: number;
  tiltDegrees: number;
  speed: number;
  frameDelta: number;
}) {
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

  const prepared = prepareScenePhysics(scope, entry);
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  prepared.world.grab(entry);

  // The held-collision probe caps how far one call may travel, so a carry is
  // many calls. Sixty is enough to reach every pose in the matrix below.
  const target = {
    position: new THREE.Vector3(0, holdY, 0),
    quaternion: new THREE.Quaternion().setFromEuler(
      new THREE.Euler((tiltDegrees * Math.PI) / 180, 0, 0),
    ),
  };
  for (let call = 0; call < 60; call += 1)
    prepared.world.moveHeld(entry, target, 1 / 60);

  prepared.world.release(entry, new THREE.Vector3(0, -speed, 0));
  for (let frame = 0; frame < 400; frame += 1)
    prepared.world.tick(frameDelta, frame + 1);

  return { restY: entry.group.position.y, sleepState: entry.body?.sleepState };
}

/** Every row fell through the lower plank onto the room floor under the old
 * 1/120 × 2 step policy, measured before the fix. They span the reachable range:
 * resting height to the full 0.81 of headroom, flat to steeply tilted, and 2.5
 * u/s up to the 4 u/s release ceiling. Sixteen simulations, about 120 ms. */
const PREVIOUSLY_FELL_THROUGH = [
  { holdY: 0.02, tiltDegrees: 4.2, speed: 4 },
  { holdY: 0.02, tiltDegrees: 120, speed: 4 },
  { holdY: 0.2, tiltDegrees: 4.2, speed: 3.4 },
  { holdY: 0.5, tiltDegrees: 0, speed: 3.5 },
  { holdY: 0.7, tiltDegrees: 4.2, speed: 3.2 },
  { holdY: 0.8, tiltDegrees: 0, speed: 3 },
  { holdY: 0.8, tiltDegrees: 20, speed: 2.5 },
  { holdY: 0.8, tiltDegrees: 45, speed: 3.8 },
] as const;

/** Both cadences the scene actually runs at. The thin-body policy has to hold
 * at each, not just at whichever one a single test happened to pick. */
const FRAME_DELTAS = [
  { label: "60 Hz", frameDelta: 1 / 60 },
  { label: "120 Hz", frameDelta: 1 / 120 },
] as const;

const MATRIX = FRAME_DELTAS.flatMap((cadence) =>
  PREVIOUSLY_FELL_THROUGH.map((release) => ({ ...cadence, ...release })),
);

describe("Musings paper never tunnels through the lower shelf", () => {
  it.each(MATRIX)(
    "hold $holdY, tilt $tiltDegrees°, throw $speed u/s at $label",
    async ({ holdY, tiltDegrees, speed, frameDelta }) => {
      await warm();
      const { restY, sleepState } = releaseOntoLowerShelf({
        holdY,
        tiltDegrees,
        speed,
        frameDelta,
      });

      // The floor sits at about -0.27 in these coordinates. Anything below the
      // plank at all means the narrowphase missed the contact.
      expect(restY).toBeGreaterThan(-0.01);
      expect(restY).toBeLessThan(0.05);
      expect(sleepState).toBe(2);
    },
  );
});
