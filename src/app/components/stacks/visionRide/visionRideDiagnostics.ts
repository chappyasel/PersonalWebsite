import type { PixelLook } from "../scene/pixelArt";
import { useSyncExternalStore } from "react";

import type { VisionRideModifiers } from "./visionRideProfiles";

export const VISION_RIDE_SCENE_PREVIEWS = [
  "authored",
  "canonical",
  "night",
  "redline",
  "golf",
  "night-redline",
  "night-golf",
  "redline-golf",
  "full-stack",
] as const;
export type VisionRideScenePreview =
  (typeof VISION_RIDE_SCENE_PREVIEWS)[number];
export type VisionRideFinishPreview = "authored" | PixelLook;

type Snapshot = Readonly<{
  enabled: boolean;
  retroFxEnabled: boolean;
  mileMarkersEnabled: boolean;
  lightTrailsEnabled: boolean;
  scenePreview: VisionRideScenePreview;
  finishPreview: VisionRideFinishPreview;
}>;
type Listener = () => void;

function enabledFromLocation() {
  if (typeof window === "undefined") return true;
  return !new URLSearchParams(window.location.search).has("novisionride");
}

let snapshot: Snapshot = {
  enabled: enabledFromLocation(),
  retroFxEnabled: true,
  mileMarkersEnabled: true,
  lightTrailsEnabled: true,
  scenePreview: "authored",
  finishPreview: "authored",
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
  setMileMarkersEnabled: (mileMarkersEnabled: boolean) => {
    if (snapshot.mileMarkersEnabled === mileMarkersEnabled) return;
    snapshot = { ...snapshot, mileMarkersEnabled };
    publish();
  },
  setLightTrailsEnabled: (lightTrailsEnabled: boolean) => {
    if (snapshot.lightTrailsEnabled === lightTrailsEnabled) return;
    snapshot = { ...snapshot, lightTrailsEnabled };
    publish();
  },
  setScenePreview: (scenePreview: VisionRideScenePreview) => {
    if (snapshot.scenePreview === scenePreview) return;
    snapshot = { ...snapshot, scenePreview };
    publish();
  },
  setFinishPreview: (finishPreview: VisionRideFinishPreview) => {
    if (snapshot.finishPreview === finishPreview) return;
    snapshot = { ...snapshot, finishPreview };
    publish();
  },
};

export function visionRidePreviewModifiers(
  preview: VisionRideScenePreview,
): VisionRideModifiers | null {
  if (preview === "authored") return null;
  return {
    night:
      preview === "night" ||
      preview === "night-redline" ||
      preview === "night-golf" ||
      preview === "full-stack",
    redline:
      preview === "redline" ||
      preview === "night-redline" ||
      preview === "redline-golf" ||
      preview === "full-stack",
    golf:
      preview === "golf" ||
      preview === "night-golf" ||
      preview === "redline-golf" ||
      preview === "full-stack",
  };
}

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

export function useVisionRideMileMarkersEnabled() {
  return useSyncExternalStore(
    visionRideDiagnosticsController.subscribe,
    () => visionRideDiagnosticsController.getSnapshot().mileMarkersEnabled,
    () => true,
  );
}

export function useVisionRideLightTrailsEnabled() {
  return useSyncExternalStore(
    visionRideDiagnosticsController.subscribe,
    () => visionRideDiagnosticsController.getSnapshot().lightTrailsEnabled,
    () => true,
  );
}

export function useVisionRidePreviewOverrides() {
  return useSyncExternalStore(
    visionRideDiagnosticsController.subscribe,
    visionRideDiagnosticsController.getSnapshot,
    visionRideDiagnosticsController.getSnapshot,
  );
}
