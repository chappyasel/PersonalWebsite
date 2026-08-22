import { markMeadowReady, resetMeadowReady } from "../loading";

import { meadowDiagnosticsController } from "./meadowDiagnostics";
import {
  type ScenePerformanceBooleanSetting,
  type ScenePerformanceSettings,
  scenePerformanceController,
} from "./scenePerformance";

export type SceneDiagnosticsReloadSeed = Partial<
  Pick<
    ScenePerformanceSettings,
    | "postprocessing"
    | "sideTiltShift"
    | "colorGrade"
    | "meadow"
    | "highResolutionPhotos"
    | "skipDepthOfField"
  >
> &
  Readonly<{ grassDeformation?: boolean }>;

export function diagnosticReloadSeedFromSearch(
  search: string | URLSearchParams,
): SceneDiagnosticsReloadSeed {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  return {
    ...(params.has("nopostfx") ? { postprocessing: false } : {}),
    ...(params.has("notiltshift") ? { sideTiltShift: false } : {}),
    ...(params.has("nograde") ? { colorGrade: false } : {}),
    ...(params.has("nomeadow") ? { meadow: false } : {}),
    ...(params.get("hdPhotos") === "0" ? { highResolutionPhotos: false } : {}),
    ...(params.has("nodof") ? { skipDepthOfField: true } : {}),
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

    initialize(search: string | URLSearchParams) {
      if (initialized) return;
      initialized = true;
      const { grassDeformation, ...performance } =
        diagnosticReloadSeedFromSearch(search);
      if (Object.keys(performance).length > 0)
        this.updatePerformance(performance);
      if (grassDeformation === false) dependencies.seedGrassDeformation(false);
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
  markMeadowReady,
  resetMeadowReady,
});

if (typeof window !== "undefined")
  sceneDiagnosticsRuntime.initialize(window.location.search);
