"use client";

import { UNIT_COUNT } from "../data";
import { useStacks } from "../store";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";

import { SCENE_UNIT_LIGHT_USER_DATA_KEY } from "./sceneGpuPrewarm";
import { useScenePerformanceSettings } from "./scenePerformance";
import { useAllUnitContentMounted } from "./unitContentResidencyStore";

export type SceneLightCounts = Readonly<{ point: number; spot: number }>;

export const SCENE_LIGHT_PADDING_CAPACITY: SceneLightCounts = Object.freeze({
  point: 16,
  spot: 8,
});

/** Each shelf's tagged point and spot lights once all of its contents have
 * mounted, measured on production on 2026-11-25 with every shelf mounted, in
 * light and dark. Shelves mount their contents in stages
 * (unitContentResidencyStore.ts), so the scene alone undercounts until the
 * last one is in. Padding to these counts from the start keeps the shader
 * light shape fixed, instead of growing once the far shelves mount and
 * recompiling every lit material in the room. A count the scene exceeds is
 * still honoured: the padding takes the larger of the two. */
export const EXPECTED_UNIT_LIGHT_COUNTS: readonly SceneLightCounts[] =
  Object.freeze([
    { point: 3, spot: 2 }, // about
    { point: 0, spot: 1 }, // books
    { point: 0, spot: 1 }, // training
    { point: 2, spot: 2 }, // systems
    { point: 2, spot: 2 }, // projects
    { point: 2, spot: 2 }, // blog
    { point: 2, spot: 2 }, // talks
  ]);

export function managedLightCountsByUnit(
  scene: THREE.Object3D,
  unitCount: number,
): SceneLightCounts[] {
  const counts = Array.from({ length: unitCount }, () => ({
    point: 0,
    spot: 0,
  }));
  scene.traverse((object) => {
    if (!(object instanceof THREE.Light)) return;
    const unitIndex: unknown = object.userData[SCENE_UNIT_LIGHT_USER_DATA_KEY];
    if (
      typeof unitIndex !== "number" ||
      !Number.isInteger(unitIndex) ||
      unitIndex < 0 ||
      unitIndex >= unitCount
    )
      return;
    const count = counts[unitIndex]!;
    if (object instanceof THREE.PointLight) count.point += 1;
    else if (object instanceof THREE.SpotLight) count.spot += 1;
  });
  return counts;
}

export function neighborhoodLightCounts(
  countsByUnit: readonly SceneLightCounts[],
  activeUnit: number,
): SceneLightCounts {
  let point = 0;
  let spot = 0;
  for (let unitIndex = 0; unitIndex < countsByUnit.length; unitIndex += 1) {
    if (Math.abs(unitIndex - activeUnit) > 1) continue;
    point += countsByUnit[unitIndex]!.point;
    spot += countsByUnit[unitIndex]!.spot;
  }
  return { point, spot };
}

export function stableNeighborhoodLightPadding(
  countsByUnit: readonly SceneLightCounts[],
  activeUnit: number,
  expectedByUnit: readonly SceneLightCounts[] = countsByUnit,
): SceneLightCounts {
  const largest = countsByUnit.map((counts, unitIndex) => ({
    point: Math.max(counts.point, expectedByUnit[unitIndex]?.point ?? 0),
    spot: Math.max(counts.spot, expectedByUnit[unitIndex]?.spot ?? 0),
  }));
  let maximumPoint = 0;
  let maximumSpot = 0;
  for (let unitIndex = 0; unitIndex < largest.length; unitIndex += 1) {
    const counts = neighborhoodLightCounts(largest, unitIndex);
    maximumPoint = Math.max(maximumPoint, counts.point);
    maximumSpot = Math.max(maximumSpot, counts.spot);
  }
  const current = neighborhoodLightCounts(countsByUnit, activeUnit);
  return {
    point: maximumPoint - current.point,
    spot: maximumSpot - current.spot,
  };
}

function setVisiblePadding<T extends THREE.Light>(
  lights: readonly (T | null)[],
  count: number,
) {
  for (let index = 0; index < lights.length; index += 1) {
    const light = lights[index];
    if (light) light.visible = index < count;
  }
}

