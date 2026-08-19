import {
  createInsectFlightVolume,
  createInsectFlightVolumeContainment,
  insectFlightVolumeContains,
  insectFlightVolumePoint,
} from "../insectFlightVolume";
import {
  ThreeInsectFlightWorld,
  insectCollisionIndexRevision,
  prepareInsectLandingTarget,
  registerInsectCollisionRoot,
} from "../insectFlightWorld";
import {
  type InsectPerch,
  insectPerchCatalog,
  registerInsectPerch,
} from "../insectPerches";
import {
  BUTTERFLY_PILOT_PROFILE,
  type InsectKinematicSample,
  type InsectLandingTarget,
  commandInsectPilot,
  createInsectPilot,
} from "../insectPilot";
import { BUTTERFLY_STEERING_PROFILE } from "../insectSteering";
import { registerSceneInteraction } from "../interactionRegistry";
import { SHELF_GEOMETRY } from "../shelfGeometry";
import { unitPose } from "../worldLayout";
import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";

const disposables: Array<{ dispose(): void }> = [];

afterEach(() => {
  for (const disposable of disposables.splice(0)) disposable.dispose();
});

function material() {
  const value = new THREE.MeshBasicMaterial();
  disposables.push(value);
  return value;
}

function box(
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  name = "fixture-box",
) {
  const geometry = new THREE.BoxGeometry(...size);
  disposables.push(geometry);
  const mesh = new THREE.Mesh(geometry, material());
  mesh.position.set(...position);
  mesh.name = name;
  return mesh;
}

function addShelfStructure(unit: THREE.Group) {
  for (const [shelfId, shelf] of [
    ["top", SHELF_GEOMETRY.top],
    ["lower", SHELF_GEOMETRY.lower],
  ] as const) {
    unit.add(
      box(
        [SHELF_GEOMETRY.width, shelf.thickness, shelf.depth],
        [0, shelf.centerY, shelf.centerZ],
        `shelf-${shelfId}-plank`,
      ),
    );
    for (const side of [-1, 1])
      unit.add(
        box(
          [0.013, shelf.thickness + 0.002, shelf.depth + 0.01],
          [
            side * (SHELF_GEOMETRY.width / 2 - 0.006),
            shelf.centerY,
            shelf.centerZ,
          ],
          `shelf-${shelfId}-edge-${side}`,
        ),
      );
  }
  for (const side of [-1, 1]) {
    const x = side * (SHELF_GEOMETRY.width / 2 - SHELF_GEOMETRY.strapInsetX);
    unit.add(
      box(
        [
          SHELF_GEOMETRY.support.width,
          -SHELF_GEOMETRY.groundY,
          SHELF_GEOMETRY.support.width,
        ],
        [x, SHELF_GEOMETRY.groundY / 2, SHELF_GEOMETRY.strapZ],
        `shelf-strap-${side}`,
      ),
      box(
        [
          SHELF_GEOMETRY.support.footWidth,
          SHELF_GEOMETRY.support.footHeight,
          SHELF_GEOMETRY.support.footDepth,
        ],
        [x, SHELF_GEOMETRY.groundY + 0.025, SHELF_GEOMETRY.strapZ],
        `shelf-foot-${side}`,
      ),
      box(
        [
          SHELF_GEOMETRY.support.cleatWidth,
          SHELF_GEOMETRY.support.cleatHeight,
          SHELF_GEOMETRY.support.cleatDepth,
        ],
        [x, SHELF_GEOMETRY.lower.centerY - 0.0575, SHELF_GEOMETRY.strapZ],
        `shelf-cleat-${side}`,
      ),
    );
  }
  // Exact visible fixture housings from ShelfUnit. Their glow Sprites and
  // lights are intentionally absent because neither contributes collision.
  unit.add(
    box(
      [SHELF_GEOMETRY.width * 0.84, 0.013, 0.05],
      [0, -0.035 - 0.013 / 2, -0.2],
      "shelf-top-under-light",
    ),
    box(
      [SHELF_GEOMETRY.width * 0.84, 0.013, 0.05],
      [0, -0.8975 - 0.013 / 2, -0.2],
      "shelf-lower-under-light",
    ),
    box(
      [SHELF_GEOMETRY.width * 0.9, 0.042, 0.036],
      [0, 0.035 + 0.042 / 2, -0.402],
      "shelf-top-back-light",
    ),
  );
}

function basisQuaternion(
  normal: readonly [number, number, number],
  tangent: readonly [number, number, number],
) {
  const y = new THREE.Vector3(...normal).normalize();
  const x = new THREE.Vector3(...tangent)
    .addScaledVector(y, -new THREE.Vector3(...tangent).dot(y))
    .normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x, y, z),
  );
}

function addFeaturedBookOwner(
  unit: THREE.Group,
  definition: ReturnType<typeof insectPerchCatalog>[number][number],
) {
  const owner = new THREE.Group();
  const normal = definition.normal ?? [0, 1, 0];
  const tangent = definition.tangent ?? [1, 0, 0];
  const height = 0.48;
  const thickness = 0.05;
  const rotation = basisQuaternion(normal, tangent);
  const contact = new THREE.Vector3(...definition.position);
  const center = contact.addScaledVector(
    new THREE.Vector3(...normal).normalize(),
    -height / 2,
  );
  const shell = box([0.34, height, thickness], center.toArray());
  shell.name = `owner-${definition.id}`;
  shell.quaternion.copy(rotation);
  owner.add(shell);
  unit.add(owner);
  const ownerId = definition.ownerId;
  if (!ownerId) throw new Error(`${definition.id} has no exact owner`);
  return registerSceneInteraction({
    id: ownerId,
    root: owner,
    activeUnits: [1],
  });
}

