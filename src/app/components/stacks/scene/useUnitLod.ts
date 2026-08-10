"use client";

// Proximity LOD with a sticky latch: textured content mounts when the unit
// is the active one or a direct neighbor, and then STAYS mounted. v3's
// symmetric unmount blanked units to big black slabs mid-travel while they
// were still fully on screen (audit §1.3) — decoded-texture memory for the
// whole traverse (~25 small textures) is far cheaper than that.
import { useEffect, useState } from "react";

import { useStacks } from "../store";

export function useUnitLod(index: number): boolean {
  const near = useStacks((s) => Math.abs(s.activeUnit - index) <= 1);
  const [latched, setLatched] = useState(false);
  useEffect(() => {
    if (near) setLatched(true);
  }, [near]);
  return near || latched;
}
