import { useSyncExternalStore } from "react";

import type {
  QualityTransitionReason,
  SceneQualityMetrics,
  SceneQualityMode,
  SceneQualityPlan,
} from "./quality";

export type SceneQualityRuntimeSnapshot = Readonly<{
  plan: SceneQualityPlan;
  metrics: SceneQualityMetrics | null;
  storageBucket: string;
  learnedProfile: string | null;
  cooldownRemainingMs: number;
  transitionReason: QualityTransitionReason;
  fallbackStatus: "composer" | "direct-effects-error" | "direct-safety";
}>;

export type SceneQualityControlSnapshot = Readonly<{
  mode: SceneQualityMode;
  frozen: boolean;
  resetRequest: number;
  runtime: SceneQualityRuntimeSnapshot | null;
}>;

class SceneQualityController {
  private snapshot: SceneQualityControlSnapshot = {
    mode: "auto",
    frozen: false,
    resetRequest: 0,
    runtime: null,
  };
  private listeners = new Set<() => void>();

  readonly getSnapshot = () => this.snapshot;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(next: SceneQualityControlSnapshot) {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  setMode(mode: SceneQualityMode) {
    if (this.snapshot.mode === mode) return;
    this.publish({ ...this.snapshot, mode });
  }

  setFrozen(frozen: boolean) {
    if (this.snapshot.frozen === frozen) return;
    this.publish({ ...this.snapshot, frozen });
  }

  resetLearnedProfile() {
    this.publish({
      ...this.snapshot,
      resetRequest: this.snapshot.resetRequest + 1,
    });
  }

  publishRuntime(runtime: SceneQualityRuntimeSnapshot) {
    this.publish({ ...this.snapshot, runtime });
  }

  /** Manual controls are deliberately session-local and reset on reload. */
  resetControls() {
    this.snapshot = {
      mode: "auto",
      frozen: false,
      resetRequest: 0,
      runtime: null,
    };
  }
}

export const sceneQualityController = new SceneQualityController();

export function useSceneQualityControls() {
  return useSyncExternalStore(
    sceneQualityController.subscribe,
    sceneQualityController.getSnapshot,
    sceneQualityController.getSnapshot,
  );
}
