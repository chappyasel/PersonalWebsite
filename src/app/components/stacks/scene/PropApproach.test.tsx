import { progressRef, useStacks } from "../store";
import { type RootState } from "@react-three/fiber";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import PropApproach from "./PropApproach";
import {
  createPropApproach,
  createPropTurn,
  nearPropApproach,
} from "./propApproachState";

const harness = vi.hoisted(() => ({
  frame: null as ((state: RootState, delta: number) => void) | null,
}));

vi.mock("@react-three/fiber", () => ({
  useFrame: (callback: typeof harness.frame) => {
    harness.frame = callback;
  },
  useThree: (selector: (state: { get: () => object }) => unknown) =>
    selector({ get: () => ({}) }),
}));

afterEach(() => {
  nearPropApproach()?.set(false);
  harness.frame = null;
});

// Run the component's frame callback against real Three objects. The supplied
// innerRef replaces the ref attachment that server rendering does not perform.
function mountApproach() {
  const node = new THREE.Group();
  const parent = new THREE.Group();
  parent.position.set(0.4, -0.2, -1);
  parent.rotation.set(0.1, 0.25, -0.05);
  parent.add(node);
  const camera = new THREE.PerspectiveCamera(33, 16 / 9, 0.1, 100);
  camera.position.set(0, 0.3, 6);
  camera.lookAt(0, 0, 0);
  const pointer = new THREE.Vector2();
  const controller = createPropApproach("test:steady-prop");
  const turn = createPropTurn();
  const tilt = { current: 0 };
  renderToStaticMarkup(
    <PropApproach
      controller={controller}
      unitIndex={useStacks.getState().activeUnit}
      height={0.5}
      width={0.5}
      innerRef={{ current: node }}
      turn={turn}
      tilt={tilt}
    >
      {null}
    </PropApproach>,
  );
  controller.set(true);
  const startingProgress = progressRef.current;
  const step = () => {
    progressRef.current = startingProgress;
    camera.updateMatrixWorld();
    harness.frame!(
      {
        camera,
        pointer,
        size: { width: 1600, height: 900, top: 0, left: 0 },
      } as RootState,
      1 / 60,
    );
    parent.updateMatrixWorld(true);
  };
  const settle = () => {
    for (let i = 0; i < 240; i++) step();
  };
  const pose = () => {
    const position = node.getWorldPosition(new THREE.Vector3()).project(camera);
    const rotation = camera.quaternion
      .clone()
      .invert()
      .multiply(node.getWorldQuaternion(new THREE.Quaternion()));
    return { position, rotation };
  };
  settle();
  return { camera, pointer, controller, turn, tilt, node, step, settle, pose };
}

describe("selected prop cursor movement", () => {
  it("does not add movement from the camera itself", () => {
    const scene = mountApproach();
    const initial = scene.pose();
    for (let i = 0; i < 120; i++) {
      scene.camera.position.set(
        Math.sin(i * 0.2) * 0.15,
        0.3 + Math.cos(i * 0.13) * 0.1,
        6,
      );
      scene.camera.lookAt(scene.pointer.x * 0.1, scene.pointer.y * 0.05, 0);
      scene.step();
      const current = scene.pose();
      expect(current.position.distanceTo(initial.position)).toBeLessThan(1e-8);
      expect(current.rotation.angleTo(initial.rotation)).toBeLessThan(1e-7);
    }
  });

  it("gently follows the cursor within a small screen and tilt range", () => {
    const scene = mountApproach();
    const initial = scene.pose();
    const captionBottom = scene.controller.frame.bottom;
    scene.pointer.set(1, 1);
    scene.step();
    const firstStep = scene.pose().position.distanceTo(initial.position);
    expect(firstStep).toBeGreaterThan(0);
    expect(firstStep).toBeLessThan(0.002);
    scene.settle();
    const offset = scene.pose().position.sub(initial.position);
    // Under 0.75% of the full viewport in either direction and one degree
    // of total tilt, with enough movement to avoid a frozen close-up.
    expect(offset.x).toBeGreaterThan(0.005);
    expect(offset.x).toBeLessThan(0.015);
    expect(offset.y).toBeGreaterThan(0.003);
    expect(offset.y).toBeLessThan(0.015);
    const angle = scene.pose().rotation.angleTo(initial.rotation);
    expect(angle).toBeGreaterThan(0.005);
    expect(angle).toBeLessThan(Math.PI / 180);
    expect(scene.controller.frame.bottom).toBe(captionBottom);
    scene.pointer.set(0, 0);
    scene.settle();
    expect(scene.pose().position.distanceTo(initial.position)).toBeLessThan(
      1e-8,
    );
  });

  it("still responds to intentional hand turns and returns to the shelf", () => {
    const scene = mountApproach();
    const initial = scene.pose();
    scene.turn.yaw = 0.4;
    scene.tilt.current = 0.2;
    scene.settle();
    expect(scene.pose().rotation.angleTo(initial.rotation)).toBeGreaterThan(
      0.3,
    );
    scene.controller.set(false);
    scene.settle();
    expect(scene.node.position.length()).toBe(0);
    expect(scene.node.quaternion.angleTo(new THREE.Quaternion())).toBe(0);
  });
});
