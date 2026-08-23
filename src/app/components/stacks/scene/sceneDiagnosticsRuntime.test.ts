import { describe, expect, it, vi } from "vitest";

import {
  createSceneDiagnosticsRuntime,
  diagnosticReloadSeedFromSearch,
} from "./sceneDiagnosticsRuntime";
import {
  DEFAULT_SCENE_PERFORMANCE_SETTINGS,
  type ScenePerformanceSettings,
} from "./scenePerformance";

function runtimeHarness() {
  let settings = DEFAULT_SCENE_PERFORMANCE_SETTINGS;
  let meadowReady = false;
  const updates: Partial<ScenePerformanceSettings>[] = [];
  const booleanUpdates: Array<readonly [string, boolean]> = [];
  const deformationSeeds: boolean[] = [];
  const readinessAtUpdate: boolean[] = [];
  const runtime = createSceneDiagnosticsRuntime({
    getPerformance: () => settings,
    updatePerformance: (patch) => {
      readinessAtUpdate.push(meadowReady);
      updates.push(patch);
      settings = { ...settings, ...patch };
    },
    updatePerformanceBoolean: (key, value) => {
      readinessAtUpdate.push(meadowReady);
      booleanUpdates.push([key, value]);
      settings = { ...settings, [key]: value };
    },
    seedGrassDeformation: (enabled) => deformationSeeds.push(enabled),
    markMeadowReady: () => {
      meadowReady = true;
    },
    resetMeadowReady: () => {
      meadowReady = false;
    },
  });
  return {
    runtime,
    settings: () => settings,
    meadowReady: () => meadowReady,
    setMeadowReady: (ready: boolean) => {
      meadowReady = ready;
    },
    updates,
    booleanUpdates,
    deformationSeeds,
    readinessAtUpdate,
  };
}

describe("Scene Diagnostics runtime seeds", () => {
  it("parses the six optional-render switches and grass rollback", () => {
    expect(
      diagnosticReloadSeedFromSearch(
        "?nopostfx&nodof&notiltshift&nograde&nomeadow&hdPhotos=0&grassDeformation=off",
      ),
    ).toEqual({
      postprocessing: false,
      skipDepthOfField: true,
      sideTiltShift: false,
      colorGrade: false,
      meadow: false,
      highResolutionPhotos: false,
      grassDeformation: false,
    });
    expect(diagnosticReloadSeedFromSearch("?hdPhotos=1")).toEqual({});
  });

  it("applies only the first reload seed and lets later live updates win", () => {
    const harness = runtimeHarness();
    harness.runtime.initialize("?nomeadow&nodof&grassDeformation=off");
    expect(harness.settings()).toMatchObject({
      meadow: false,
      skipDepthOfField: true,
    });
    expect(harness.deformationSeeds).toEqual([false]);

    harness.runtime.updatePerformanceBoolean("meadow", true);
    harness.runtime.initialize("?nomeadow");

    expect(harness.settings().meadow).toBe(true);
    expect(harness.booleanUpdates).toEqual([["meadow", true]]);
    expect(harness.updates).toHaveLength(1);
    expect(harness.deformationSeeds).toEqual([false]);
  });

  it("clears readiness before an off-to-on meadow update", () => {
    const harness = runtimeHarness();
    harness.runtime.updatePerformanceBoolean("meadow", false);
    expect(harness.meadowReady()).toBe(true);
    expect(harness.readinessAtUpdate).toEqual([true]);

    harness.setMeadowReady(true);
    harness.runtime.updatePerformanceBoolean("meadow", true);

    expect(harness.meadowReady()).toBe(false);
    expect(harness.readinessAtUpdate).toEqual([true, false]);
  });

  it("does not touch readiness when the meadow value is unchanged", () => {
    const harness = runtimeHarness();
    harness.setMeadowReady(true);
    const mark = vi.fn();
    const reset = vi.fn();
    const runtime = createSceneDiagnosticsRuntime({
      getPerformance: harness.settings,
      updatePerformance: () => undefined,
      updatePerformanceBoolean: () => undefined,
      seedGrassDeformation: () => undefined,
      markMeadowReady: mark,
      resetMeadowReady: reset,
    });

    runtime.updatePerformanceBoolean("meadow", true);
    expect(mark).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });
});
