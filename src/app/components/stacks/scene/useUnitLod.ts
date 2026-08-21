"use client";

// Role-sized visuals normally mount before interaction so Safari can upload
// their textures and geometry behind the boot screen. The old proximity path
// remains available as a live diagnostic comparison.
import { useStacks } from "../store";
import { useEffect, useState } from "react";

import { useScenePerformanceSettings } from "./scenePerformance";

export const UNIT_TEXTURE_RELEASE_MS = 3_000;

export function resolveUnitVisualResidency({
  prewarmAll,
  near,
  resident,
}: Readonly<{
  prewarmAll: boolean;
  near: boolean;
  resident: boolean;
}>): boolean {
  return prewarmAll || near || resident;
}

export function useUnitLod(index: number): boolean {
  const { prewarmAllUnitVisuals } = useScenePerformanceSettings();
  const near = useStacks((s) => Math.abs(s.activeUnit - index) <= 1);
  const [resident, setResident] = useState(near);
  useEffect(() => {
    if (near) {
      setResident(true);
      return;
    }
    const release = window.setTimeout(
      () => setResident(false),
      UNIT_TEXTURE_RELEASE_MS,
    );
    return () => window.clearTimeout(release);
  }, [near]);
  return resolveUnitVisualResidency({
    prewarmAll: prewarmAllUnitVisuals,
    near,
    resident,
  });
}
