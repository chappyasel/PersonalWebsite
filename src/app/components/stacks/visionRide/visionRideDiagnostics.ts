import { useSyncExternalStore } from "react";

type Snapshot = Readonly<{
  enabled: boolean;
  retroFxEnabled: boolean;
}>;
type Listener = () => void;

function enabledFromLocation() {
  if (typeof window === "undefined") return true;
  return !new URLSearchParams(window.location.search).has("novisionride");
}

let snapshot: Snapshot = {
  enabled: enabledFromLocation(),
  retroFxEnabled: true,
};
const listeners = new Set<Listener>();

function publish() {
  for (const listener of listeners) listener();
}

export const visionRideDiagnosticsController = {
  getSnapshot: () => snapshot,
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setEnabled: (enabled: boolean) => {
    if (snapshot.enabled === enabled) return;
    snapshot = { ...snapshot, enabled };
    if (!enabled) {
      void import("../store").then(({ useStacks }) => {
        const state = useStacks.getState();
        if (state.visionRidePhase !== "idle")
          state.requestVisionRideExit("disabled");
      });
    }
    publish();
  },
  setRetroFxEnabled: (retroFxEnabled: boolean) => {
    if (snapshot.retroFxEnabled === retroFxEnabled) return;
    snapshot = { ...snapshot, retroFxEnabled };
    publish();
  },
};

export function useVisionRideEnabled() {
  return useSyncExternalStore(
    visionRideDiagnosticsController.subscribe,
    () => visionRideDiagnosticsController.getSnapshot().enabled,
    () => true,
  );
}

export function useVisionRideRetroFxEnabled() {
  return useSyncExternalStore(
    visionRideDiagnosticsController.subscribe,
    () => visionRideDiagnosticsController.getSnapshot().retroFxEnabled,
    () => true,
  );
}
