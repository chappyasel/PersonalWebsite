import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { blinkerSpot, isShown } from "./coordinationBlinkerSpot";
import { BLINKER_LOCAL_PER_EM } from "./coordinationDust";

function scene({ distance, scale = 1 }: { distance: number; scale?: number }) {
  const camera = new THREE.PerspectiveCamera(33, 2, 0.1, 100);
  camera.position.set(0, 0, distance);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const blinker = new THREE.Object3D();
  blinker.scale.setScalar(scale);
  blinker.updateMatrixWorld();
  return { camera, blinker };
}

describe("blinkerSpot", () => {
  it("lands a centred blinker in the middle of the page", () => {
    const { camera, blinker } = scene({ distance: 4 });
    const spot = blinkerSpot(blinker, camera, 800, 400);
    expect(spot.x).toBeCloseTo(400);
    expect(spot.y).toBeCloseTo(200);
    expect(Math.abs(spot.z)).toBeLessThan(1);
  });

  it("matches the billboard's em, which scales with the object and distance", () => {
    const { camera, blinker } = scene({ distance: 4, scale: 2 });
    const halfHeightAtDepth = Math.tan(THREE.MathUtils.degToRad(33 / 2)) * 4;
    const pixelsPerUnit = 200 / halfHeightAtDepth;
    expect(blinkerSpot(blinker, camera, 800, 400).em).toBeCloseTo(
      BLINKER_LOCAL_PER_EM * 2 * pixelsPerUnit,
      4,
    );
  });

  it("reports a blinker behind the camera as outside the depth range", () => {
    const { camera, blinker } = scene({ distance: -4 });
    camera.rotation.y = 0;
    camera.updateMatrixWorld();
    expect(Math.abs(blinkerSpot(blinker, camera, 800, 400).z)).toBeGreaterThan(
      1,
    );
  });
});

describe("isShown", () => {
  it("needs every ancestor visible", () => {
    const parent = new THREE.Group();
    const child = new THREE.Object3D();
    parent.add(child);
    expect(isShown(child)).toBe(true);
    parent.visible = false;
    expect(isShown(child)).toBe(false);
    expect(isShown(null)).toBe(false);
  });
});
