import { UNIT_COUNT } from "../data";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { sceneUnitLightUserData } from "./sceneGpuPrewarm";
import {
  EXPECTED_UNIT_LIGHT_COUNTS,
  SCENE_LIGHT_PADDING_CAPACITY,
  lightCountsReached,
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

  it("pads to the expected counts before the far shelves have mounted", () => {
    // Boot at About: only About and Books have their contents.
    const booting = EXPECTED_UNIT_LIGHT_COUNTS.map((counts, unitIndex) =>
      unitIndex <= 1 ? counts : { point: 0, spot: 0 },
    );
    const atBoot = stableNeighborhoodLightPadding(
      booting,
      0,
      EXPECTED_UNIT_LIGHT_COUNTS,
    );
    const mounted = stableNeighborhoodLightPadding(
      EXPECTED_UNIT_LIGHT_COUNTS,
      0,
      EXPECTED_UNIT_LIGHT_COUNTS,
    );
    expect(atBoot).toEqual(mounted);
    // The visible total, nearby lights plus padding, is the same at every stop.
    const totals = EXPECTED_UNIT_LIGHT_COUNTS.map((_, unit) => {
      const near = neighborhoodLightCounts(EXPECTED_UNIT_LIGHT_COUNTS, unit);
      const padding = stableNeighborhoodLightPadding(
        EXPECTED_UNIT_LIGHT_COUNTS,
        unit,
        EXPECTED_UNIT_LIGHT_COUNTS,
      );
      return {
        point: near.point + padding.point,
        spot: near.spot + padding.spot,
      };
    });
    expect(new Set(totals.map((t) => `${t.point}:${t.spot}`)).size).toBe(1);
  });

  it("honours a shelf that has more lights than expected", () => {
    const counts = EXPECTED_UNIT_LIGHT_COUNTS.map((c) => ({ ...c }));
    counts[4] = { point: 5, spot: 2 };
    const padding = stableNeighborhoodLightPadding(
      counts,
      4,
      EXPECTED_UNIT_LIGHT_COUNTS,
    );
    expect(padding).toEqual({ point: 0, spot: 0 });
  });

  it("lists one expected count per shelf, inside the padding allocation", () => {
    expect(EXPECTED_UNIT_LIGHT_COUNTS).toHaveLength(UNIT_COUNT);
    const atAbout = stableNeighborhoodLightPadding(
      EXPECTED_UNIT_LIGHT_COUNTS.map(() => ({ point: 0, spot: 0 })),
      0,
      EXPECTED_UNIT_LIGHT_COUNTS,
    );
    expect(atAbout.point).toBeLessThanOrEqual(
      SCENE_LIGHT_PADDING_CAPACITY.point,
    );
    expect(atAbout.spot).toBeLessThanOrEqual(SCENE_LIGHT_PADDING_CAPACITY.spot);
  });

  it("knows when every shelf's lights are in", () => {
    const partial = EXPECTED_UNIT_LIGHT_COUNTS.map((c, i) =>
      i === 0 ? { point: 0, spot: 0 } : c,
    );
    expect(lightCountsReached(partial, EXPECTED_UNIT_LIGHT_COUNTS)).toBe(false);
    expect(
      lightCountsReached(
        EXPECTED_UNIT_LIGHT_COUNTS,
        EXPECTED_UNIT_LIGHT_COUNTS,
      ),
    ).toBe(true);
  });
});
