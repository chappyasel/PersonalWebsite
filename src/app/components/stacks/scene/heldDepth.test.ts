import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  heldDepthBounds,
  heldDepthFromPinch,
  heldDepthWheelPixels,
  heldDragDirection,
  nextHeldDepth,
} from "./heldDepth";

describe("held prop depth", () => {
  it.each([-0.7, 0.7])(
    "keeps vertical finger movement at the pickup shelf depth, NDC %s",
    (y) => {
      const camera = new THREE.PerspectiveCamera(40, 0.5, 0.1, 100);
      camera.position.set(0, 2.5, 5);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const direction = heldDragDirection(
        camera.getWorldDirection(new THREE.Vector3()),
        new THREE.Vector3(),
      );
      const depth = new THREE.Vector3().sub(camera.position).dot(direction);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        direction,
        camera.position.clone().addScaledVector(direction, depth),
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(0, y), camera);
      const target = ray.ray.intersectPlane(plane, new THREE.Vector3())!;
      expect(Math.sign(target.y)).toBe(Math.sign(y));
      expect(target.z).toBeCloseTo(0, 8);
    },
  );

  it("normalizes pixel, line, and page wheel deltas", () => {
    expect(heldDepthWheelPixels(12, 0, 800)).toBe(12);
    expect(heldDepthWheelPixels(2, 1, 800)).toBe(66);
    expect(heldDepthWheelPixels(0.5, 2, 800)).toBe(400);
  });

  it("pulls closer on wheel up and pushes farther on wheel down", () => {
    const bounds = heldDepthBounds(5);

    expect(nextHeldDepth(5, -100, bounds)).toBe(4.75);
    expect(nextHeldDepth(4.75, 100, bounds)).toBe(5);
  });

  it("keeps the prop in front of the camera and near its pickup depth", () => {
    const bounds = heldDepthBounds(5);

    expect(nextHeldDepth(5, -10_000, bounds)).toBe(bounds.min);
    expect(nextHeldDepth(5, 10_000, bounds)).toBe(bounds.max);
    expect(bounds.min).toBeCloseTo(1.4);
    expect(bounds.max).toBe(5);
  });

  it("pulls closer as fingers spread and pushes farther as they pinch", () => {
    const bounds = heldDepthBounds(5);

    expect(heldDepthFromPinch(5, 100, 200, bounds)).toBe(2.5);
    expect(heldDepthFromPinch(5, 100, 50, bounds)).toBe(bounds.max);
  });

  it("clamps noisy and extreme pinch spans", () => {
    const bounds = heldDepthBounds(5);

    expect(heldDepthFromPinch(5, 1, 2, bounds)).toBe(5);
    expect(heldDepthFromPinch(5, 100, 1_000, bounds)).toBe(bounds.min);
  });
});
