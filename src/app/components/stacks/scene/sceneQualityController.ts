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
  DEPTH_OF_FIELD_BOKEH_MULTIPLIER_MAX,
  DEPTH_OF_FIELD_BOKEH_MULTIPLIER_MIN,
  DEPTH_OF_FIELD_RESOLUTION_SCALE_MAX,
  DEPTH_OF_FIELD_RESOLUTION_SCALE_MIN,
} from "./quality";
import {
  type QualityAxisChange,
  SCENE_RESOLUTION_MAX_STEP,
  type SceneQualityAxes,
} from "./qualityAxes";

export type SceneQualityRuntimeSnapshot = Readonly<{
  plan: SceneQualityPlan;
  metrics: SceneQualityMetrics | null;
  /** Which resource the last sampling window was short of, derived from
   * `metrics`. Null until the first window lands. */
  constraint: SceneFrameConstraint | null;
  /** The live adaptive state. In automatic mode this, not the profile name, is
   * where the scene actually stands. */
  axes: SceneQualityAxes;
  /** Set when a preset is forced, so the overlay can show the preset and the
   * axes it resolved to rather than implying a rung that no longer exists. */
  forcedProfile: SceneQualityProfile | null;
  storageBucket: string;
  learnedProfile: string | null;
  cooldownRemainingMs: number;
  transitionReason: QualityTransitionReason | QualityAxisChange["reason"];
  /** `direct-manual` means the composer was switched off on purpose, by a
   * reload switch, a profile, or the console, rather than lost to an error. */
  fallbackStatus:
    | "composer"
    | "direct-effects-error"
    | "direct-safety"
    | "direct-manual";
}>;

export type SceneQualityControlSnapshot = Readonly<{
  mode: SceneQualityMode;
  /** Live, diagnostics-only finishing treatment layered over Cinematic.
   * Kept separate from the production profile union so Auto can never select
   * it and reloads always restore the approved scene. */
  cinematicPlus: boolean;
  frozen: boolean;
  resetRequest: number;
  /** Manual pin for the resolution axis, 0 to 11, or null to let the
   * controller drive it. Pinning is how you compare two render scales
   * without waiting for the ladder to walk between them. */
  resolutionStep: number | null;
  /** Diagnostics-only render-scale ceiling that replaces the profile cap and
   * the pixel budget. Null leaves the budget in charge. */
  resolutionCeiling: number | null;
  /** Session-only DoF tuning. Null hands each value back to the plan. */
  depthOfFieldBokehMultiplier: number | null;
  depthOfFieldResolutionScale: number | null;
}>;

class SceneQualityController {
  private snapshot: SceneQualityControlSnapshot = {
    mode: "auto",
    cinematicPlus: false,
    frozen: false,
    resetRequest: 0,
    resolutionStep: null,
    resolutionCeiling: null,
    depthOfFieldBokehMultiplier: null,
    depthOfFieldResolutionScale: null,
  };
  private runtime: SceneQualityRuntimeSnapshot | null = null;
  private listeners = new Set<() => void>();
  private runtimeListeners = new Set<() => void>();

  readonly getSnapshot = () => this.snapshot;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly getRuntimeSnapshot = () => this.runtime;
  readonly subscribeRuntime = (listener: () => void) => {
    this.runtimeListeners.add(listener);
    return () => this.runtimeListeners.delete(listener);
  };

  private publish(next: SceneQualityControlSnapshot) {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  setMode(mode: SceneQualityMode | "cinematic+") {
    const cinematicPlus = mode === "cinematic+";
    const resolvedMode = cinematicPlus ? "cinematic" : mode;
    if (
      this.snapshot.mode === resolvedMode &&
      this.snapshot.cinematicPlus === cinematicPlus
    )
      return;
    this.publish({
      ...this.snapshot,
      mode: resolvedMode,
      cinematicPlus,
    });
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

  setDepthOfFieldBokehMultiplier(multiplier: number | null) {
    const next =
      multiplier == null || !Number.isFinite(multiplier)
        ? null
        : Math.min(
            DEPTH_OF_FIELD_BOKEH_MULTIPLIER_MAX,
            Math.max(DEPTH_OF_FIELD_BOKEH_MULTIPLIER_MIN, multiplier),
          );
    if (this.snapshot.depthOfFieldBokehMultiplier === next) return;
    this.publish({ ...this.snapshot, depthOfFieldBokehMultiplier: next });
  }

  setDepthOfFieldResolutionScale(scale: number | null) {
    const next =
      scale == null || !Number.isFinite(scale)
        ? null
        : Math.min(
            DEPTH_OF_FIELD_RESOLUTION_SCALE_MAX,
            Math.max(DEPTH_OF_FIELD_RESOLUTION_SCALE_MIN, scale),
          );
    if (this.snapshot.depthOfFieldResolutionScale === next) return;
    this.publish({ ...this.snapshot, depthOfFieldResolutionScale: next });
  }

  resetDepthOfField() {
    if (
      this.snapshot.depthOfFieldBokehMultiplier == null &&
      this.snapshot.depthOfFieldResolutionScale == null
    )
      return;
    this.publish({
      ...this.snapshot,
      depthOfFieldBokehMultiplier: null,
      depthOfFieldResolutionScale: null,
    });
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
    this.runtime = runtime;
    for (const listener of this.runtimeListeners) listener();
  }

  /** Manual controls are deliberately session-local and reset on reload. */
  resetControls() {
    this.snapshot = {
      mode: "auto",
      cinematicPlus: false,
      frozen: false,
      resetRequest: 0,
      resolutionStep: null,
      resolutionCeiling: null,
      depthOfFieldBokehMultiplier: null,
      depthOfFieldResolutionScale: null,
    };
    this.runtime = null;
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

/** Runtime metrics update four times per second. Keep them on a diagnostics-
 * only channel so publishing a new sample cannot wake every scene component
 * that subscribes to the much colder live-control state. */
const subscribeToNothing = () => () => undefined;

export function useSceneQualityRuntime(enabled = true) {
  return useSyncExternalStore(
    enabled ? sceneQualityController.subscribeRuntime : subscribeToNothing,
    sceneQualityController.getRuntimeSnapshot,
    sceneQualityController.getRuntimeSnapshot,
  );
}
