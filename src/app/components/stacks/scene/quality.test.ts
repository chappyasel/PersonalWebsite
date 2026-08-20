import { describe, expect, it } from "vitest";

import {
  AUTO_SCENE_QUALITY_PROFILES,
  QUALITY_DECLINE_COOLDOWN_MS,
  QUALITY_DECLINE_SUSTAIN_MS,
  QUALITY_RECOVERY_COOLDOWN_MS,
  QUALITY_RECOVERY_SUSTAIN_MS,
  QUALITY_SAFETY_FALLBACK_MS,
  QUALITY_TRAVEL_VALIDATION_MS,
  NARROW_VIEWPORT_DPR_CAP_BY_PROFILE,
  SCENE_QUALITY_DEFINITIONS,
  SCENE_QUALITY_PROFILES,
  type SceneQualityAdaptationState,
  type SceneQualityMetrics,
  type SceneQualityProfile,
  bookCoverWidthForNeed,
  deriveRendererCapability,
  initialSceneQualityAdaptationState,
  qualityModeFromSearch,
  qualityProfileFromValue,
  reduceSceneQualityAdaptation,
  resolveSceneQualityPlan,
  sceneQualityStorageBucket,
} from "./quality";

const good: SceneQualityMetrics = {
  targetFrameMs: 16.667,
  targetHz: 60,
  p95: 17,
  droppedFrameRatio: 0.02,
  sampleCount: 120,
};
const slow: SceneQualityMetrics = {
  ...good,
  p95: 22,
  droppedFrameRatio: 0.2,
};
const severe: SceneQualityMetrics = {
  ...good,
  p95: 31,
  droppedFrameRatio: 0.4,
};

function sample(
  state: SceneQualityAdaptationState,
  now: number,
  metrics = good,
  visible = true,
) {
  return reduceSceneQualityAdaptation(state, {
    type: "sample",
    now,
    metrics,
    visible,
  });
}

function plan(profile: SceneQualityProfile, touch = false) {
  return resolveSceneQualityPlan({
    mode: profile,
    profile,
    cssWidth: 1440,
    cssHeight: 900,
    deviceDpr: 3,
    touch,
  });
}

