"use client";

import { worldBoot } from "../boot/worldBootSession";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useSyncExternalStore,
} from "react";

import { roomResidency } from "./roomResidency";

/** Pause the renderer subtree independently of the surrounding reader. */
export const RoomActivityContext = createContext(true);

export function useRoomActive() {
  const enabled = useContext(RoomActivityContext);
  const active = useSyncExternalStore(
    roomResidency.subscribe,
    () => roomResidency.getSnapshot().active,
    () => true,
  );
  return enabled && active;
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
              // Canvas and chrome children set visibility: visible. Group
              // opacity hides them too, while preserving layout for return.
              opacity: 0,
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
