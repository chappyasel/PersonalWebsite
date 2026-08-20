import { useStacks } from "../store";
import { useSyncExternalStore } from "react";

export type PlacardGlassMode = "auto" | "native" | "paper";
export type PracticalGlowMode = "aperture" | "halo" | "sprite";

export type ScenePerformanceSettings = Readonly<{
  /** Skip the expensive half of Grabbable's frame work only after a distant
   * prop is provably back at its authored, non-hovered resting pose. */
  suspendSettledPropWork: boolean;
  /** Keep best-effort decoding/compilation from competing with a traverse. */
  pausePrewarmDuringTravel: boolean;
  /** Expose real lights only for the active unit and its immediate neighbours.
   * Emissive fixture geometry and analytic meadow pools remain unchanged. */
  activeNeighborhoodLights: boolean;
  /** Give the far tuft LOD a compile-time-cheaper motion shader. */
  simplifiedFarMeadow: boolean;
  /** Native glass is the shipped default on every input type. Auto retains
   * the coarse-touch paper fallback only for performance comparisons. */
  placardGlassMode: PlacardGlassMode;
  /** Keep every unit resident while hiding and suspending work outside the
   * camera's active neighborhood. */
  virtualizeUnitWork: boolean;
  /** Halo feathers the real aperture in its own plane. Aperture removes that
   * shoulder; sprite keeps the former camera-facing billboard for A/Bs. */
  practicalGlowMode: PracticalGlowMode;
  /** Let each durable quality rung lower the desktop physical-pixel budget,
   * rather than allowing the shared ceiling to flatten the whole ladder. */
  effectiveDprLadder: boolean;
  /** Recover restrained local contrast after the DPR ladder lowers the
   * framebuffer resolution. Native-resolution frames remain untouched. */
  adaptiveSharpen: boolean;
  /** Independently remove the composer's costly spatial passes. */
  skipAmbientOcclusion: boolean;
  skipBloom: boolean;
  skipDepthOfField: boolean;
  /** Preserve a slow-frame signal observed during travel and apply it once
   * the camera settles, where the durable ladder can react safely. */
  rememberTravelDeclines: boolean;
  /** Split unusually dense meadow culling cells while preserving every
   * authored instance and quality-rung ordering. */
  populationBalancedMeadowTiles: boolean;
  /** Stop per-frame damp calculations for Lift groups already at rest. */
  suspendSettledHoverWork: boolean;
}>;

export const DEFAULT_SCENE_PERFORMANCE_SETTINGS: ScenePerformanceSettings =
  Object.freeze({
    suspendSettledPropWork: true,
    pausePrewarmDuringTravel: true,
    activeNeighborhoodLights: true,
    simplifiedFarMeadow: true,
    placardGlassMode: "native",
    virtualizeUnitWork: true,
    practicalGlowMode: "halo",
    effectiveDprLadder: true,
    adaptiveSharpen: true,
    skipAmbientOcclusion: false,
    skipBloom: false,
    skipDepthOfField: false,
    rememberTravelDeclines: true,
    populationBalancedMeadowTiles: true,
    suspendSettledHoverWork: true,
  });

export function allScenePerformanceSettings(
  enabled: boolean,
): ScenePerformanceSettings {
  return {
    suspendSettledPropWork: enabled,
    pausePrewarmDuringTravel: enabled,
    activeNeighborhoodLights: enabled,
    simplifiedFarMeadow: enabled,
    placardGlassMode: enabled ? "paper" : "native",
    virtualizeUnitWork: enabled,
    practicalGlowMode: enabled ? "aperture" : "sprite",
    effectiveDprLadder: enabled,
    adaptiveSharpen: enabled,
    skipAmbientOcclusion: enabled,
    skipBloom: enabled,
    skipDepthOfField: enabled,
    rememberTravelDeclines: enabled,
    populationBalancedMeadowTiles: enabled,
    suspendSettledHoverWork: enabled,
  };
}

export function scenePerformanceSettingsEqual(
  left: ScenePerformanceSettings,
  right: ScenePerformanceSettings,
) {
  return (Object.keys(left) as Array<keyof ScenePerformanceSettings>).every(
    (key) => Object.is(left[key], right[key]),
  );
}

export type ExpensivePostEffect = "ambientOcclusion" | "bloom" | "depthOfField";

export function postEffectEnabled(
  settings: ScenePerformanceSettings,
  effect: ExpensivePostEffect,
) {
  const setting = {
    ambientOcclusion: settings.skipAmbientOcclusion,
    bloom: settings.skipBloom,
    depthOfField: settings.skipDepthOfField,
  }[effect];
  return !setting;
}

export function practicalGlowSpriteEnabled(settings: ScenePerformanceSettings) {
  return settings.practicalGlowMode === "sprite";
}

export function effectivePlacardGlassMode(
  mode: PlacardGlassMode,
  paperFallback: boolean,
): Exclude<PlacardGlassMode, "auto"> {
  if (mode === "paper" || mode === "native") return mode;
  return paperFallback ? "paper" : "native";
}

