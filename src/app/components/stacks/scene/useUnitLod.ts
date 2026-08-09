"use client";

// Proximity LOD: textured content mounts only for the active unit and its
// direct neighbors. Unmounting drei <Image> disposes its GPU texture, keeping
// decoded-texture memory bounded on the 7-unit traverse.
import { useStacks } from "../store";

export function useUnitLod(index: number): boolean {
  return useStacks((s) => Math.abs(s.activeUnit - index) <= 1);
}
