"use client";

import { useSyncExternalStore } from "react";

export type ModelArtifactDiagnosticsState = Readonly<{
  rendererEnabled: boolean;
}>;

const DEFAULT_STATE: ModelArtifactDiagnosticsState = Object.freeze({
  rendererEnabled: true,
});

export function createModelArtifactDiagnosticsController() {
  let snapshot = DEFAULT_STATE;
  const listeners = new Set<() => void>();

  const setRendererEnabled = (rendererEnabled: boolean) => {
    if (snapshot.rendererEnabled === rendererEnabled) return snapshot;
    snapshot = Object.freeze({ rendererEnabled });
    for (const listener of listeners) listener();
    return snapshot;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setRendererEnabled,
    reset: () => setRendererEnabled(DEFAULT_STATE.rendererEnabled),
  };
}

export const modelArtifactDiagnosticsController =
  createModelArtifactDiagnosticsController();

export function useModelArtifactRendererEnabled() {
  return useSyncExternalStore(
    modelArtifactDiagnosticsController.subscribe,
    () => modelArtifactDiagnosticsController.getSnapshot().rendererEnabled,
    () => DEFAULT_STATE.rendererEnabled,
  );
}
