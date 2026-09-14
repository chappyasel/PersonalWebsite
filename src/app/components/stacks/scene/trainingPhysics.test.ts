import { MeshoptDecoder } from "meshoptimizer";
import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { expect, it } from "vitest";

import { PhysicsSceneScope } from "./PhysicsSceneProvider";
import { type ShelfHandle, prepareScenePhysics, warm } from "./physics";
import { SHELF_GEOMETRY, SHELF_SURFACE } from "./shelfGeometry";
import { TRAINING_BARBELL_POSE } from "./units/unitShelfLayout";

async function model(name: string, scale: number, rotation = 0) {
  const bytes = fs.readFileSync(`public/models/${name}.glb`);
  const gltf = await new GLTFLoader()
    .register(() => ({
      name: "geometry-only",
      loadMaterial: async () => new THREE.MeshBasicMaterial(),
    }))
    .setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  gltf.scene.scale.setScalar(scale);
  gltf.scene.rotation.y = rotation;
  const root = new THREE.Group();
  root.add(gltf.scene);
  return root;
}
it("carries the real basketball left above the dumbbell and below the top plank", async () => {
  await warm();
  const root = new THREE.Group();
  const shelf = new THREE.Group();
  shelf.position.y = SHELF_SURFACE.lower;
  root.add(shelf);
  const ball = await model("basketball", 0.435, 1.2);
  ball.children[0]!.position.y = -0.016;
  ball.position.set(1.06, 0, -0.08);
  shelf.add(ball);
  const dumbbell = await model("dumbbell", 1.55, -0.45);
  dumbbell.position.set(0.4, 0, -0.09);
  shelf.add(dumbbell);
  const barbell = await model(
    "barbell",
    TRAINING_BARBELL_POSE.scale,
    TRAINING_BARBELL_POSE.rotation[1],
  );
  barbell.position.set(...TRAINING_BARBELL_POSE.base);
  root.add(barbell);
  const { support, groundY, strapZ, strapInsetX, width, lower } =
    SHELF_GEOMETRY;
  for (const sign of [-1, 1])
    for (const [size, pos] of [
      [
        [support.width, -groundY, support.width],
        [sign * (width / 2 - strapInsetX), groundY / 2, strapZ],
      ],
      [
        [support.footWidth, support.footHeight, support.footDepth],
        [sign * (width / 2 - strapInsetX), groundY + 0.025, strapZ],
      ],
      [
        [support.cleatWidth, support.cleatHeight, support.cleatDepth],
        [sign * (width / 2 - strapInsetX), lower.centerY - 0.0575, strapZ],
      ],
    ] as [number[], number[]][]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size));
      mesh.position.fromArray(pos);
      root.add(mesh);
    }
  const scope = new PhysicsSceneScope();
  scope.registerRoot({ id: "training", kind: "unit", unitIndex: 2, root });
  const handles = [ball, dumbbell, barbell].map(
    (group, i): ShelfHandle => ({
      key: ["basketball", "dumbbell", "barbell"][i]!,
      unitIndex: 2,
      group,
      base: group.position.clone(),
      phase: { current: "rest" },
      spin: 0,
      shape: i === 0 ? "sphere" : "box",
      massKg: [0.62, 12, 60][i],
    }),
  );
  handles.forEach((h) => scope.registerHandle(h));
  const ready = prepareScenePhysics(scope, handles[0]!);
  expect(ready.status).toBe("ready");
  if (ready.status !== "ready") return;
  expect(handles[0]!.body!.boundingRadius).toBeCloseTo(0.24, 2);
  ready.world.grab(handles[0]!);
  const desired = {
    position: new THREE.Vector3(-0.2, 0.3, -0.08),
    quaternion: new THREE.Quaternion(),
  };
  for (let i = 0; i < 90; i++) {
    ready.world.moveHeld(
      handles[0]!,
      desired,
      1 / 60,
      new THREE.Vector3(0, 0, 1),
    );
    ready.world.tick(1 / 60, i + 1);
  }
  expect(ball.position.x).toBeCloseTo(desired.position.x, 3);
  expect(ball.position.y).toBeCloseTo(desired.position.y, 3);
  scope.dispose();
});
