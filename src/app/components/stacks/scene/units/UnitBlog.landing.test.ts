import { splitDisconnectedMeshIslands } from "../ModelProp";
import {
  createInsectFlightVolume,
  createInsectFlightVolumeContainment,
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
  type InsectLandingTarget,
  advanceInsectPilot,
  commandInsectPilot,
  createInsectPilot,
} from "../insectPilot";
import { BUTTERFLY_STEERING_PROFILE } from "../insectSteering";
import { registerSceneInteraction } from "../interactionRegistry";
import { SHELF_GEOMETRY, SHELF_SURFACE } from "../shelfGeometry";
import { unitPose } from "../worldLayout";
import { MeshoptDecoder } from "meshoptimizer";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it } from "vitest";

import { MUSINGS_SAILBOAT_POSE } from "./UnitBlog";

const releases: Array<() => void> = [];
const disposables: Array<{ dispose(): void }> = [];

afterEach(() => {
  for (const release of releases.reverse()) release();
  releases.length = 0;
  for (const disposable of disposables.splice(0)) disposable.dispose();
});

function visibleBox(
  size: readonly [number, number, number],
  position: readonly [number, number, number],
) {
  const geometry = new THREE.BoxGeometry(...size);
  const material = new THREE.MeshBasicMaterial();
  disposables.push(geometry, material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  return mesh;
}

async function loadSailboat() {
  const bytes = fs.readFileSync(
    path.resolve(process.cwd(), "public/models/sailboat.glb"),
  );
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const model = (await loader.parseAsync(buffer, "")).scene;
  splitDisconnectedMeshIslands(model);
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const mesh = object as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.Material | THREE.Material[]
    >;
    disposables.push(mesh.geometry);
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    disposables.push(...materials);
  });
  return model;
}

async function mountSailboatPerch() {
  const unitIndex = 5;
  const scene = new THREE.Scene();
  const unit = new THREE.Group();
  const pose = unitPose(unitIndex);
  unit.position.set(...pose.position);
  unit.rotation.set(...pose.rotation);
  scene.add(unit);

  for (const shelf of [SHELF_GEOMETRY.top, SHELF_GEOMETRY.lower])
    unit.add(
      visibleBox(
        [SHELF_GEOMETRY.width, shelf.thickness, shelf.depth],
        [0, shelf.centerY, shelf.centerZ],
      ),
    );

  const owner = new THREE.Group();
  owner.position.set(
    MUSINGS_SAILBOAT_POSE.base[0],
    SHELF_SURFACE.lower + MUSINGS_SAILBOAT_POSE.base[1],
    MUSINGS_SAILBOAT_POSE.base[2],
  );
  const model = await loadSailboat();
  model.rotation.set(...MUSINGS_SAILBOAT_POSE.rotation);
  model.scale.setScalar(MUSINGS_SAILBOAT_POSE.scale);
  owner.add(model);
  unit.add(owner);

  const definition = insectPerchCatalog()[unitIndex]!.find(
    (candidate) => candidate.id === "musings:sailboat-masthead",
  );
  if (!definition?.ownerId) throw new Error("Sailboat Perch missing");
  const anchor = new THREE.Object3D();
  anchor.position.set(...definition.position);
  unit.add(anchor);
  const perch: InsectPerch = {
    id: definition.id,
    unitIndex,
    kind: "perch",
    ownerId: definition.ownerId,
    ownerPrefix: null,
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
  releases.push(
    registerSceneInteraction({
      id: definition.ownerId,
      root: owner,
      activeUnits: [unitIndex],
    }),
    registerInsectCollisionRoot(unitIndex, unit),
    registerInsectPerch(perch),
  );
  unit.updateWorldMatrix(true, true);

  const now = 18;
  const volume = createInsectFlightVolume(pose);
  const initial = {
    position: { x: 0, y: 0, z: 0 },
    velocity: {
      x: BUTTERFLY_STEERING_PROFILE.cruiseSpeed * 0.6,
      y: 0,
      z: 0,
    },
    acceleration: { x: 0, y: 0, z: 0 },
  };
  insectFlightVolumePoint(volume, { x: 0, y: 0.42, z: 0.9 }, initial.position);
  const world = new ThreeInsectFlightWorld(
    "butterfly:musings-sailboat",
    "butterfly",
  );
  world.setContext(unitIndex, now);
  if (insectCollisionIndexRevision(unitIndex, now, true) == null)
    throw new Error("Musings collision unavailable");
  return { initial, now, volume, world, perchId: definition.id };
}

describe("Unit Musings sailboat Landing Plan", () => {
  it("reaches the masthead despite the mast and hull sharing one collision mesh", async () => {
    const { initial, now, volume, world, perchId } = await mountSailboatPerch();
    try {
      for (const [index, variation] of [0, 0.25, 0.5, 0.75, 1].entries()) {
        const target: InsectLandingTarget = {
          id: "",
          point: { x: 0, y: 0, z: 0 },
          normal: { x: 0, y: 1, z: 0 },
          tangent: { x: 1, y: 0, z: 0 },
          clearance: 0,
        };
        const pilot = createInsectPilot({
          occupantId: "butterfly:musings-sailboat",
          flightId: index + 5,
          seed: index + 5,
          initialTime: now,
          initial,
          profile: BUTTERFLY_PILOT_PROFILE,
          roam: {
            profile: BUTTERFLY_STEERING_PROFILE,
            containment: createInsectFlightVolumeContainment(volume),
            volume,
            transit: null,
            evade: null,
          },
        });
        expect(
          prepareInsectLandingTarget(perchId, "butterfly", target, variation),
        ).toBe(true);
        expect(
          commandInsectPilot(pilot, { type: "land", target, variation }, world),
          `Landing Plan rejected at variation ${variation}: ${pilot.rejectionCode}.`,
        ).toBe(true);
        for (let frame = 0; frame < 60 * 60; frame++) {
          advanceInsectPilot(pilot, 1 / 60, world);
          if (pilot.phase === "rest") break;
        }
        expect(
          pilot.phase,
          `Landing aborted at variation ${variation}: ${pilot.rejectionCode}.`,
        ).toBe("rest");
        world.release(perchId, "butterfly:musings-sailboat");
      }
    } finally {
      world.release(perchId, "butterfly:musings-sailboat");
      world.dispose();
    }
  });
});
