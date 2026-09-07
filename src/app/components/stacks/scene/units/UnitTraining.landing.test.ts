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
import { unitPose } from "../worldLayout";
import { MeshoptDecoder } from "meshoptimizer";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it } from "vitest";

import { TRAINING_BARBELL_POSE } from "./UnitTraining";

const releases: Array<() => void> = [];
const disposables: Array<{ dispose(): void }> = [];

afterEach(() => {
  for (const release of releases.reverse()) release();
  releases.length = 0;
  for (const disposable of disposables.splice(0)) disposable.dispose();
});

async function loadBarbell() {
  const bytes = fs.readFileSync(
    path.resolve(process.cwd(), "public/models/barbell.glb"),
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

async function mountBarbellPerch() {
  const unitIndex = 2;
  const scene = new THREE.Scene();
  const unit = new THREE.Group();
  const pose = unitPose(unitIndex);
  unit.position.set(...pose.position);
  unit.rotation.set(...pose.rotation);
  scene.add(unit);

  const owner = new THREE.Group();
  owner.position.set(...TRAINING_BARBELL_POSE.base);
  const model = await loadBarbell();
  model.rotation.set(...TRAINING_BARBELL_POSE.rotation);
  model.scale.setScalar(TRAINING_BARBELL_POSE.scale);
  owner.add(model);
  unit.add(owner);

  const definition = insectPerchCatalog()[unitIndex]!.find(
    (candidate) => candidate.id === "training:barbell-bar",
  );
  if (!definition?.ownerId) throw new Error("Barbell Perch missing");
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
    "butterfly:training-barbell",
    "butterfly",
  );
  world.setContext(unitIndex, now);
  if (insectCollisionIndexRevision(unitIndex, now, true) == null)
    throw new Error("Training collision unavailable");
  return { initial, now, volume, world, perchId: definition.id };
}

describe("Unit Training barbell Landing Plan", () => {
  it("reaches the top of the bar across the full landing spread", async () => {
    const { initial, now, volume, world, perchId } = await mountBarbellPerch();
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
          occupantId: "butterfly:training-barbell",
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
        world.release(perchId, "butterfly:training-barbell");
      }
    } finally {
      world.release(perchId, "butterfly:training-barbell");
      world.dispose();
    }
  });
});
