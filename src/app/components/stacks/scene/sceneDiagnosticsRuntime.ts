import { worldBoot } from "../boot/worldBootSession";

import { meadowDiagnosticsController } from "./meadowDiagnostics";
import {
  PERFORMANCE_PROFILES,
  PERFORMANCE_PROFILE_SETTING_KEYS,
  type PerformanceProfileId,
  performanceProfileController,
  performanceProfileFromSearch,
} from "./performanceProfiles";
import type { SceneQualityMode } from "./quality";
import {
  DEFAULT_SCENE_PERFORMANCE_SETTINGS,
  type ScenePerformanceBooleanSetting,
  type ScenePerformanceSettings,
  scenePerformanceController,
} from "./scenePerformance";
import { sceneQualityController } from "./sceneQualityController";

export type SceneDiagnosticsReloadSeed = Partial<
  Pick<
    ScenePerformanceSettings,
    | "postprocessing"
    | "sideTiltShift"
    | "colorGrade"
    | "meadow"
    | "highResolutionPhotos"
    | "prewarmAllUnitVisuals"
    | "skipDepthOfField"
  >
> &
  Readonly<{ grassDeformation?: boolean }>;

/** A named profile seeds first; the individual switches are merged on top so
 * `?perf-profile=light-boot&nopostfx` means the profile plus that switch. */
export function diagnosticReloadSeedFromSearch(
  search: string | URLSearchParams,
): SceneDiagnosticsReloadSeed {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  return {
    ...performanceProfileFromSearch(params)?.performance,
    ...(params.has("nopostfx") ? { postprocessing: false } : {}),
    ...(params.has("notiltshift") ? { sideTiltShift: false } : {}),
    ...(params.has("nograde") ? { colorGrade: false } : {}),
    ...(params.has("nomeadow") ? { meadow: false } : {}),
    ...(params.get("hdPhotos") === "0" ? { highResolutionPhotos: false } : {}),
    ...(params.get("prewarmAll") === "0"
      ? { prewarmAllUnitVisuals: false }
      : {}),
    ...(params.has("nodof") ? { skipDepthOfField: true } : {}),
    ...(params.has("noaotransparency")
      ? { ambientOcclusionTransparency: false }
      : {}),
    ...(params.has("nocomposerclear") ? { composerAutoClear: false } : {}),
    ...(params.get("grassDeformation") === "off"
      ? { grassDeformation: false }
      : {}),
  };
}

type SceneDiagnosticsRuntimeDependencies = Readonly<{
  getPerformance: () => ScenePerformanceSettings;
  updatePerformance: (patch: Partial<ScenePerformanceSettings>) => void;
  updatePerformanceBoolean: (
    key: ScenePerformanceBooleanSetting,
    value: boolean,
  ) => void;
  seedGrassDeformation: (enabled: boolean) => void;
  markMeadowReady: () => void;
  resetMeadowReady: () => void;
  setQualityMode: (mode: SceneQualityMode) => void;
  setFrozen: (frozen: boolean) => void;
  setResolutionCeiling: (dpr: number | null) => void;
  setActiveProfile: (id: PerformanceProfileId | null) => void;
}>;

export function createSceneDiagnosticsRuntime(
  dependencies: SceneDiagnosticsRuntimeDependencies,
) {
  let initialized = false;

  const prepareMeadowReadiness = (next: boolean) => {
    if (dependencies.getPerformance().meadow === next) return;
    if (next) dependencies.resetMeadowReady();
    else dependencies.markMeadowReady();
  };

  return Object.freeze({
    updatePerformance(patch: Partial<ScenePerformanceSettings>) {
      if (patch.meadow !== undefined) prepareMeadowReadiness(patch.meadow);
      dependencies.updatePerformance(patch);
    },

    updatePerformanceBoolean(
      key: ScenePerformanceBooleanSetting,
      value: boolean,
    ) {
      if (key === "meadow") prepareMeadowReadiness(value);
      dependencies.updatePerformanceBoolean(key, value);
    },

    /** Put the scene under one named profile, or none, without a reload.
     * Settings any profile owns return to their defaults first, so switching
     * from `no-composer` to `floor` brings the composer back. The quality mode
     * is set here as well; at reload time the canvas reads it from the URL
     * instead, so the profile's forced preset shapes the opening axes rather
     * than arriving as a later force. */
    applyProfile(
      id: PerformanceProfileId | null,
      options?: { quality?: boolean },
    ) {
      const definition = id === null ? null : PERFORMANCE_PROFILES[id];
      const current = dependencies.getPerformance();
      const patch: Partial<ScenePerformanceSettings> = {};
      for (const key of PERFORMANCE_PROFILE_SETTING_KEYS) {
        const target =
          definition?.performance[key] ??
          DEFAULT_SCENE_PERFORMANCE_SETTINGS[key];
        if (!Object.is(current[key], target))
          (patch as Record<string, unknown>)[key] = target;
      }
      if (Object.keys(patch).length > 0) this.updatePerformance(patch);
      dependencies.setResolutionCeiling(definition?.resolutionCeiling ?? null);
      dependencies.setFrozen(definition?.freezeAuto ?? false);
      if (options?.quality !== false)
        dependencies.setQualityMode(definition?.quality ?? "auto");
      dependencies.setActiveProfile(id);
    },

    initialize(search: string | URLSearchParams) {
      if (initialized) return;
      initialized = true;
      const { grassDeformation, ...performance } =
        diagnosticReloadSeedFromSearch(search);
      if (Object.keys(performance).length > 0)
        this.updatePerformance(performance);
      if (grassDeformation === false) dependencies.seedGrassDeformation(false);
      const profile = performanceProfileFromSearch(search);
      if (profile) {
        // The performance seed above already carried the profile's settings
        // merged under any explicit switch. Only the quality-controller half
        // is applied here; the mode comes from the URL via the canvas.
        dependencies.setResolutionCeiling(profile.resolutionCeiling);
        dependencies.setFrozen(profile.freezeAuto);
        dependencies.setActiveProfile(profile.id);
      }
    },
  });
}

export const sceneDiagnosticsRuntime = createSceneDiagnosticsRuntime({
  getPerformance: scenePerformanceController.getSnapshot,
  updatePerformance: (patch) => scenePerformanceController.update(patch),
  updatePerformanceBoolean: (key, value) =>
    scenePerformanceController.updateBoolean(key, value),
  seedGrassDeformation: (enabled) =>
    meadowDiagnosticsController.seed({ deformationEnabled: enabled }),
  markMeadowReady: () => worldBoot.scope().send({ type: "meadowReady" }),
  resetMeadowReady: () => worldBoot.scope().send({ type: "meadowPending" }),
  setQualityMode: (mode) => sceneQualityController.setMode(mode),
  setFrozen: (frozen) => sceneQualityController.setFrozen(frozen),
  setResolutionCeiling: (dpr) =>
    sceneQualityController.setResolutionCeiling(dpr),
  setActiveProfile: (id) => performanceProfileController.set(id),
});

if (typeof window !== "undefined")
  sceneDiagnosticsRuntime.initialize(window.location.search);
