import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCENE_PERFORMANCE_SETTINGS,
  adaptiveSharpenAmount,
  allScenePerformanceSettings,
  farMeadowShaderMode,
  meadowTilePopulationLimit,
  postEffectEnabled,
  practicalGlowHaloEnabled,
  practicalGlowSpriteEnabled,
  qualityDeclineDisposition,
  scenePerformanceController,
  shouldDeferScenePrewarm,
  shouldSuspendSettledPropFrame,
  unitRealLightsEnabled,
} from "./scenePerformance";

describe("reversible scene performance settings", () => {
  it("ships the chosen performance profile and preserves exact all-on/all-off comparisons", () => {
    expect(DEFAULT_SCENE_PERFORMANCE_SETTINGS).toEqual({
      suspendSettledPropWork: true,
      pausePrewarmDuringTravel: true,
      activeNeighborhoodLights: true,
      simplifiedFarMeadow: true,
      placardGlassMode: "native",
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
    expect(allScenePerformanceSettings(false)).toEqual({
      suspendSettledPropWork: false,
      pausePrewarmDuringTravel: false,
      activeNeighborhoodLights: false,
      simplifiedFarMeadow: false,
      placardGlassMode: "native",
      practicalGlowMode: "sprite",
      effectiveDprLadder: false,
      adaptiveSharpen: false,
      skipAmbientOcclusion: false,
      skipBloom: false,
      skipDepthOfField: false,
      rememberTravelDeclines: false,
      populationBalancedMeadowTiles: false,
      suspendSettledHoverWork: false,
    });
    expect(allScenePerformanceSettings(true).practicalGlowMode).toBe(
      "aperture",
    );
  });

  it("ships native live placard blur while retaining explicit comparison modes", () => {
    expect(DEFAULT_SCENE_PERFORMANCE_SETTINGS.placardGlassMode).toBe("native");
    expect(allScenePerformanceSettings(true).placardGlassMode).toBe("sampled");
    expect(allScenePerformanceSettings(false).placardGlassMode).toBe("native");
  });

  it("defaults practical lamps to analytic halos while retaining both comparisons", () => {
    expect(practicalGlowHaloEnabled(DEFAULT_SCENE_PERFORMANCE_SETTINGS)).toBe(
      true,
    );
    expect(practicalGlowSpriteEnabled(DEFAULT_SCENE_PERFORMANCE_SETTINGS)).toBe(
      false,
    );
    expect(
      practicalGlowHaloEnabled({
        ...DEFAULT_SCENE_PERFORMANCE_SETTINGS,
        practicalGlowMode: "aperture",
      }),
    ).toBe(false);
    expect(
      practicalGlowSpriteEnabled({
        ...DEFAULT_SCENE_PERFORMANCE_SETTINGS,
        practicalGlowMode: "sprite",
      }),
    ).toBe(true);
  });

  it("keeps real lights on the active unit and immediate neighbours only", () => {
    const optimized = DEFAULT_SCENE_PERFORMANCE_SETTINGS;
    expect(unitRealLightsEnabled(optimized, 2, 3)).toBe(true);
    expect(unitRealLightsEnabled(optimized, 3, 3)).toBe(true);
    expect(unitRealLightsEnabled(optimized, 4, 3)).toBe(true);
    expect(unitRealLightsEnabled(optimized, 1, 3)).toBe(false);
    expect(
      unitRealLightsEnabled(
        { ...optimized, activeNeighborhoodLights: false },
        0,
        6,
      ),
    ).toBe(true);
  });

  it("defers prewarming only while both travel and its optimization are active", () => {
    const optimized = DEFAULT_SCENE_PERFORMANCE_SETTINGS;
    expect(shouldDeferScenePrewarm(optimized, true)).toBe(true);
    expect(shouldDeferScenePrewarm(optimized, false)).toBe(false);
    expect(
      shouldDeferScenePrewarm(
        { ...optimized, pausePrewarmDuringTravel: false },
        true,
      ),
    ).toBe(false);
  });

  it("suspends only fully idle props outside the active neighbourhood", () => {
    const idle = {
      settings: DEFAULT_SCENE_PERFORMANCE_SETTINGS,
      phase: "rest",
      unitIndex: 0,
      activeUnit: 3,
      hovered: false,
      authoredParked: false,
      physicsParked: true,
      atAuthoredPose: true,
      nodSettled: true,
    } as const;
    expect(shouldSuspendSettledPropFrame(idle)).toBe(true);
    expect(shouldSuspendSettledPropFrame({ ...idle, unitIndex: 2 })).toBe(
      false,
    );
    expect(shouldSuspendSettledPropFrame({ ...idle, hovered: true })).toBe(
      false,
    );
    expect(shouldSuspendSettledPropFrame({ ...idle, phase: "sim" })).toBe(
      false,
    );
    expect(
      shouldSuspendSettledPropFrame({ ...idle, authoredParked: true }),
    ).toBe(false);
    expect(
      shouldSuspendSettledPropFrame({ ...idle, physicsParked: false }),
    ).toBe(false);
    expect(
      shouldSuspendSettledPropFrame({ ...idle, atAuthoredPose: false }),
    ).toBe(false);
  });

  it("switches only the far meadow between full and simplified shader modes", () => {
    const optimized = DEFAULT_SCENE_PERFORMANCE_SETTINGS;
    expect(farMeadowShaderMode(optimized)).toBe("simplified");
    expect(
      farMeadowShaderMode({ ...optimized, simplifiedFarMeadow: false }),
    ).toBe("full");
  });

  it("isolates every expensive post effect independently", () => {
    const optimized = DEFAULT_SCENE_PERFORMANCE_SETTINGS;
    expect(postEffectEnabled(optimized, "ambientOcclusion")).toBe(true);
    expect(postEffectEnabled(optimized, "bloom")).toBe(true);
    expect(postEffectEnabled(optimized, "depthOfField")).toBe(true);
    expect(postEffectEnabled({ ...optimized, skipBloom: true }, "bloom")).toBe(
      false,
    );
  });

  it("adds restrained sharpening only when a mounted composer is below native DPR", () => {
    const optimized = DEFAULT_SCENE_PERFORMANCE_SETTINGS;
    expect(adaptiveSharpenAmount(optimized, 1, "full")).toBe(0);
    expect(adaptiveSharpenAmount(optimized, 0.9, "finish")).toBeCloseTo(0.155);
    expect(adaptiveSharpenAmount(optimized, 0.5, "full")).toBe(0.65);
    expect(adaptiveSharpenAmount(optimized, 0.5, "off")).toBe(0);
    expect(
      adaptiveSharpenAmount(
        { ...optimized, adaptiveSharpen: false },
        0.5,
        "finish",
      ),
    ).toBe(0);
  });

  it("queues travel-only declines only when the reversible optimization is on", () => {
    const optimized = DEFAULT_SCENE_PERFORMANCE_SETTINGS;
    expect(qualityDeclineDisposition(optimized, true, false)).toBe("queue");
    expect(qualityDeclineDisposition(optimized, false, false)).toBe("apply");
    expect(qualityDeclineDisposition(optimized, true, true)).toBe("ignore");
    expect(
      qualityDeclineDisposition(
        { ...optimized, rememberTravelDeclines: false },
        true,
        false,
      ),
    ).toBe("ignore");
  });

  it("caps dense meadow tiles only while population balancing is enabled", () => {
    const optimized = DEFAULT_SCENE_PERFORMANCE_SETTINGS;
    expect(meadowTilePopulationLimit(optimized)).toBe(800);
    expect(
      meadowTilePopulationLimit({
        ...optimized,
        populationBalancedMeadowTiles: false,
      }),
    ).toBeUndefined();
  });

  it("notifies subscribers and can restore optimized defaults", () => {
    scenePerformanceController.reset();
    let notifications = 0;
    const unsubscribe = scenePerformanceController.subscribe(() => {
      notifications += 1;
    });
    scenePerformanceController.update({ simplifiedFarMeadow: false });
    expect(scenePerformanceController.hasOverrides()).toBe(true);
    expect(scenePerformanceController.getSnapshot().simplifiedFarMeadow).toBe(
      false,
    );
    scenePerformanceController.reset();
    expect(scenePerformanceController.getSnapshot()).toEqual(
      DEFAULT_SCENE_PERFORMANCE_SETTINGS,
    );
    expect(scenePerformanceController.hasOverrides()).toBe(false);
    expect(notifications).toBe(2);
    unsubscribe();
  });
});
