"use client";

import { UNIT_COUNT } from "../data";
import { useStacks } from "../store";
import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";

import { SCENE_UNIT_LIGHT_USER_DATA_KEY } from "./sceneGpuPrewarm";
import { useScenePerformanceSettings } from "./scenePerformance";

export type SceneLightCounts = Readonly<{ point: number; spot: number }>;

export const SCENE_LIGHT_PADDING_CAPACITY: SceneLightCounts = Object.freeze({
  point: 16,
  spot: 8,
});

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
): SceneLightCounts {
  let maximumPoint = 0;
  let maximumSpot = 0;
  for (let unitIndex = 0; unitIndex < countsByUnit.length; unitIndex += 1) {
    const counts = neighborhoodLightCounts(countsByUnit, unitIndex);
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

function ActiveSceneLightShapePadding() {
  const scene = useThree((state) => state.scene);
  const activeUnit = useStacks((state) => state.activeUnit);
  const pointLights = useRef<Array<THREE.PointLight | null>>([]);
  const spotLights = useRef<Array<THREE.SpotLight | null>>([]);

  useLayoutEffect(() => {
    const padding = stableNeighborhoodLightPadding(
      managedLightCountsByUnit(scene, UNIT_COUNT),
      activeUnit,
    );
    const supported =
      padding.point <= SCENE_LIGHT_PADDING_CAPACITY.point &&
      padding.spot <= SCENE_LIGHT_PADDING_CAPACITY.spot;
    setVisiblePadding(pointLights.current, supported ? padding.point : 0);
    setVisiblePadding(spotLights.current, supported ? padding.spot : 0);
  }, [activeUnit, scene]);

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
