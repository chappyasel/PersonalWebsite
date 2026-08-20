import { useSyncExternalStore } from "react";

import type {
  QualityTransitionReason,
  SceneFrameConstraint,
  SceneQualityMetrics,
  SceneQualityMode,
  SceneQualityPlan,
  SceneQualityProfile,
} from "./quality";
import {
  SCENE_RESOLUTION_MAX_STEP,
  type QualityAxisChange,
  type SceneQualityAxes,
} from "./qualityAxes";

export type SceneQualityRuntimeSnapshot = Readonly<{
  plan: SceneQualityPlan;
  metrics: SceneQualityMetrics | null;
  /** Which resource the last sampling window was short of, derived from
   * `metrics`. Null until the first window lands. */
  constraint: SceneFrameConstraint | null;
  /** The live axis triple. In automatic mode this, not the profile name, is
   * where the scene actually stands. */
  axes: SceneQualityAxes;
  /** Set when a preset is forced, so the overlay can show the preset and the
   * axes it resolved to rather than implying a rung that no longer exists. */
  forcedProfile: SceneQualityProfile | null;
  storageBucket: string;
  learnedProfile: string | null;
  cooldownRemainingMs: number;
  transitionReason: QualityTransitionReason | QualityAxisChange["reason"];
  fallbackStatus: "composer" | "direct-effects-error" | "direct-safety";
}>;

export type SceneQualityControlSnapshot = Readonly<{
  mode: SceneQualityMode;
  frozen: boolean;
  resetRequest: number;
  runtime: SceneQualityRuntimeSnapshot | null;
  /** Manual pin for the resolution axis, 0 to 11, or null to let the
   * controller drive it. Pinning is how you compare two render scales
   * without waiting for the ladder to walk between them. */
  resolutionStep: number | null;
  /** Diagnostics-only render-scale ceiling that replaces the profile cap and
   * the pixel budget. Null leaves the budget in charge. */
  resolutionCeiling: number | null;
}>;

class SceneQualityController {
  private snapshot: SceneQualityControlSnapshot = {
    mode: "auto",
    frozen: false,
    resetRequest: 0,
    runtime: null,
    resolutionStep: null,
    resolutionCeiling: null,
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

  /** Pin the resolution axis, or pass null to hand it back to the
   * controller. Clamped to the ladder rather than rejected, so a stale value
   * from a control cannot put the plan outside its own bounds. */
  setResolutionStep(step: number | null) {
    const next =
      step == null
        ? null
        : Math.min(SCENE_RESOLUTION_MAX_STEP, Math.max(0, Math.round(step)));
    if (this.snapshot.resolutionStep === next) return;
    this.publish({ ...this.snapshot, resolutionStep: next });
  }

  /** Set a manual render-scale ceiling, or null to hand the pixel budget
   * back. Deliberately unclamped here: the plan clamps it against the actual
   * viewport, which this store does not know. */
  setResolutionCeiling(dpr: number | null) {
    const next = dpr == null || !Number.isFinite(dpr) ? null : dpr;
    if (this.snapshot.resolutionCeiling === next) return;
    this.publish({ ...this.snapshot, resolutionCeiling: next });
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
      resolutionStep: null,
      resolutionCeiling: null,
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
