import { MeshoptDecoder } from "meshoptimizer";
import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { PhysicsSceneScope } from "./PhysicsSceneProvider";
import { GOLF_CLUB_USER_DATA, golfClubPose } from "./golf/golfClubRig";
import { GOLF_FLAG_LOCAL } from "./golf/golfCourse";
import {
  GOLF_CLUB_GRIP_HEIGHT,
  GOLF_CLUB_MODEL_YAW,
  GOLF_CLUB_SCALE,
} from "./golf/golfLayout";
import { GOLF_IMPACT_AT } from "./golf/golfStrikeQueue";
import { planLoosePropLaunch } from "./golf/loosePropLaunch";
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
  impactOffset: number | null = null,
) {
  await warm();
  const unit = new THREE.Group();
  // The real scene extends to the flag. Include that extent so the safety
  // reset does not cut a long shot off at the empty fixture's old 8 m edge.
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1));
  flag.userData.physicsIgnore = true;
  flag.position.set(GOLF_FLAG_LOCAL[0], 0, GOLF_FLAG_LOCAL[1]);
  unit.add(flag);
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
  if (impactOffset !== null) {
    // The strike callback prepares physics after the frame has positioned
    // the club at impact. Include the model and both invisible picking targets.
    const club = new THREE.Group();
    club.userData = GOLF_CLUB_USER_DATA;
    const target = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.24, 0.38),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
    );
    target.position.set(0, -GOLF_CLUB_GRIP_HEIGHT + 0.09, 0);
    club.add(target);
    const shaftTarget = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, GOLF_CLUB_GRIP_HEIGHT, 10),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
    );
    shaftTarget.position.y = -GOLF_CLUB_GRIP_HEIGHT / 2;
    club.add(shaftTarget);
    const pose = golfClubPose(
      {
        current: entry.key,
        queued: [],
        stage: "recovery",
        elapsed: GOLF_IMPACT_AT + impactOffset,
      },
      { x: start.x, y: start.y + geometry.boundingBox!.max.y, z: start.z },
      { x: -1.55, y: -1, z: -17.2 },
    );
    club.position.set(pose.position.x, pose.position.y, pose.position.z);
    club.rotation.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, "YXZ");
    const bytes = fs.readFileSync("public/models/golf-club.glb");
    const model = (
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
    model.scale.setScalar(GOLF_CLUB_SCALE);
    model.position.y = -GOLF_CLUB_GRIP_HEIGHT;
    model.rotation.y = GOLF_CLUB_MODEL_YAW + pose.shaftTwist;
    club.add(model);
    unit.add(club);
    prepareScenePhysics(scope, entry);
  }
  expect(prepared.world.strike(entry, launch)).toBe(true);
  const body = entry.body!;
  const v0 = new THREE.Vector3(
    body.velocity.x,
    body.velocity.y,
    body.velocity.z,
  );
  const samples: THREE.Vector3[] = [];
  // The carrier origin rotates around the centre. Measure flight at the
  // body's centre so basketball spin cannot look like lost launch speed.
  const bodyStart = new THREE.Vector3(
    body.position.x,
    body.position.y,
    body.position.z,
  );
  let carryAtLanding: number | null = null;
  for (let frame = 0; frame < 300; frame += 1) {
    const previousVelocityY = body.velocity.y;
    prepared.world.tick(1 / 120, 1000 + frame);
    if (
      carryAtLanding === null &&
      previousVelocityY < 0 &&
      body.velocity.y >= 0
    ) {
      carryAtLanding = Math.hypot(
        body.position.x - bodyStart.x,
        body.position.z - bodyStart.z,
      );
    }
    if (frame < 36 && (frame + 1) % 12 === 0)
      samples.push(
        new THREE.Vector3(
          body.position.x,
          body.position.y,
          body.position.z,
        ).sub(bodyStart),
      );
  }
  prepared.world.dispose();
  return { v0, samples, carryAtLanding };
}

describe("golf bay strike on a loose prop", () => {
  describe.each([
    { name: "tennis ball", radius: 0.067, massKg: 0.058 },
    { name: "baseball", radius: 0.074, massKg: 0.145 },
    { name: "basketball", radius: 0.24, massKg: 0.62 },
  ])("with the club beside a $name", ({ radius, massKg }) => {
    it.each([0, 1 / 120, 1 / 60, 1 / 30])(
      "keeps moving forward at impact +%s s",
      async (offset) => {
        const launch = new THREE.Vector3(0.4, 6, -5.9);
        const { samples } = await strike(
          "sphere",
          new THREE.SphereGeometry(radius, 16, 12),
          massKg,
          launch,
          offset,
        );
        for (const [index, sample] of samples.entries()) {
          expect(sample.z).toBeLessThan(launch.z * (index + 1) * 0.1 * 0.8);
          expect(sample.y).toBeGreaterThan(0);
        }
      },
    );
  });
  it.each([
    { name: "tennis ball", radius: 0.067, massKg: 0.058, minimumCarry: 12 },
    { name: "baseball", radius: 0.074, massKg: 0.145, minimumCarry: 9 },
    { name: "basketball", radius: 0.24, massKg: 0.62, minimumCarry: 6 },
  ])(
    "gives a $name a full shot toward the green",
    async ({ radius, massKg, minimumCarry }) => {
      const velocity = planLoosePropLaunch(
        { x: -2.3, y: SHELF_GEOMETRY.groundY + radius, z: 0.4 },
        { x: GOLF_FLAG_LOCAL[0], y: -1, z: GOLF_FLAG_LOCAL[1] },
        massKg,
        radius,
        () => 0.5,
      );
      const { carryAtLanding } = await strike(
        "sphere",
        new THREE.SphereGeometry(radius, 16, 12),
        massKg,
        new THREE.Vector3(velocity.x, velocity.y, velocity.z),
        1 / 60,
      );
      expect(carryAtLanding).not.toBeNull();
      expect(carryAtLanding!).toBeGreaterThan(minimumCarry);
      expect(carryAtLanding!).toBeLessThan(15);
    },
  );
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
