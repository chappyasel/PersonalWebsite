import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { sceneUnitLightUserData } from "./sceneGpuPrewarm";
import {
  SCENE_LIGHT_PADDING_CAPACITY,
  managedLightCountsByUnit,
  neighborhoodLightCounts,
  stableNeighborhoodLightPadding,
} from "./sceneLightShape";

describe("stable nearby-light shader shape", () => {
  it("counts tagged point and spot lights without including room lights", () => {
    const scene = new THREE.Scene();
    const roomKey = new THREE.DirectionalLight();
    const shelf0 = new THREE.PointLight();
    const desk0 = new THREE.SpotLight();
    const shelf1 = new THREE.PointLight();
    const shelf2 = new THREE.PointLight();
    shelf0.userData = sceneUnitLightUserData(0);
    desk0.userData = sceneUnitLightUserData(0);
    shelf1.userData = sceneUnitLightUserData(1);
    shelf2.userData = sceneUnitLightUserData(2);
    scene.add(roomKey, shelf0, desk0, shelf1, shelf2);

    expect(managedLightCountsByUnit(scene, 3)).toEqual([
      { point: 1, spot: 1 },
      { point: 1, spot: 0 },
      { point: 1, spot: 0 },
    ]);
  });

  it("pads each stop to the maximum nearby point/spot shape", () => {
    const counts = [
      { point: 3, spot: 1 },
      { point: 1, spot: 0 },
      { point: 1, spot: 0 },
      { point: 3, spot: 1 },
      { point: 3, spot: 1 },
      { point: 3, spot: 1 },
      { point: 3, spot: 1 },
    ];

    expect(neighborhoodLightCounts(counts, 0)).toEqual({ point: 4, spot: 1 });
    expect(neighborhoodLightCounts(counts, 4)).toEqual({ point: 9, spot: 3 });
    expect(stableNeighborhoodLightPadding(counts, 0)).toEqual({
      point: 5,
      spot: 2,
    });
    expect(stableNeighborhoodLightPadding(counts, 3)).toEqual({
      point: 2,
      spot: 1,
    });
    expect(stableNeighborhoodLightPadding(counts, 4)).toEqual({
      point: 0,
      spot: 0,
    });
    expect(stableNeighborhoodLightPadding(counts, 6)).toEqual({
      point: 3,
      spot: 1,
    });
  });

  it("keeps the authored inventory inside the fixed padding allocation", () => {
    const largestRequiredPadding = { point: 5, spot: 2 };
    expect(largestRequiredPadding.point).toBeLessThanOrEqual(
      SCENE_LIGHT_PADDING_CAPACITY.point,
    );
    expect(largestRequiredPadding.spot).toBeLessThanOrEqual(
      SCENE_LIGHT_PADDING_CAPACITY.spot,
    );
  });
});
