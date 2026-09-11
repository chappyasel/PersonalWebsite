"use client";

import { worldBoot } from "../boot/worldBootSession";
import { useLayoutEffect, useSyncExternalStore } from "react";

import { roomResidency } from "./roomResidency";

export function useRoomActive() {
  return useSyncExternalStore(
    roomResidency.subscribe,
    () => roomResidency.getSnapshot().active,
    () => true,
  );
}

/** Lives in the shared layout, but receives its content only from a visited
 * homepage. Direct entry to Books never mounts or imports the WebGL room. */
export function ResidentRoomHost() {
  const state = useSyncExternalStore(
    roomResidency.subscribe,
    roomResidency.getSnapshot,
    () => EMPTY_ROOM,
  );
  useLayoutEffect(() => {
    worldBoot.setDocumentActive(state.active);
  }, [state.active]);
  useLayoutEffect(
    () =>
      worldBoot.subscribe(() => {
        if (
          !roomResidency.getSnapshot().active &&
          !worldBoot.getView().revealed
        )
          roomResidency.evict();
      }),
    [],
  );
  if (!state.content) return null;
  return (
    <div
      key={state.generation}
      data-resident-room={state.active ? "active" : "parked"}
      inert={!state.active}
      aria-hidden={!state.active || undefined}
      style={
        state.active
          ? undefined
          : {
              position: "fixed",
              inset: 0,
              visibility: "hidden",
              pointerEvents: "none",
            }
      }
    >
      {state.content}
    </div>
  );
}

const EMPTY_ROOM = {
  generation: 0,
  content: null,
  active: true,
  enabled: true,
  expiresAt: null,
  returnHash: null,
};