export function practicalGlowHaloEnabled(settings: ScenePerformanceSettings) {
  return settings.practicalGlowMode === "halo";
}

/** RCAS is useful only while a finishing composer exists and the scene is
 * actually below the panel's native DPR. The amount rises with the missing
 * resolution but stays below full-strength RCAS to protect foliage and book
 * lettering from halos. */
export function adaptiveSharpenAmount(
  settings: ScenePerformanceSettings,
  renderScale: number,
  postprocessing: "full" | "finish" | "off",
) {
  if (!settings.adaptiveSharpen || postprocessing === "off") return 0;
  const finiteScale = Number.isFinite(renderScale) ? renderScale : 1;
  const deficit = 1 - Math.min(1, Math.max(0, finiteScale));
  if (deficit < 0.04) return 0;
  return Math.min(0.65, deficit * 1.55);
}

export function qualityDeclineDisposition(
  settings: ScenePerformanceSettings,
  moving: boolean,
  forced: boolean,
): "apply" | "queue" | "ignore" {
  if (forced) return "ignore";
  if (!moving) return "apply";
  return settings.rememberTravelDeclines ? "queue" : "ignore";
}

export function meadowTilePopulationLimit(
  settings: ScenePerformanceSettings,
): number | undefined {
  return settings.populationBalancedMeadowTiles ? 800 : undefined;
}

export function unitRealLightsEnabled(
  settings: ScenePerformanceSettings,
  unitIndex: number,
  activeUnit: number,
) {
  return (
    !settings.activeNeighborhoodLights || Math.abs(unitIndex - activeUnit) <= 1
  );
}

export function shouldDeferScenePrewarm(
  settings: ScenePerformanceSettings,
  traveling: boolean,
) {
  return settings.pausePrewarmDuringTravel && traveling;
}

export function farMeadowShaderMode(settings: ScenePerformanceSettings) {
  return settings.simplifiedFarMeadow ? "simplified" : "full";
}

export function shouldSuspendSettledPropFrame({
  settings,
  phase,
  unitIndex,
  activeUnit,
  hovered,
  authoredParked,
  physicsParked,
  atAuthoredPose,
  nodSettled,
}: {
  settings: ScenePerformanceSettings;
  phase: string;
  unitIndex: number;
  activeUnit: number;
  hovered: boolean;
  authoredParked: boolean;
  physicsParked: boolean;
  atAuthoredPose: boolean;
  nodSettled: boolean;
}) {
  return (
    settings.suspendSettledPropWork &&
    phase === "rest" &&
    Math.abs(unitIndex - activeUnit) > 1 &&
    !hovered &&
    !authoredParked &&
    physicsParked &&
    atAuthoredPose &&
    nodSettled
  );
}

class ScenePerformanceController {
  private snapshot = DEFAULT_SCENE_PERFORMANCE_SETTINGS;
  private listeners = new Set<() => void>();
  private overrides = new Set<keyof ScenePerformanceSettings>();

  readonly getSnapshot = () => this.snapshot;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(patch: Partial<ScenePerformanceSettings>) {
    for (const key of Object.keys(patch) as Array<
      keyof ScenePerformanceSettings
    >)
      this.overrides.add(key);
    const next = { ...this.snapshot, ...patch };
    if (
      Object.keys(next).every((key) =>
        Object.is(
          next[key as keyof ScenePerformanceSettings],
          this.snapshot[key as keyof ScenePerformanceSettings],
        ),
      )
    )
      return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  replace(settings: ScenePerformanceSettings) {
    for (const key of Object.keys(settings) as Array<
      keyof ScenePerformanceSettings
    >)
      this.overrides.add(key);
    this.update(settings);
  }

  isOverridden(key: keyof ScenePerformanceSettings) {
    return this.overrides.has(key);
  }

  hasOverrides() {
    return this.overrides.size > 0;
  }

  reset() {
    this.overrides.clear();
    if (this.snapshot === DEFAULT_SCENE_PERFORMANCE_SETTINGS) return;
    this.snapshot = DEFAULT_SCENE_PERFORMANCE_SETTINGS;
    for (const listener of this.listeners) listener();
  }
}

export const scenePerformanceController = new ScenePerformanceController();

export function useScenePerformanceSettings() {
  return useSyncExternalStore(
    scenePerformanceController.subscribe,
    scenePerformanceController.getSnapshot,
    scenePerformanceController.getSnapshot,
  );
}

export function useUnitRealLights(unitIndex: number) {
  const settings = useScenePerformanceSettings();
  const activeUnit = useStacks((state) => state.activeUnit);
  return unitRealLightsEnabled(settings, unitIndex, activeUnit);
}

let sceneTraveling = false;

export function setSceneTraveling(traveling: boolean) {
  sceneTraveling = traveling;
}

export function isSceneTraveling() {
  return sceneTraveling;
}

export function scenePrewarmDeferred() {
  return shouldDeferScenePrewarm(
    scenePerformanceController.getSnapshot(),
    sceneTraveling,
  );
}
