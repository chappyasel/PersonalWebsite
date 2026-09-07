import { useStacks } from "../store";

import { visionRideDiagnosticsController } from "./visionRideDiagnostics";
import { visionRideRuntime } from "./visionRideRuntime";

export const APPLE_VISION_PRO_URL =
  "https://www.apple.com/apple-vision-pro/" as const;

let preloadPromise: Promise<void> | null = null;

export function preloadVisionRide() {
  if (!visionRideDiagnosticsController.getSnapshot().enabled)
    return Promise.resolve();
  preloadPromise ??= import("./VisionRideWorld").then((module) => {
    module.preloadVisionRideAssets();
  });
  return preloadPromise;
}

export function activateVisionRide() {
  const state = useStacks.getState();
  if (
    !visionRideDiagnosticsController.getSnapshot().enabled ||
    state.visionRideSessionFailed
  )
    return false;
  if (state.visionRidePhase !== "idle") return false;
  if (!visionRideRuntime.captureSource()) {
    state.failVisionRide(new Error("Vision Pro shelf anchor is unavailable"));
    return false;
  }
  state.beginVisionRide();
  void preloadVisionRide().catch((error: unknown) => {
    useStacks.getState().failVisionRide(error);
  });
  return true;
}