const LIGHT_RECOUNT_GRACE_MS = 30_000;

export function lightCountsReached(
  countsByUnit: readonly SceneLightCounts[],
  expectedByUnit: readonly SceneLightCounts[],
) {
  return expectedByUnit.every(
    (expected, unitIndex) =>
      (countsByUnit[unitIndex]?.point ?? 0) >= expected.point &&
      (countsByUnit[unitIndex]?.spot ?? 0) >= expected.spot,
  );
}

function ActiveSceneLightShapePadding() {
  const scene = useThree((state) => state.scene);
  const activeUnit = useStacks((state) => state.activeUnit);
  const allUnitsMounted = useAllUnitContentMounted();
  const pointLights = useRef<Array<THREE.PointLight | null>>([]);
  const spotLights = useRef<Array<THREE.SpotLight | null>>([]);
  const lastShape = useRef("");

  const recountUntil = useRef<number | null>(null);
  const recountDone = useRef(false);

  const apply = (unit: number) => {
    const counts = managedLightCountsByUnit(scene, UNIT_COUNT);
    const padding = stableNeighborhoodLightPadding(
      counts,
      unit,
      EXPECTED_UNIT_LIGHT_COUNTS,
    );
    const supported =
      padding.point >= 0 &&
      padding.spot >= 0 &&
      padding.point <= SCENE_LIGHT_PADDING_CAPACITY.point &&
      padding.spot <= SCENE_LIGHT_PADDING_CAPACITY.spot;
    const point = supported ? padding.point : 0;
    const spot = supported ? padding.spot : 0;
    const shape = `${point}:${spot}`;
    if (shape !== lastShape.current) {
      lastShape.current = shape;
      setVisiblePadding(pointLights.current, point);
      setVisiblePadding(spotLights.current, spot);
    }
    return counts;
  };

  useLayoutEffect(() => {
    apply(activeUnit);
    // `apply` reads refs and the scene only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUnit, allUnitsMounted, scene]);

  // Recount before each frame draws until every shelf's lights are in. They
  // mount with the shelf's contents, after its own loads and sometimes well
  // after the shelf itself mounts, so no single event marks them; a frame
  // drawn with them and the old padding would compile a third light shape.
  // A profile that mounts fewer lights than expected never reaches the
  // expected counts, so the recount also stops 30 s after the last shelf
  // mounts. The traversal costs about 0.07 ms on the 3,700-object scene.
  useFrame(() => {
    if (recountDone.current) return;
    const counts = apply(useStacks.getState().activeUnit);
    if (lightCountsReached(counts, EXPECTED_UNIT_LIGHT_COUNTS)) {
      recountDone.current = true;
      return;
    }
    if (!allUnitsMounted) return;
    const now = performance.now();
    recountUntil.current ??= now + LIGHT_RECOUNT_GRACE_MS;
    if (now > recountUntil.current) recountDone.current = true;
  });

  return (
    <group name="scene-light-shape-padding">
      {Array.from(
        { length: SCENE_LIGHT_PADDING_CAPACITY.point },
        (_, index) => (
          <pointLight
            key={`point-${index}`}
            ref={(light) => {
              pointLights.current[index] = light;
            }}
            visible={false}
            intensity={0}
            distance={0}
            decay={2}
          />
        ),
      )}
      {Array.from({ length: SCENE_LIGHT_PADDING_CAPACITY.spot }, (_, index) => (
        <spotLight
          key={`spot-${index}`}
          ref={(light) => {
            spotLights.current[index] = light;
          }}
          visible={false}
          intensity={0}
          distance={0}
          decay={2}
        />
      ))}
    </group>
  );
}

/** Keep Three's nearby-light program key constant without changing authored
 * illumination. The off path mounts no lights and performs no frame work. */
export default function SceneLightShapePadding() {
  const settings = useScenePerformanceSettings();
  if (
    !settings.activeNeighborhoodLights ||
    !settings.stableNeighborhoodLightShape
  )
    return null;
  return <ActiveSceneLightShapePadding />;
}