describe("scene quality policy", () => {
  it("derives capability from renderer evidence instead of pointer type", () => {
    expect(
      deriveRendererCapability({
        webglVersion: 1,
        maxTextureSize: 4096,
        maxSamples: 0,
        physicalPixels: 2_000_000,
      }),
    ).toBe("constrained");
    expect(
      deriveRendererCapability({
        webglVersion: 2,
        maxTextureSize: 16384,
        maxSamples: 8,
        physicalPixels: 4_000_000,
      }),
    ).toBe("high");
    expect(
      deriveRendererCapability({
        webglVersion: 2,
        maxTextureSize: 16384,
        maxSamples: 8,
        physicalPixels: 4_000_000,
        observed: {
          p95: 29,
          targetFrameMs: 16.667,
          droppedFrameRatio: 0.3,
          sampleCount: 120,
        },
      }),
    ).toBe("constrained");
  });

  it("chooses cover resolution from projected need and quality", () => {
    expect(bookCoverWidthForNeed(220, "showcase")).toBe(384);
    expect(bookCoverWidthForNeed(120, "showcase")).toBe(256);
    expect(bookCoverWidthForNeed(400, "efficient")).toBe(256);
  });
  it("maps every desktop and touch profile from one centralized table", () => {
    for (const profile of SCENE_QUALITY_PROFILES) {
      const desktop = plan(profile);
      const touch = plan(profile, true);
      const definition = SCENE_QUALITY_DEFINITIONS[profile];
      expect(desktop.pixelBudget).toBe(definition.pixels.desktop);
      expect(touch.pixelBudget).toBe(definition.pixels.touch);
      expect(desktop.dpr).toBeLessThanOrEqual(definition.dprCap);
      expect(touch.dpr).toBeLessThanOrEqual(definition.dprCap);
      expect({
        ...touch.effects,
        multisampling: desktop.effects.multisampling,
      }).toEqual(desktop.effects);
      expect(touch.effects.multisampling).toBe(0);
    }
  });

  it("uses a strict DPR ladder on narrow viewports", () => {
    const input = {
      cssWidth: 390,
      cssHeight: 844,
      deviceDpr: 3,
      touch: true,
      narrowViewport: true,
    } as const;

    for (const profile of AUTO_SCENE_QUALITY_PROFILES) {
      const resolved = resolveSceneQualityPlan({
        ...input,
        mode: profile,
        profile,
      });
      expect(resolved.dpr).toBe(
        NARROW_VIEWPORT_DPR_CAP_BY_PROFILE[profile],
      );
      expect(resolved.dprCap).toBe(
        NARROW_VIEWPORT_DPR_CAP_BY_PROFILE[profile],
      );
    }

    expect(
      resolveSceneQualityPlan({
        ...input,
        mode: "cinematic",
        profile: "cinematic",
      }),
    ).toMatchObject({ dpr: 4, dprCap: 4 });

    expect(
      resolveSceneQualityPlan({
        ...input,
        mode: "safety",
        profile: "safety",
        overrides: { effectiveDprLadder: false },
      }),
    ).toMatchObject({ dpr: 2, dprCap: 2 });
  });

  it("keeps the desktop DPR policy on wide viewports", () => {
    const balanced = resolveSceneQualityPlan({
      mode: "balanced",
      profile: "balanced",
      cssWidth: 1200,
      cssHeight: 400,
      deviceDpr: 3,
      touch: false,
      narrowViewport: false,
    });

    expect(balanced).toMatchObject({ dpr: 2.75, dprCap: 2.75 });
  });

  it("implements the specified environment and finishing profiles", () => {
    expect(AUTO_SCENE_QUALITY_PROFILES).not.toContain("cinematic");
    expect(plan("cinematic")).toMatchObject({
      pixelBudget: 16_600_000,
      effects: {
        composer: "full",
        bloom: true,
        bloomLevels: 10,
        bloomResolutionScale: 1,
        bloomIntensity: { dark: 1.8, light: 0.85 },
        bloomLuminanceThreshold: { dark: 1.05, light: 1.2 },
        ambientOcclusion: true,
        ambientOcclusionHalfRes: false,
        ambientOcclusionQuality: "ultra",
        depthOfField: true,
        depthOfFieldResolutionScale: 1,
        depthOfFieldBokehScale: 2,
        multisampling: 8,
      },
      environment: {
        meadowDensity: 1,
        meadowRung: 3,
        petals: 49,
        dust: true,
        cloudDetail: "full",
        farGrassShader: "full",
        grounding: true,
      },
      butterflies: { wingBlurSamples: 5 },
    });
    expect(plan("showcase").environment).toEqual({
      meadowDensity: 1,
      meadowRung: 3,
      petals: 18,
      dust: true,
      cloudDetail: "full",
      farGrassShader: "full",
      grounding: true,
    });
    expect(plan("showcase").effects).toMatchObject({
      ambientOcclusion: true,
      ambientOcclusionHalfRes: true,
      ambientOcclusionQuality: "medium",
      depthOfField: true,
      depthOfFieldResolutionScale: 0.6,
    });
    expect(plan("balanced").environment.meadowDensity).toBe(1);
    expect(plan("balanced").environment.meadowRung).toBe(3);
    expect(plan("balanced").effects.bloomLevels).toBe(6);
    expect(plan("balanced").effects).toMatchObject({
      ambientOcclusion: true,
      ambientOcclusionHalfRes: true,
      ambientOcclusionQuality: "low",
      depthOfField: true,
      depthOfFieldResolutionScale: 0.5,
    });
    expect(plan("efficient").environment).toMatchObject({
      meadowDensity: 1,
      meadowRung: 3,
      petals: 10,
      dust: false,
      cloudDetail: "simplified",
      farGrassShader: "simplified",
      grounding: true,
    });
    expect(plan("efficient").effects).toMatchObject({
      composer: "full",
      bloom: true,
      bloomLevels: 5,
      ambientOcclusion: false,
      depthOfField: true,
      depthOfFieldResolutionScale: 0.45,
      finishing: true,
    });
    expect(plan("safety")).toMatchObject({
      effects: {
        composer: "finish",
        bloom: true,
        bloomLevels: 4,
        bloomIntensity: { dark: 0.9, light: 0.3 },
        ambientOcclusion: false,
        depthOfField: false,
        finishing: true,
        analyticFixtureHalos: true,
      },
      environment: {
        meadowDensity: 1,
        meadowRung: 3,
        petals: 7,
        dust: false,
        cloudDetail: "simplified",
        farGrassShader: "simplified",
        grounding: false,
      },
      butterflies: { wingBlurSamples: 0 },
      wildlife: { suspendOffscreen: true },
    });
  });

  it("keeps the authored grass population stable across every transition", () => {
    for (const profile of SCENE_QUALITY_PROFILES) {
      expect(plan(profile).environment).toMatchObject({
        meadowDensity: 1,
        meadowRung: 3,
      });
    }
  });

  it("uses full far-grass shading only for Showcase and Cinematic by default", () => {
    expect(plan("cinematic").environment.farGrassShader).toBe("full");
    expect(plan("showcase").environment.farGrassShader).toBe("full");
    expect(plan("balanced").environment.farGrassShader).toBe("simplified");
    expect(plan("efficient").environment.farGrassShader).toBe("simplified");
    expect(plan("safety").environment.farGrassShader).toBe("simplified");

    const overridden = resolveSceneQualityPlan({
      mode: "cinematic",
      profile: "cinematic",
      cssWidth: 1440,
      cssHeight: 900,
      deviceDpr: 2,
      touch: false,
      overrides: { simplifiedFarMeadow: true },
    });
    expect(overridden.environment.farGrassShader).toBe("simplified");
    expect(overridden.customOverrides).toBe(true);
  });

  it("lets manual Cinematic supersample above native DPR without exceeding its capture budget", () => {
    const cinematic = resolveSceneQualityPlan({
      mode: "cinematic",
      profile: "cinematic",
      cssWidth: 1728,
      cssHeight: 1117,
      deviceDpr: 2,
      touch: false,
    });
    expect(cinematic.dpr).toBeGreaterThan(2);
    expect(cinematic.dpr).toBeLessThanOrEqual(3);
    expect(cinematic.physicalPixels).toBeLessThanOrEqual(
      cinematic.pixelBudget + 1,
    );
  });

  it("honors pixel ceilings and lets Safety use sub-1 DPR", () => {
    const safety = resolveSceneQualityPlan({
      mode: "safety",
      profile: "safety",
      cssWidth: 2200,
      cssHeight: 1600,
      deviceDpr: 2,
      touch: false,
    });
    expect(safety.dpr).toBeLessThan(1);
    expect(safety.dpr).toBeGreaterThanOrEqual(0.75);
    expect(safety.physicalPixels).toBeLessThanOrEqual(safety.pixelBudget + 1);
  });

  it("lets Balanced and Efficient honor their budgets below 1 DPR on exceptionally wide viewports", () => {
    const input = {
      cssWidth: 3310,
      cssHeight: 1570,
      deviceDpr: 2,
      touch: false,
    };
    const balanced = resolveSceneQualityPlan({
      ...input,
      mode: "balanced",
      profile: "balanced",
    });
    const efficient = resolveSceneQualityPlan({
      ...input,
      mode: "efficient",
      profile: "efficient",
    });

    expect(balanced.dpr).toBeLessThan(1);
    expect(balanced.dpr).toBeGreaterThanOrEqual(0.85);
    expect(balanced.physicalPixels).toBeLessThanOrEqual(
      balanced.pixelBudget + 1,
    );
    expect(efficient.dpr).toBeLessThan(balanced.dpr);
    expect(efficient.dpr).toBeGreaterThanOrEqual(0.75);
    expect(efficient.physicalPixels).toBeLessThanOrEqual(
      efficient.pixelBudget + 1,
    );
  });

  it("preserves legacy query and debug values", () => {
    expect(qualityModeFromSearch("?quality=0")).toBe("showcase");
    expect(qualityModeFromSearch("?quality=1")).toBe("balanced");
    expect(qualityModeFromSearch("?quality=2")).toBe("efficient");
    expect(qualityModeFromSearch("?quality=3")).toBe("safety");
    expect(qualityModeFromSearch("?quality=cinematic")).toBe("cinematic");
    expect(qualityModeFromSearch("?quality=9")).toBe("auto");
    expect(qualityProfileFromValue(0)).toBe("showcase");
    expect(qualityProfileFromValue("efficient")).toBe("efficient");
    expect(qualityProfileFromValue("cinematic")).toBe("cinematic");
  });

  it("applies advanced overrides after profile defaults", () => {
    const safety = resolveSceneQualityPlan({
      mode: "safety",
      profile: "safety",
      cssWidth: 1440,
      cssHeight: 900,
      deviceDpr: 2,
      touch: false,
      overrides: {
        effectiveDprLadder: false,
        adaptiveSharpen: false,
        skipAmbientOcclusion: false,
        skipDepthOfField: false,
      },
      hasCustomOverrides: true,
    });
    expect(safety.pixelBudget).toBe(5_200_000);
    expect(safety.effects).toMatchObject({
      ambientOcclusion: true,
      depthOfField: true,
      adaptiveSharpen: false,
    });
    expect(safety.customOverrides).toBe(true);
  });

  it("starts unknown devices at Balanced and restores a valid stored value", () => {
    expect(initialSceneQualityAdaptationState().profile).toBe("balanced");
    expect(
      initialSceneQualityAdaptationState(
        qualityProfileFromValue("efficient") ?? "balanced",
        0,
        "restored",
      ),
    ).toMatchObject({ profile: "efficient", transitionReason: "restored" });
    expect(
      sceneQualityStorageBucket({
        capability: "constrained",
        cssWidth: 390,
        cssHeight: 844,
        deviceDpr: 3,
      }),
    ).toBe("stacks-quality:v4:constrained:small");
  });
});

