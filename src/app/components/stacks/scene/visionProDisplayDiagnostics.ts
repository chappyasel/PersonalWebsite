"use client";

import { useSyncExternalStore } from "react";

import type {
  ActiveVisionProDisplayVariant,
  VisionProDisplayVariant,
} from "./visionProDisplay";

export type VisionProDisplayDiagnosticsSnapshot = Readonly<{
  enabled: boolean;
  variant: ActiveVisionProDisplayVariant;
}>;

export const DEFAULT_VISION_PRO_DISPLAY_DIAGNOSTICS: VisionProDisplayDiagnosticsSnapshot =
  Object.freeze({
    enabled: false,
    variant: "retrowave",
  });

export function createVisionProDisplayDiagnosticsController() {
  let snapshot = DEFAULT_VISION_PRO_DISPLAY_DIAGNOSTICS;
  const listeners = new Set<() => void>();

  const publish = (next: VisionProDisplayDiagnosticsSnapshot) => {
    if (next.enabled === snapshot.enabled && next.variant === snapshot.variant)
      return snapshot;
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
    return snapshot;
  };

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setEnabled: (enabled: boolean) => publish({ ...snapshot, enabled }),
    setVariant: (variant: ActiveVisionProDisplayVariant) =>
      publish({ ...snapshot, variant }),
    reset: () => publish(DEFAULT_VISION_PRO_DISPLAY_DIAGNOSTICS),
  });
}

/** Session-only display state. Authored triggers choose the artwork while the
 * shelf interaction owns its dim hover wake; enabled means the display has
 * been latched fully on by activation or the Render diagnostic. */
export const visionProDisplayDiagnosticsController =
  createVisionProDisplayDiagnosticsController();

export function resolveVisionProDisplayVariant(
  snapshot: VisionProDisplayDiagnosticsSnapshot,
): VisionProDisplayVariant {
  return snapshot.enabled ? snapshot.variant : "dormant";
}

export function useVisionProDisplayVariant() {
  return useSyncExternalStore(
    visionProDisplayDiagnosticsController.subscribe,
    () =>
      resolveVisionProDisplayVariant(
        visionProDisplayDiagnosticsController.getSnapshot(),
      ),
    () => "dormant" as const,
  );
}

export function useVisionProDisplaySnapshot() {
  return useSyncExternalStore(
    visionProDisplayDiagnosticsController.subscribe,
    visionProDisplayDiagnosticsController.getSnapshot,
    () => DEFAULT_VISION_PRO_DISPLAY_DIAGNOSTICS,
  );
}