function sample(): InsectKinematicSample {
  return {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    acceleration: { x: 0, y: 0, z: 0 },
  };
}

function target(): InsectLandingTarget {
  return {
    id: "",
    point: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    tangent: { x: 1, y: 0, z: 0 },
    clearance: 0,
  };
}

async function mountBooksFixture() {
  const scene = new THREE.Scene();
  const unit = new THREE.Group();
  const pose = unitPose(1);
  unit.position.set(...pose.position);
  unit.rotation.set(...pose.rotation);
  scene.add(unit);
  addShelfStructure(unit);

  const releases: Array<() => void> = [];
  const definitions = insectPerchCatalog()[1]!;
  for (const definition of definitions)
    releases.push(addFeaturedBookOwner(unit, definition));
  releases.push(registerInsectCollisionRoot(1, unit));
  for (const definition of definitions) {
    const anchor = new THREE.Object3D();
    anchor.position.set(...definition.position);
    unit.add(anchor);
    const perch: InsectPerch = {
      id: definition.id,
      unitIndex: 1,
      kind: "perch",
      ownerId: definition.ownerId ?? null,
      ownerPrefix: definition.ownerPrefix ?? null,
      lampId: null,
      clearance: definition.clearance ?? 0.12,
      tangent: definition.tangent ?? null,
      contactDistanceTolerance: definition.contactDistanceTolerance ?? null,
      normalTolerance: definition.normalTolerance ?? 0.3,
      anchor,
      normal: definition.normal ?? [0, 1, 0],
      resolvedRoot: null,
      resolvedSurface: null,
      resolvedOwnerId: null,
      localPosition: new THREE.Vector3(),
      localNormal: new THREE.Vector3(0, 1, 0),
    };
    releases.push(registerInsectPerch(perch));
  }
  unit.updateWorldMatrix(true, true);

  const now = 18;
  // A steering resident has no analytic flight to be on, so the only thing a
  // landing needs from roaming is an ordinary point of open air inside the
  // Unit's own Flight Volume — no compiled route, no nearest node, no offset.
  const volume = createInsectFlightVolume(unitPose(1));
  const initial = sample();
  // ABOVE the top plank, which is where a resident of the full Flight Volume
  // spends most of its life, and on the far side of an unbroken 2.7 m board
  // from every Books Perch.
  //
  // This start used to sit at y −0.35, under the plank, with a comment saying
  // an insect cruising above it "simply is not somewhere a lower-shelf landing
  // can be flown from — a real property of the scene, not a planner
  // limitation." That was wrong, and it was written to make this test pass.
  // It is exactly a planner limitation: the approach connector was one Hermite
  // curve, one Hermite cannot go around a plank, and moving the start below
  // the plank hid the fact that three of the four About Perches had become
  // unreachable on the page. The connector now stages through the open air in
  // front of the Unit, so this is the case worth testing.
  insectFlightVolumePoint(
    volume,
    { x: -0.3, y: 0.42, z: 0.9 },
    initial.position,
  );
  initial.velocity.x = BUTTERFLY_STEERING_PROFILE.cruiseSpeed * 0.6;
  if (!insectFlightVolumeContains(volume, initial.position))
    throw new Error("Books start is outside the Flight Volume");
  const world = new ThreeInsectFlightWorld(
    "butterfly:books-force",
    "butterfly",
  );
  world.setContext(1, now);
  if (insectCollisionIndexRevision(1, now, true) == null)
    throw new Error("Books collision unavailable");
  return { initial, now, releases, volume, world };
}

describe("Unit Books forced Landing Plan", () => {
  it("reaches Life 3.0 from ordinary air in the Books Flight Volume", async () => {
    const { initial, now, releases, volume, world } = await mountBooksFixture();
    const perchId = "books:life-3-0-pages";
    const landingTarget = target();
    const pilot = createInsectPilot({
      occupantId: "butterfly:books-force",
      flightId: 3,
      seed: 3,
      initialTime: now,
      initial,
      profile: BUTTERFLY_PILOT_PROFILE,
      roam: {
        profile: BUTTERFLY_STEERING_PROFILE,
        containment: createInsectFlightVolumeContainment(volume),
        volume,
        transit: null,
      },
    });
    try {
      expect(
        prepareInsectLandingTarget(perchId, "butterfly", landingTarget),
      ).toBe(true);
      expect(
        commandInsectPilot(
          pilot,
          { type: "land", target: landingTarget },
          world,
        ),
        `Landing Plan rejected: ${pilot.rejectionCode}.`,
      ).toBe(true);
      // A steering resident compiles no rejoin, so a blocked connector back to
      // an analytic flight can no longer veto a landing on real geometry.
      expect(pilot.landingPlan?.rejoin).toEqual([]);
      expect(pilot.landingPlan!.arrivalAngle).toBeLessThan(0.61);
    } finally {
      world.release(perchId, "butterfly:books-force");
      world.dispose();
      for (const release of releases.reverse()) release();
    }
  });
});