describe("scene quality adaptation", () => {
  it("does not decline on mild p95 pacing jitter without meaningful missed frames", () => {
    const jitter = {
      ...good,
      p95: 21.6,
      droppedFrameRatio: 0.017,
    };
    let state = initialSceneQualityAdaptationState("showcase", 0);
    state = sample(state, state.ignoreUntil, jitter);
    state = sample(
      state,
      state.ignoreUntil + QUALITY_DECLINE_SUSTAIN_MS,
      jitter,
    );
    expect(state.profile).toBe("showcase");
  });

  it("does not replay the captured M5 Showcase-to-Safety jitter ratchet", () => {
    const capturedWindows = [
      { p95: 20.9, droppedFrameRatio: 0.017 },
      { p95: 21.6, droppedFrameRatio: 0.017 },
      { p95: 24.8, droppedFrameRatio: 0.042 },
    ];
    let state = initialSceneQualityAdaptationState("showcase", 0);
    let now = state.ignoreUntil;
    for (const captured of capturedWindows) {
      const metrics = { ...good, ...captured };
      state = sample(state, now, metrics);
      now += QUALITY_DECLINE_SUSTAIN_MS;
      state = sample(state, now, metrics);
      now += QUALITY_DECLINE_COOLDOWN_MS;
    }
    expect(state.profile).toBe("showcase");
  });

  it("declines after sustained pressure and skips two tiers when severe", () => {
    let state = initialSceneQualityAdaptationState("showcase", 0);
    state = sample(state, 1_000, slow);
    state = sample(state, 1_000 + QUALITY_DECLINE_SUSTAIN_MS, slow);
    expect(state.profile).toBe("balanced");

    state = sample(state, state.ignoreUntil, severe);
    state = sample(
      state,
      Math.max(
        state.ignoreUntil + QUALITY_DECLINE_SUSTAIN_MS,
        state.lastTransitionAt + QUALITY_DECLINE_COOLDOWN_MS,
      ),
      severe,
    );
    expect(state.profile).toBe("safety");
    expect(state.transitionReason).toBe("severe-decline");
  });

  it("blocks another decline when the previous downgrade did not improve the signal", () => {
    let state = initialSceneQualityAdaptationState("showcase", 0);
    state = sample(state, state.ignoreUntil, slow);
    state = sample(state, state.ignoreUntil + QUALITY_DECLINE_SUSTAIN_MS, slow);
    expect(state.profile).toBe("balanced");

    state = sample(state, state.ignoreUntil, slow);
    state = sample(
      state,
      Math.max(
        state.ignoreUntil + QUALITY_DECLINE_SUSTAIN_MS,
        state.lastTransitionAt + QUALITY_DECLINE_COOLDOWN_MS,
      ),
      slow,
    );
    expect(state.profile).toBe("balanced");
  });

  it("enforces decline cooldowns", () => {
    let state = initialSceneQualityAdaptationState("showcase", 0);
    state = sample(state, 1_000, slow);
    state = sample(state, 1_000 + QUALITY_DECLINE_SUSTAIN_MS, slow);
    expect(state.profile).toBe("balanced");
    state = sample(state, state.ignoreUntil, slow);
    state = sample(
      state,
      state.lastTransitionAt + QUALITY_DECLINE_COOLDOWN_MS - 1,
      slow,
    );
    expect(state.profile).toBe("balanced");
  });

  it("queues sustained travel pressure and requires settled confirmation", () => {
    let state = initialSceneQualityAdaptationState("showcase", 0);
    state = reduceSceneQualityAdaptation(state, {
      type: "movement",
      moving: true,
      now: 1_000,
    });
    state = sample(state, 1_000, slow);
    state = sample(state, 1_000 + QUALITY_DECLINE_SUSTAIN_MS, severe);
    expect(state.profile).toBe("showcase");
    expect(state.queuedDeclineSteps).toBe(2);
    state = reduceSceneQualityAdaptation(state, {
      type: "movement",
      moving: false,
      now: 3_000,
    });
    expect(state.profile).toBe("showcase");
    state = sample(state, 3_000 + QUALITY_TRAVEL_VALIDATION_MS, severe);
    expect(state.profile).toBe("efficient");
    expect(state.transitionReason).toBe("travel-decline");
  });

  it("does not ratchet Balanced to Safety from transient travel frames", () => {
    let state = initialSceneQualityAdaptationState("balanced", 0);
    state = reduceSceneQualityAdaptation(state, {
      type: "movement",
      moving: true,
      now: 1_100,
    });
    state = sample(state, 1_200, slow);
    expect(state.queuedDeclineSteps).toBe(0);
    state = reduceSceneQualityAdaptation(state, {
      type: "movement",
      moving: false,
      now: 2_000,
    });
    state = reduceSceneQualityAdaptation(state, {
      type: "movement",
      moving: true,
      now: 4_000,
    });
    state = sample(state, 4_100, slow);
    state = reduceSceneQualityAdaptation(state, {
      type: "movement",
      moving: false,
      now: 4_800,
    });
    state = sample(state, 4_800 + QUALITY_TRAVEL_VALIDATION_MS, good);
    expect(state).toMatchObject({
      profile: "balanced",
      queuedDeclineSteps: 0,
    });
  });

  it("disarms sustained travel pressure when the settled window is healthy", () => {
    let state = initialSceneQualityAdaptationState("balanced", 0);
    state = reduceSceneQualityAdaptation(state, {
      type: "movement",
      moving: true,
      now: 1_000,
    });
    state = sample(state, 1_000, slow);
    state = sample(state, 1_000 + QUALITY_DECLINE_SUSTAIN_MS, slow);
    expect(state.queuedDeclineSteps).toBe(1);
    state = reduceSceneQualityAdaptation(state, {
      type: "movement",
      moving: false,
      now: 3_000,
    });
    state = sample(state, 3_000 + QUALITY_TRAVEL_VALIDATION_MS, good);
    expect(state).toMatchObject({
      profile: "balanced",
      queuedDeclineSteps: 0,
    });
  });

  it("recovers repeatedly after sustained headroom with a 20-second cadence", () => {
    let state = initialSceneQualityAdaptationState("safety", 0);
    state = sample(state, 1_000, good);
    state = sample(
      state,
      Math.max(
        1_000 + QUALITY_RECOVERY_SUSTAIN_MS,
        QUALITY_RECOVERY_COOLDOWN_MS,
      ),
      good,
    );
    expect(state.profile).toBe("efficient");
    state = sample(state, state.ignoreUntil, good);
    state = sample(
      state,
      state.lastTransitionAt + QUALITY_RECOVERY_COOLDOWN_MS,
      good,
    );
    expect(state.profile).toBe("balanced");
  });

  it("filters hidden samples and freezes adaptation while retaining metrics", () => {
    let state = initialSceneQualityAdaptationState("balanced", 0);
    const hidden = sample(state, 2_000, severe, false);
    expect(hidden).toBe(state);
    state = reduceSceneQualityAdaptation(state, {
      type: "freeze",
      frozen: true,
    });
    state = sample(state, 2_000, severe);
    state = sample(state, 10_000, severe);
    expect(state.profile).toBe("balanced");
    expect(state.metrics).toEqual(severe);
  });

  it("ignores invalid frame windows", () => {
    const state = initialSceneQualityAdaptationState("balanced", 0);
    expect(sample(state, 2_000, { ...severe, p95: Number.NaN })).toBe(state);
    expect(sample(state, 2_000, { ...severe, sampleCount: 1 })).toBe(state);
  });

  it("enters direct rendering after eight severe Safety seconds and recovers", () => {
    let state = initialSceneQualityAdaptationState("safety", 0);
    state = sample(state, 1_000, severe);
    state = sample(state, 1_000 + QUALITY_SAFETY_FALLBACK_MS, severe);
    expect(state.directRender).toBe(true);
    expect(state.transitionReason).toBe("safety-fallback");
    state = sample(state, 10_000, good);
    state = sample(state, 10_000 + QUALITY_RECOVERY_SUSTAIN_MS, good);
    expect(state.directRender).toBe(false);
    expect(state.profile).toBe("safety");
  });

  it("treats composer failure as direct rendering without losing the scene", () => {
    let state = reduceSceneQualityAdaptation(
      initialSceneQualityAdaptationState("balanced", 0),
      { type: "effects-error", now: 500 },
    );
    expect(state).toMatchObject({
      profile: "balanced",
      directRender: true,
      transitionReason: "effects-error",
    });
    state = sample(state, 1_500, good);
    state = sample(state, 1_500 + QUALITY_RECOVERY_SUSTAIN_MS, good);
    expect(state).toMatchObject({ profile: "balanced", directRender: false });
  });
});
