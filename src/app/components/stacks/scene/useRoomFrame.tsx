"use client";

import { type RenderCallback, useFrame } from "@react-three/fiber";
import { createContext, useContext } from "react";

import { overlayBackgroundMotion } from "~/lib/overlays/backgroundMotion";
import { overlayCoordinator } from "~/lib/overlays/coordinator";

import { roomFrameDelta } from "./sceneClock";

/** Descendants of the inspected prop may still animate in a paused room. */
export const InspectedObjectFrames = createContext<(() => boolean) | null>(
  null,
);

/** Background simulation yields while rendering can continue for a handoff. */
export function useRoomFrame(
  callback: RenderCallback,
  priority = 0,
  needsFrame?: () => boolean,
  scheduledDelta?: (delta: number) => number,
) {
  const inspectedObject = useContext(InspectedObjectFrames);
  useFrame((state, delta, frame) => {
    const overlay = overlayCoordinator.getSnapshot();
    const foreground =
      (overlay.top === "object" && !!inspectedObject?.()) || !!needsFrame?.();
    // Unit scheduling can accumulate several frames. Resolve that interval
    // before scaling so it cannot replace the ambient delta with real time.
    const interval = scheduledDelta?.(delta) ?? delta;
    const dt = foreground ? interval : roomFrameDelta(state.clock, interval);
    if (!foreground && dt === 0 && overlayBackgroundMotion.getSnapshot().paused)
      return;
    callback(state, dt, frame);
  }, priority);
}
