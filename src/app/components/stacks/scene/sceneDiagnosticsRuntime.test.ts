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
  const quality = {
    mode: "auto" as string,
    frozen: false,
    ceiling: null as number | null,
    profile: null as string | null,
    modeUpdates: 0,
  };
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
    setQualityMode: (mode) => {
      quality.mode = mode;
      quality.modeUpdates += 1;
    },
    setFrozen: (frozen) => {
      quality.frozen = frozen;
    },
    setResolutionCeiling: (dpr) => {
      quality.ceiling = dpr;
    },
    setActiveProfile: (id) => {
      quality.profile = id;
    },
  });
  return {
    runtime,
    quality,
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
  it("parses optional-render switches, boot residency, and grass rollback", () => {
    expect(
      diagnosticReloadSeedFromSearch(
        "?nopostfx&nodof&notiltshift&nograde&nomeadow&hdPhotos=0&prewarmAll=0&grassDeformation=off",
      ),
    ).toEqual({
      postprocessing: false,
      skipDepthOfField: true,
      sideTiltShift: false,
      colorGrade: false,
      meadow: false,
      highResolutionPhotos: false,
      prewarmAllUnitVisuals: false,
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
      setQualityMode: () => undefined,
      setFrozen: () => undefined,
      setResolutionCeiling: () => undefined,
      setActiveProfile: () => undefined,
    });

    runtime.updatePerformanceBoolean("meadow", true);
    expect(mark).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it("seeds a named profile under the explicit switches", () => {
    expect(diagnosticReloadSeedFromSearch("?perf-profile=light-boot")).toEqual({
      prewarmAllUnitVisuals: false,
      highResolutionPhotos: false,
    });
    expect(
      diagnosticReloadSeedFromSearch("?perf-profile=light-boot&nopostfx"),
    ).toEqual({
      prewarmAllUnitVisuals: false,
      highResolutionPhotos: false,
      postprocessing: false,
    });
    expect(
      diagnosticReloadSeedFromSearch("?perf-profile=unknown-device"),
    ).toEqual({});
  });

  it("seeds the constrained control as one reload-time bundle", () => {
    expect(diagnosticReloadSeedFromSearch("?perf-profile=constrained")).toEqual(
      {
        postprocessing: false,
        prewarmAllUnitVisuals: false,
        highResolutionPhotos: false,
        meadow: false,
      },
    );
    const harness = runtimeHarness();
    harness.runtime.initialize("?perf-profile=constrained");
    expect(harness.settings()).toMatchObject({
      postprocessing: false,
      prewarmAllUnitVisuals: false,
      highResolutionPhotos: false,
      meadow: false,
    });
    // Unmounting the meadow at seed time must release the boot gate it owns.
    expect(harness.meadowReady()).toBe(true);
    expect(harness.quality).toMatchObject({
      ceiling: 1,
      frozen: false,
      profile: "constrained",
      modeUpdates: 0,
    });
  });

  it("applies a URL profile's ceiling and freeze at reload without touching the mode", () => {
    const harness = runtimeHarness();
    harness.runtime.initialize("?perf-profile=low-dpr");
    expect(harness.quality).toMatchObject({
      ceiling: 1,
      frozen: true,
      profile: "low-dpr",
      modeUpdates: 0,
    });

    const plain = runtimeHarness();
    plain.runtime.initialize("?hud=1");
    expect(plain.quality).toMatchObject({
      ceiling: null,
      frozen: false,
      profile: null,
    });
  });

  it("switches profiles live and returns the previous profile's settings to default", () => {
    const harness = runtimeHarness();
    harness.runtime.applyProfile("no-composer");
    expect(harness.settings().postprocessing).toBe(false);
    expect(harness.quality).toMatchObject({
      mode: "auto",
      frozen: true,
      ceiling: null,
      profile: "no-composer",
    });

    harness.runtime.applyProfile("retina-stress");
    expect(harness.settings().postprocessing).toBe(true);
    expect(harness.quality).toMatchObject({
      mode: "showcase",
      frozen: false,
      ceiling: 3,
      profile: "retina-stress",
    });

    harness.runtime.applyProfile("light-boot");
    expect(harness.settings()).toMatchObject({
      postprocessing: true,
      prewarmAllUnitVisuals: false,
      highResolutionPhotos: false,
    });

    harness.runtime.applyProfile(null);
    expect(harness.settings()).toEqual(DEFAULT_SCENE_PERFORMANCE_SETTINGS);
    expect(harness.quality).toMatchObject({
      mode: "auto",
      frozen: false,
      ceiling: null,
      profile: null,
    });
    // Only the keys that actually changed were patched each time.
    expect(harness.updates).toEqual([
      { postprocessing: false },
      { postprocessing: true },
      { prewarmAllUnitVisuals: false, highResolutionPhotos: false },
      { prewarmAllUnitVisuals: true, highResolutionPhotos: true },
    ]);
  });
});
