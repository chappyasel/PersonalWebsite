"use client";

// Proximity LOD with a delayed release. Textured content mounts when the unit
// is active or adjacent, then remains resident long enough to leave the frame.
// The old permanent latch was cheap for 256/512 px variants but would retain
// about 104 MiB of full-resolution photo textures after a complete traverse.
import { useEffect, useState } from "react";

import { useStacks } from "../store";

export const UNIT_TEXTURE_RELEASE_MS = 3_000;

export function useUnitLod(index: number): boolean {
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
  return near || resident;
}
