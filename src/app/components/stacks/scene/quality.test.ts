import { describe, expect, it } from "vitest";

import {
  AUTO_SCENE_QUALITY_PROFILES,
  CONTENT_TIER_BY_PROFILE,
  DEFAULT_GRASS_DEFORMATION_ENABLED,
  NARROW_VIEWPORT_DPR_CAP_BY_PROFILE,
  QUALITY_CPU_BOUND_MS,
  QUALITY_DECLINE_COOLDOWN_MS,
  QUALITY_DECLINE_SUSTAIN_MS,
  QUALITY_IGNORE_AFTER_TRANSITION_MS,
  QUALITY_RECOVERY_SUSTAIN_MS,
  QUALITY_SAFETY_FALLBACK_MS,
  QUALITY_SAMPLE_INTERVAL_MS,
  QUALITY_TRAVEL_VALIDATION_MS,
  SAFETY_BUDGET,
  SCENE_CONTENT_DEFINITIONS,
  SCENE_FRAME_BUDGET_HZ,
  SCENE_FRAME_BUDGET_MS,
  SCENE_QUALITY_DEFINITIONS,
  SCENE_QUALITY_PROFILES,
  SCENE_RESOLUTION_SCALE_FLOOR,
  type SceneFrameSample,
  type SceneQualityAdaptationState,
  type SceneQualityMetrics,
  type SceneQualityProfile,
  bookCoverWidthForNeed,
  classifySceneFrameConstraint,
  deriveRendererCapability,
  initialSceneQualityAdaptationState,
  qualityModeFromSearch,
  qualityProfileFromValue,
  reduceSceneQualityAdaptation,
  rendererLooksWeak,
  resolveSceneQualityPlan,
  sceneQualityStorageBucket,
  startingProfileForDevice,
  summariseSceneFrameWindow,
} from "./quality";
import {
  SCENE_RESOLUTION_MAX_STEP,
  initialSceneQualityAxisState,
  reduceSceneQualityAxes,
} from "./qualityAxes";

const good: SceneQualityMetrics = {
  targetFrameMs: 16.667,
  targetHz: 60,
  p95: 17,
  droppedFrameRatio: 0.02,
  sampleCount: 120,
  cpuMs: 6,
  gpuMs: null,
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
        depthOfFieldBokehScale: desktop.effects.depthOfFieldBokehScale,
      }).toEqual(desktop.effects);
      expect(touch.effects.multisampling).toBe(0);
      expect(touch.effects.depthOfFieldBokehScale / touch.dpr).toBeCloseTo(
        desktop.effects.depthOfFieldBokehScale / desktop.dpr,
        4,
      );
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
      expect(resolved.dpr).toBe(NARROW_VIEWPORT_DPR_CAP_BY_PROFILE[profile]);
      expect(resolved.dprCap).toBe(NARROW_VIEWPORT_DPR_CAP_BY_PROFILE[profile]);
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
    ).toMatchObject({
      // Turning the profile ladder off means "use showcase's DPR policy",
      // so this follows showcase rather than pinning a number of its own.
      dpr: NARROW_VIEWPORT_DPR_CAP_BY_PROFILE.showcase,
      dprCap: NARROW_VIEWPORT_DPR_CAP_BY_PROFILE.showcase,
    });
  });

  // The point of raising showcase's narrow cap: a 3x phone that earns the top
  // of the ladder should render at the resolution its screen actually has.
  it("lets a 3x phone reach its real resolution at the top of the ladder", () => {
    const resolved = resolveSceneQualityPlan({
      mode: "showcase",
      profile: "showcase",
      cssWidth: 393,
      cssHeight: 852,
      deviceDpr: 3,
      touch: true,
      narrowViewport: true,
    });
    expect(resolved.dpr).toBe(3);
  });

  // ...but the pixel budget, not a fixed number, is what holds it back. A
  // physically larger phone has more CSS pixels to cover at the same budget,
  // so it lands lower on its own without the smaller one being punished for
  // it. This is why the fixed cap was the wrong instrument.
  it("still holds a larger phone below 3x, on the pixel budget alone", () => {
    const big = resolveSceneQualityPlan({
      mode: "showcase",
      profile: "showcase",
      cssWidth: 430,
      cssHeight: 932,
      deviceDpr: 3,
      touch: true,
      narrowViewport: true,
    });
    expect(big.dpr).toBeLessThan(3);
    expect(big.dpr).toBeGreaterThan(2.5);
    expect(big.dpr * big.dpr * 430 * 932).toBeLessThanOrEqual(big.pixelBudget);
  });

  // The lower rungs keep their reductions: caution belongs in what a device
  // must demonstrate before climbing, not in an unreachable ceiling.
  it("keeps the lower rungs reduced on narrow viewports", () => {
    for (const profile of ["balanced", "efficient", "safety"] as const) {
      expect(NARROW_VIEWPORT_DPR_CAP_BY_PROFILE[profile]).toBeLessThan(
        NARROW_VIEWPORT_DPR_CAP_BY_PROFILE.showcase,
      );
    }
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
    const cinematic = plan("cinematic");
    expect(cinematic).toMatchObject({
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
        multisampling: 8,
      },
      environment: {
        meadowDensity: 1,
        meadowRung: 3,
        contentTier: "full",
        petals: 196,
        dust: true,
        cloudDetail: "full",
        farGrassShader: "full",
        grassDeformation: "off",
        grounding: true,
      },
      butterflies: { wingBlurSamples: 5 },
    });
    expect(
      cinematic.effects.depthOfFieldBokehScale / cinematic.dpr,
    ).toBeCloseTo(1.1875, 8);
    expect(plan("showcase").environment).toEqual({
      meadowDensity: 1,
      meadowRung: 3,
      contentTier: "full",
      petals: 84,
      dust: true,
      cloudDetail: "full",
      farGrassShader: "full",
      grassDeformation: "off",
      grounding: true,
    });
    expect(plan("showcase").effects).toMatchObject({
      ambientOcclusion: true,
      ambientOcclusionHalfRes: true,
      ambientOcclusionQuality: "medium",
      depthOfField: true,
      depthOfFieldResolutionScale: 0.5,
    });
    expect(plan("balanced").environment.meadowDensity).toBe(1);
    expect(plan("balanced").environment.meadowRung).toBe(3);
    expect(plan("balanced").environment.petals).toBe(70);
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
      petals: 42,
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
        petals: 21,
        dust: false,
        cloudDetail: "simplified",
        farGrassShader: "simplified",
        grounding: false,
      },
      butterflies: { wingBlurSamples: 0 },
      wildlife: { suspendOffscreen: true },
    });
  });

  it("tunes DoF strength for presentation without changing its buffer budget", () => {
    const portrait = resolveSceneQualityPlan({
      mode: "efficient",
      profile: "efficient",
      cssWidth: 390,
      cssHeight: 844,
      deviceDpr: 3,
      touch: true,
      narrowViewport: true,
    });
    const shortLandscape = resolveSceneQualityPlan({
      mode: "efficient",
      profile: "efficient",
      cssWidth: 844,
      cssHeight: 390,
      deviceDpr: 3,
      touch: true,
      narrowViewport: true,
    });
    const wide = resolveSceneQualityPlan({
      mode: "showcase",
      profile: "showcase",
      cssWidth: 1440,
      cssHeight: 900,
      deviceDpr: 2,
      touch: false,
    });

    expect(portrait.effects).toMatchObject({
      depthOfFieldResolutionScale: 0.45,
    });
    expect(portrait.effects.depthOfFieldBokehScale / portrait.dpr).toBeCloseTo(
      0.575,
      8,
    );
    expect(
      shortLandscape.effects.depthOfFieldBokehScale / shortLandscape.dpr,
    ).toBeCloseTo(0.7, 8);
    expect(wide.effects).toMatchObject({
      depthOfFieldResolutionScale: 0.5,
    });
    expect(wide.effects.depthOfFieldBokehScale).toBeCloseTo(2.85, 8);
  });

  it("keeps the DoF footprint constant while the render scale moves", () => {
    const plans = [0, 5, SCENE_RESOLUTION_MAX_STEP].map((resolutionStep) =>
      resolveSceneQualityPlan({
        mode: "auto",
        profile: "showcase",
        contentTier: "full",
        effectsTier: "full",
        resolutionStep,
        cssWidth: 1440,
        cssHeight: 900,
        deviceDpr: 2,
        touch: false,
        narrowViewport: false,
      }),
    );
    const cssBokehScale = plans.map(
      (resolved) => resolved.effects.depthOfFieldBokehScale / resolved.dpr,
    );

    for (const scale of cssBokehScale.slice(1)) {
      expect(scale).toBeCloseTo(cssBokehScale[0]!, 4);
    }
  });

  it("uses the same DoF compensation for supersampled captures", () => {
    const capture = resolveSceneQualityPlan({
      mode: "cinematic",
      profile: "cinematic",
      resolutionCeiling: 4,
      cssWidth: 1200,
      cssHeight: 630,
      deviceDpr: 4 / 3,
      touch: false,
      narrowViewport: false,
    });

    expect(capture.dpr).toBe(4);
    expect(capture.effects.depthOfFieldBokehScale).toBe(4.75);
    expect(capture.effects.depthOfFieldBokehScale / capture.dpr).toBe(1.1875);
  });

  it("applies live DoF tuning after presentation and DPR compensation", () => {
    const tuned = resolveSceneQualityPlan({
      mode: "showcase",
      profile: "showcase",
      cssWidth: 1440,
      cssHeight: 900,
      deviceDpr: 2,
      touch: false,
      narrowViewport: false,
      overrides: {
        depthOfFieldBokehMultiplier: 1.5,
        depthOfFieldResolutionScale: 0.8,
      },
    });

    expect(tuned.effects.depthOfFieldBokehScale).toBeCloseTo(4.275, 8);
    expect(tuned.effects.depthOfFieldResolutionScale).toBe(0.8);
    expect(tuned.customOverrides).toBe(true);
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

  it("keeps persistent grass deformation dormant across every quality tier", () => {
    expect(DEFAULT_GRASS_DEFORMATION_ENABLED).toBe(false);
    expect(plan("cinematic").environment.grassDeformation).toBe("off");
    expect(plan("showcase").environment.grassDeformation).toBe("off");
    expect(plan("efficient").environment.grassDeformation).toBe("off");
    expect(plan("safety").environment.grassDeformation).toBe("off");
    expect(
      resolveSceneQualityPlan({
        mode: "auto",
        profile: "showcase",
        contentTier: "reduced",
        cssWidth: 1200,
        cssHeight: 800,
        deviceDpr: 2,
        touch: false,
      }).environment.grassDeformation,
    ).toBe("off");
    expect(
      resolveSceneQualityPlan({
        mode: "auto",
        profile: "showcase",
        contentTier: "minimal",
        cssWidth: 1200,
        cssHeight: 800,
        deviceDpr: 2,
        touch: false,
      }).environment.grassDeformation,
    ).toBe("off");
    expect(
      resolveSceneQualityPlan({
        mode: "showcase",
        profile: "showcase",
        cssWidth: 1200,
        cssHeight: 800,
        deviceDpr: 2,
        touch: false,
        grassDeformationOff: true,
      }).environment.grassDeformation,
    ).toBe("off");
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
    ).toBe("stacks-quality:v9:constrained:small");
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

  // ADR #19 moved runtime adaptation to the three axes. The profile is now a
  // cold-start estimate and a manual override, and these guard the seam: the
  // ladder ran alongside the axes for a while, on its own thresholds, and the
  // two contradicted each other in the overlay — `safety` next to full
  // effects and full geometry, because the ladder owned the pixel budget and
  // never told the axes it had bailed.
  it("does not move the profile on frame evidence, however bad", () => {
    let state = initialSceneQualityAdaptationState("balanced", 0);
    for (let now = 1_000; now <= 120_000; now += 1_000)
      state = sample(state, now, severe);
    expect(state.profile).toBe("balanced");
    expect(state.directRender).toBe(false);
    expect(state.metrics).toEqual(severe);
  });

  it("does not climb while the window is genuinely missing the budget", () => {
    // An interval a hair over a sixtieth of a second is NOT missing the
    // budget — on a vsync-locked 60 Hz display that is what perfect looks
    // like. Real pressure is drops, or an interval with margin over the
    // budget.
    const missing = { ...good, p95: 26, droppedFrameRatio: 0.2, cpuMs: 20 };
    let state = initialSceneQualityAdaptationState("efficient", 0);
    for (let now = 1_000; now <= 120_000; now += 1_000)
      state = sample(state, now, missing);
    expect(state.profile).toBe("efficient");
  });

  it("climbs no further than the top of the automatic range", () => {
    const spare = { ...good, p95: 9, cpuMs: 4, droppedFrameRatio: 0 };
    let state = initialSceneQualityAdaptationState("safety", 0);
    for (let now = 1_000; now <= 600_000; now += 1_000)
      state = sample(state, now, spare);
    expect(state.profile).toBe("showcase");
  });

  it("cannot reproduce the asymmetry that pinned a fast machine to the floor", () => {
    // Measured on an M5 Max: 11.0 ms p95, 9.7 ms of it main thread, 4.8 %
    // dropped. Under the old rules that hovered between an 8 % decline
    // trigger and a 5 % recovery gate whose clock reset on any single sample
    // over the line, so it fell three rungs and stayed there.
    const hovering = {
      ...good,
      p95: 11.0,
      cpuMs: 9.7,
      droppedFrameRatio: 0.048,
    };
    const blip = { ...hovering, droppedFrameRatio: 0.09 };
    let state = initialSceneQualityAdaptationState("balanced", 0);
    for (let now = 1_000; now <= 180_000; now += 1_000)
      state = sample(state, now, now % 17_000 === 0 ? blip : hovering);
    expect(state.profile).toBe("balanced");
  });

  it("still accepts a deliberate profile change", () => {
    let state = initialSceneQualityAdaptationState("balanced", 0);
    state = reduceSceneQualityAdaptation(state, {
      type: "profile",
      now: 1_000,
      profile: "cinematic",
      reason: "manual",
    });
    expect(state.profile).toBe("cinematic");
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

/** A window of frames at a steady interval, with the small jitter any real
 * display produces. Deterministic: no random source. */
function steadyStream(
  frameMs: number,
  cpuMs: number,
  count = 120,
): SceneFrameSample[] {
  return Array.from({ length: count }, (_, index) => ({
    // ±2% sawtooth, so the window has a distribution rather than one value.
    ms: frameMs * (1 + ((index % 5) - 2) * 0.01),
    cpuMs: cpuMs * (1 + ((index % 5) - 2) * 0.01),
  }));
}

describe("frame budget", () => {
  it("grades against an absolute sixtieth of a second", () => {
    expect(SCENE_FRAME_BUDGET_MS).toBeCloseTo(16.667, 3);
    expect(SCENE_FRAME_BUDGET_HZ).toBe(60);
  });

  it("reports the absolute target no matter what the device is achieving", () => {
    const fast = summariseSceneFrameWindow(steadyStream(8.3, 3));
    const slow = summariseSceneFrameWindow(steadyStream(25, 20));
    expect(fast?.targetFrameMs).toBe(SCENE_FRAME_BUDGET_MS);
    expect(slow?.targetFrameMs).toBe(SCENE_FRAME_BUDGET_MS);
    expect(fast?.targetHz).toBe(60);
    expect(slow?.targetHz).toBe(60);
  });

  it("needs at least two frames to say anything", () => {
    expect(summariseSceneFrameWindow([])).toBeNull();
    expect(summariseSceneFrameWindow([{ ms: 16, cpuMs: 4 }])).toBeNull();
  });

  it("aggregates cost and interval the same way over the same frames", () => {
    // Interval and cost are the same series here, so identical aggregation
    // must produce identical numbers. Any divergence is an aggregation bug.
    const frames = steadyStream(20, 20);
    const metrics = summariseSceneFrameWindow(frames);
    expect(metrics?.cpuMs).toBeCloseTo(metrics!.p95, 10);
  });
});

describe("constraint classification", () => {
  it("calls a window with high main-thread cost CPU-bound", () => {
    const metrics = summariseSceneFrameWindow(steadyStream(24, 22));
    expect(classifySceneFrameConstraint(metrics!)).toBe("cpu");
  });

  it("calls a window with a cheap main thread and late frames GPU-bound", () => {
    const metrics = summariseSceneFrameWindow(steadyStream(24, 4));
    expect(classifySceneFrameConstraint(metrics!)).toBe("gpu");
  });

  it("calls a window with a cheap main thread and almost no drops headroom", () => {
    const metrics = summariseSceneFrameWindow(steadyStream(8.3, 3));
    expect(metrics!.droppedFrameRatio).toBeLessThan(0.02);
    expect(classifySceneFrameConstraint(metrics!)).toBe("headroom");
  });

  it("moves nothing when the evidence fits no category", () => {
    // Cost sits between the headroom and CPU-bound lines while frames arrive
    // on time, so no axis has grounds to act.
    expect(
      classifySceneFrameConstraint({
        p95: 17,
        droppedFrameRatio: 0.06,
        cpuMs: 10,
        gpuMs: null,
      }),
    ).toBe("unknown");
  });

  it("does not call a sub-threshold main thread CPU-bound by share alone", () => {
    expect(
      classifySceneFrameConstraint({
        p95: 24,
        droppedFrameRatio: 0.3,
        cpuMs: 10,
        gpuMs: null,
      }),
    ).toBe("unknown");
  });

  it("requires the ADR headroom drop ratio even when CPU cost is cheap", () => {
    expect(
      classifySceneFrameConstraint({
        p95: 16.7,
        droppedFrameRatio: 0.079,
        cpuMs: 5,
        gpuMs: null,
      }),
    ).toBe("unknown");
  });

  it("substitutes measured GPU time for the interval, in the GPU test only", () => {
    const late = { p95: 30, droppedFrameRatio: 0.4, cpuMs: 4 };
    // The interval says late; a GPU timer showing a cheap GPU withdraws the
    // GPU verdict rather than blaming the axis that is not at fault.
    expect(classifySceneFrameConstraint({ ...late, gpuMs: null })).toBe("gpu");
    expect(classifySceneFrameConstraint({ ...late, gpuMs: 5 })).not.toBe("gpu");
  });

  it("leaves a cheap-GPU window classified exactly as it would be untimed", () => {
    const window = { p95: 12, droppedFrameRatio: 0.01, cpuMs: 5 };
    expect(classifySceneFrameConstraint({ ...window, gpuMs: null })).toBe(
      classifySceneFrameConstraint({ ...window, gpuMs: 6 }),
    );
  });

  it("lets main-thread cost outrank a GPU timer, since a timer says nothing about the CPU", () => {
    expect(
      classifySceneFrameConstraint({
        p95: 30,
        droppedFrameRatio: 0.4,
        cpuMs: 14,
        gpuMs: 28,
      }),
    ).toBe("cpu");
  });
});

describe("a steady 40 frames per second device", () => {
  // The defect this issue exists to fix: the budget used to be the device's
  // own 10th-percentile frame time, so 40 Hz became its own definition of
  // success and the controller upgraded it.
  const metrics = summariseSceneFrameWindow(steadyStream(25, 6))!;

  it("is graded against 60 Hz, not against its own cadence", () => {
    expect(metrics.targetFrameMs).toBeCloseTo(16.667, 3);
    expect(metrics.p95).toBeGreaterThan(metrics.targetFrameMs * 1.4);
  });

  it("counts its frames as dropped", () => {
    expect(metrics.droppedFrameRatio).toBeGreaterThan(0.35);
  });

  it("does not classify as recovering", () => {
    expect(metrics.p95 <= metrics.targetFrameMs * 1.1).toBe(false);
  });

  it("does not classify as having headroom", () => {
    expect(classifySceneFrameConstraint(metrics)).not.toBe("headroom");
  });

  it("is degraded rather than left alone, when driven through the axes", () => {
    // The profile ladder used to answer this. It no longer adapts, so the
    // obligation moved to the axes: a device holding a steady 40 Hz must end
    // up demonstrably cheaper than it started, on some axis.
    let state = initialSceneQualityAxisState("showcase", 0);
    state = reduceSceneQualityAxes(state, { type: "booted", now: 0 });
    let now = QUALITY_IGNORE_AFTER_TRANSITION_MS + 1;
    for (let step = 0; step < 200; step += 1) {
      now += QUALITY_SAMPLE_INTERVAL_MS;
      state = reduceSceneQualityAxes(state, {
        type: "sample",
        now,
        metrics,
        visible: true,
      });
    }
    const start = initialSceneQualityAxisState("showcase", 0).axes;
    expect(
      state.axes.resolutionStep < start.resolutionStep ||
        state.axes.effects !== start.effects ||
        state.axes.content !== start.content,
    ).toBe(true);
  });

  it("would have been read as healthy under a self-referential budget", () => {
    // Kept as an executable record of the defect. Deriving the target from the
    // 10th percentile puts p95 at roughly 1.0x "target" and drops at zero.
    const derivedTarget = Math.max(1_000 / 60, 25 * 0.98);
    expect(metrics.p95 <= derivedTarget * 1.1).toBe(true);
    const droppedUnderDerived =
      steadyStream(25, 6).filter((frame) => frame.ms > derivedTarget * 1.5)
        .length / 120;
    expect(droppedUnderDerived).toBeLessThan(0.05);
  });
});

describe("a steady CPU-bound device below 60 frames per second", () => {
  it.each([50, 55])(
    "does not let a steady %i FPS miss disappear into the pressure gate",
    (fps) => {
      const metrics = summariseSceneFrameWindow(steadyStream(1_000 / fps, 12))!;
      expect(metrics.droppedFrameRatio).toBe(0);
      expect(metrics.p95).toBeGreaterThan(SCENE_FRAME_BUDGET_MS);
      expect(metrics.p95).toBeLessThan(SCENE_FRAME_BUDGET_MS * 1.25);
      expect(metrics.cpuMs).toBeGreaterThan(QUALITY_CPU_BOUND_MS);
      expect(classifySceneFrameConstraint(metrics)).toBe("cpu");
    },
  );

  it("spends resolution instead when the same sustained miss has a cheap main thread", () => {
    const gpuLimited = summariseSceneFrameWindow(steadyStream(20, 4))!;
    expect(classifySceneFrameConstraint(gpuLimited)).toBe("gpu");
  });

  it("does not mistake an isolated CPU tail for sustained CPU pressure", () => {
    const hitchy: SceneQualityMetrics = {
      targetFrameMs: SCENE_FRAME_BUDGET_MS,
      targetHz: SCENE_FRAME_BUDGET_HZ,
      p95: 323,
      p50: 16.7,
      droppedFrameRatio: 0.103,
      sampleCount: 120,
      cpuMs: 280,
      cpuP50: 5,
      gpuMs: null,
    };

    expect(classifySceneFrameConstraint(hitchy)).toBe("unknown");
  });
});

describe("the M5 Max window that read as Safety", () => {
  // Captured from the dev overlay on an M5 Max: 11.0 ms p95, 9.7 ms of it on
  // the main thread, 4.8 % of frames past the dropped line. The overlay
  // showed `safety · res 6/11 · DPR 0.90 · 0.2/2.5 MP` beside `fx full · geo
  // full` — a machine meeting 60 Hz comfortably, pinned to the bottom rung by
  // a ladder the axes could not see.
  //
  // The 9.7 ms is largely instrumentation, not the scene: perch diagnostics
  // run at 4 Hz in development only, evaluating every perch and searching
  // over a hundred candidate curves. Eight expensive frames in a 120-frame
  // window is 6.7 percent, which is exactly where p95 lands. These tests
  // therefore assert what the controller must NOT do with such a window,
  // and check a production-plausible cost separately.
  const measured: SceneQualityMetrics = {
    targetFrameMs: 16.667,
    targetHz: 60,
    p95: 11.0,
    droppedFrameRatio: 0.048,
    sampleCount: 120,
    cpuMs: 9.7,
    gpuMs: null,
  };

  it("is not under pressure, so nothing degrades", () => {
    expect(classifySceneFrameConstraint(measured)).not.toBe("cpu");
    expect(classifySceneFrameConstraint(measured)).not.toBe("gpu");
  });

  it("never falls below the cold-start estimate, however long it runs", () => {
    let state = initialSceneQualityAdaptationState("balanced", 0);
    const seen = new Set<string>();
    for (let now = 1_000; now <= 300_000; now += 1_000) {
      state = sample(state, now, measured);
      seen.add(state.profile);
    }
    expect([...seen]).toEqual(["balanced"]);
  });

  it("holds rather than climbing, since 9.7 ms is not obviously spare", () => {
    // 58 percent of the budget on the main thread is not room to spare. Hold
    // is the honest answer; an earlier revision called it headroom by asking
    // the frame INTERVAL instead of the cost, which no 60 Hz display could
    // ever satisfy.
    expect(classifySceneFrameConstraint(measured)).toBe("unknown");
  });

  it("climbs once the cost is what production actually pays", () => {
    const production = { ...measured, cpuMs: 5, droppedFrameRatio: 0.01 };
    expect(classifySceneFrameConstraint(production)).toBe("headroom");

    let state = initialSceneQualityAdaptationState("balanced", 0);
    for (let now = 1_000; now <= 300_000; now += 1_000)
      state = sample(state, now, production);
    expect(state.profile).toBe("showcase");
  });

  it("climbs the resolution axis back to full through the axis reducer", () => {
    const production = { ...measured, cpuMs: 5, droppedFrameRatio: 0.01 };
    let state = initialSceneQualityAxisState("balanced", 0);
    state = reduceSceneQualityAxes(state, { type: "booted", now: 0 });
    state = { ...state, axes: { ...state.axes, resolutionStep: 6 } };
    for (let now = 20_000; now <= 200_000; now += 1_000)
      state = reduceSceneQualityAxes(state, {
        type: "sample",
        now,
        metrics: production,
        visible: true,
      });
    expect(state.axes.resolutionStep).toBe(SCENE_RESOLUTION_MAX_STEP);
  });

  it("stops reading as room to spare the moment the budget is missed", () => {
    const missing = { ...measured, p95: 26, droppedFrameRatio: 0.3 };
    expect(classifySceneFrameConstraint(missing)).not.toBe("headroom");
  });

  it("names the main thread when the same machine is genuinely CPU-bound", () => {
    const mixed = { ...measured, p95: 26, droppedFrameRatio: 0.3 };
    const cpuBound = { ...mixed, cpuMs: 20 };
    expect(classifySceneFrameConstraint(mixed)).toBe("unknown");
    expect(classifySceneFrameConstraint(cpuBound)).toBe("cpu");
  });
});

describe("a healthy 60 Hz display", () => {
  // A vsync-locked 60 Hz stream sits at the budget when it is doing nothing
  // at all. Grading the INTERVAL against the budget therefore reads perfect
  // as marginal, and an 80-percent-of-budget headroom test reads it as never
  // having room to spare. Both were true of an earlier revision here.
  const healthy: SceneQualityMetrics = {
    targetFrameMs: 16.667,
    targetHz: 60,
    p95: 16.7,
    droppedFrameRatio: 0.01,
    sampleCount: 120,
    cpuMs: 7,
    gpuMs: null,
  };

  it("has room to spare rather than no verdict", () => {
    expect(classifySceneFrameConstraint(healthy)).toBe("headroom");
  });

  it("is not called CPU-bound merely for spending most of a cheap frame", () => {
    expect(classifySceneFrameConstraint({ ...healthy, cpuMs: 10.5 })).not.toBe(
      "cpu",
    );
  });

  it("still degrades once it actually starts dropping frames", () => {
    expect(
      classifySceneFrameConstraint({
        ...healthy,
        cpuMs: 14,
        droppedFrameRatio: 0.2,
      }),
    ).toBe("cpu");
  });
});

describe("the cold-start capability estimate", () => {
  const capable = {
    webglVersion: 2 as const,
    maxTextureSize: 16384,
    maxSamples: 8,
    physicalPixels: 4_000_000,
  };

  it("returns today's answer when the new signals are absent", () => {
    // Every existing case must be unaffected: a missing signal costs nothing.
    expect(deriveRendererCapability(capable)).toBe("high");
    expect(
      deriveRendererCapability({
        ...capable,
        logicalCores: undefined,
        deviceMemoryGb: undefined,
        unmaskedRenderer: undefined,
      }),
    ).toBe("high");
    expect(
      deriveRendererCapability({
        ...capable,
        logicalCores: null,
        deviceMemoryGb: null,
        unmaskedRenderer: null,
      }),
    ).toBe("high");
  });

  it("treats a low core count as constrained", () => {
    expect(deriveRendererCapability({ ...capable, logicalCores: 2 })).toBe(
      "constrained",
    );
  });

  it("leaves a healthy core count alone", () => {
    expect(deriveRendererCapability({ ...capable, logicalCores: 8 })).toBe(
      "high",
    );
  });

  it("treats low device memory as constrained", () => {
    expect(deriveRendererCapability({ ...capable, deviceMemoryGb: 4 })).toBe(
      "constrained",
    );
    expect(deriveRendererCapability({ ...capable, deviceMemoryGb: 8 })).toBe(
      "high",
    );
  });

  it("recognises unambiguously mobile GPU families by renderer string", () => {
    for (const renderer of [
      "Adreno (TM) 640",
      "Mali-G78",
      "PowerVR Rogue GE8320",
    ])
      expect(
        deriveRendererCapability({ ...capable, unmaskedRenderer: renderer }),
      ).toBe("constrained");
  });

  it("never classes Apple hardware from the renderer string alone", () => {
    // Safari masks both iOS and macOS to the literal string "Apple GPU", so
    // matching it would cost an M-series desktop a minute at reduced geometry
    // for nothing. Apple hardware is separated at the starting-state seam
    // instead, where a narrow touch viewport is honest evidence.
    for (const renderer of ["Apple GPU", "Apple M3 Max", "Apple A15 GPU"])
      expect(
        deriveRendererCapability({ ...capable, unmaskedRenderer: renderer }),
      ).toBe("high");
  });

  it("starts a narrow touch viewport low and a capable desktop high", () => {
    expect(
      startingProfileForDevice({ touch: true, narrowViewport: true }),
    ).toBe("efficient");
    expect(
      startingProfileForDevice({ touch: false, narrowViewport: false }),
    ).toBe("balanced");
    expect(
      startingProfileForDevice({
        weakRenderer: true,
        touch: false,
        narrowViewport: false,
      }),
    ).toBe("efficient");
    // A touch device on a WIDE viewport is a tablet or a touchscreen laptop,
    // not a phone, and is not assumed weak. ADR 0017.
    expect(
      startingProfileForDevice({ touch: true, narrowViewport: false }),
    ).toBe("balanced");
  });

  it("never calls a high-resolution desktop weak", () => {
    // A 5K or 6K panel puts an M-series desktop past the 9 megapixel branch
    // of the capability estimate. That is a reason to lower its pixel budget,
    // which the plan already does, and the exact opposite of a reason to
    // start it on reduced geometry.
    const bigDisplay = {
      webglVersion: 2 as const,
      maxTextureSize: 16384,
      maxSamples: 8,
      logicalCores: 16,
      deviceMemoryGb: 64,
      unmaskedRenderer: "Apple GPU",
    };
    expect(rendererLooksWeak(bigDisplay)).toBe(false);
    expect(
      startingProfileForDevice({
        weakRenderer: rendererLooksWeak(bigDisplay),
        touch: false,
        narrowViewport: false,
      }),
    ).toBe("balanced");
    // The capability estimate still says constrained, for the pixel budget.
    expect(
      deriveRendererCapability({ ...bigDisplay, physicalPixels: 14_700_000 }),
    ).toBe("constrained");
  });

  it("still calls a genuinely weak renderer weak", () => {
    expect(
      rendererLooksWeak({
        webglVersion: 1,
        maxTextureSize: 4096,
        maxSamples: 0,
      }),
    ).toBe(true);
  });

  it("never promotes a device on the strength of a new signal", () => {
    // A weak renderer stays constrained however many cores it reports.
    expect(
      deriveRendererCapability({
        webglVersion: 1,
        maxTextureSize: 4096,
        maxSamples: 0,
        physicalPixels: 2_000_000,
        logicalCores: 32,
        deviceMemoryGb: 64,
        unmaskedRenderer: "NVIDIA GeForce RTX 4090",
      }),
    ).toBe("constrained");
  });

  it("ignores a nonsensical zero or negative signal", () => {
    expect(
      deriveRendererCapability({
        ...capable,
        logicalCores: 0,
        deviceMemoryGb: 0,
      }),
    ).toBe("high");
  });
});

describe("the resolution axis inside the plan", () => {
  const narrow = {
    cssWidth: 390,
    cssHeight: 844,
    deviceDpr: 3,
    touch: true,
    narrowViewport: true,
  } as const;

  it("leaves every preset's resolution exactly as it was at the top step", () => {
    // This is the compatibility guarantee: introducing the axis must not move
    // any resolution that is not under pressure.
    for (const profile of AUTO_SCENE_QUALITY_PROFILES) {
      const unaxed = resolveSceneQualityPlan({
        ...narrow,
        mode: profile,
        profile,
      });
      const topStep = resolveSceneQualityPlan({
        ...narrow,
        mode: profile,
        profile,
        resolutionStep: 11,
      });
      expect(topStep.dpr).toBeCloseTo(unaxed.dpr, 10);
    }
  });

  it("can only lower resolution, never raise it past the preset cap", () => {
    for (const profile of AUTO_SCENE_QUALITY_PROFILES) {
      const capped = resolveSceneQualityPlan({
        ...narrow,
        mode: profile,
        profile,
      }).dpr;
      for (let step = 0; step <= 11; step += 1)
        expect(
          resolveSceneQualityPlan({
            ...narrow,
            mode: profile,
            profile,
            resolutionStep: step,
          }).dpr,
        ).toBeLessThanOrEqual(capped + 1e-9);
    }
  });

  it("keeps the narrow-viewport caps intact at the top step", () => {
    for (const profile of AUTO_SCENE_QUALITY_PROFILES)
      expect(
        resolveSceneQualityPlan({
          ...narrow,
          mode: profile,
          profile,
          resolutionStep: 11,
        }).dpr,
      ).toBe(NARROW_VIEWPORT_DPR_CAP_BY_PROFILE[profile]);
  });

  it("descends far enough for Safety to meet its pixel ceiling", () => {
    // The contract is that pressure CAN take Safety below 500,000 physical
    // pixels on the reference viewport, not that it always sits there.
    const floor = resolveSceneQualityPlan({
      cssWidth: SAFETY_BUDGET.referenceCssWidth,
      cssHeight: SAFETY_BUDGET.referenceCssHeight,
      deviceDpr: SAFETY_BUDGET.referenceDpr,
      touch: true,
      narrowViewport: true,
      mode: "safety",
      profile: "safety",
      resolutionStep: 0,
    });
    const pixels =
      SAFETY_BUDGET.referenceCssWidth *
      SAFETY_BUDGET.referenceCssHeight *
      floor.dpr *
      floor.dpr;
    expect(pixels).toBeLessThanOrEqual(SAFETY_BUDGET.maxPhysicalPixels);
  });

  it("resolves the content tier from the preset when the axis supplies none", () => {
    expect(plan("safety").environment.contentTier).toBe("minimal");
    expect(plan("efficient").environment.contentTier).toBe("reduced");
    expect(plan("showcase").environment.contentTier).toBe("full");
  });

  it("lets the axis override the content tier in automatic mode", () => {
    const resolved = resolveSceneQualityPlan({
      ...narrow,
      mode: "auto",
      profile: "balanced",
      contentTier: "minimal",
    });

    expect(resolved.environment.contentTier).toBe("minimal");
    expect(resolved.wildlife.suspendOffscreen).toBe(true);
  });
});

describe("the Safety budget contract", () => {
  it("states the ceilings as numbers rather than as knob positions", () => {
    expect(SAFETY_BUDGET).toMatchObject({
      maxTriangles: 250_000,
      maxPhysicalPixels: 500_000,
      referenceCssWidth: 393,
      referenceCssHeight: 852,
      referenceDpr: 3,
    });
  });

  it("puts the projected minimal tier under the triangle ceiling", () => {
    // Measured composition: 151,833 grass and flowers at the coarsest tuft,
    // 9,100 terrain at 91x50, and 75,705 for everything else. The extra
    // headroom covers visible wildlife at the first checkpoint.
    const projected = 151_833 + 9_100 + 75_705;
    expect(projected).toBeLessThanOrEqual(SAFETY_BUDGET.maxTriangles);
  });

  it("leaves the pixel ceiling satisfiable rather than always satisfied", () => {
    // Safety's narrow cap of 1.25 sits ABOVE the ceiling when unpressured,
    // which is correct: the contract is that pressure can take it below.
    const unpressured =
      SAFETY_BUDGET.referenceCssWidth *
      SAFETY_BUDGET.referenceCssHeight *
      NARROW_VIEWPORT_DPR_CAP_BY_PROFILE.safety ** 2;
    expect(unpressured).toBeGreaterThan(SAFETY_BUDGET.maxPhysicalPixels);

    const atFloor =
      SAFETY_BUDGET.referenceCssWidth *
      SAFETY_BUDGET.referenceCssHeight *
      SCENE_RESOLUTION_SCALE_FLOOR ** 2;
    expect(atFloor).toBeLessThan(SAFETY_BUDGET.maxPhysicalPixels);
  });

  it("maps Safety to the tier the budget was computed for", () => {
    expect(CONTENT_TIER_BY_PROFILE.safety).toBe("minimal");
    expect(SCENE_CONTENT_DEFINITIONS.minimal).toMatchObject({
      nearTuftLod: 2,
      terrainSegmentsX: 91,
      terrainSegmentsZ: 50,
      nearGrassShader: "simplified",
      suspendOffscreenWildlife: true,
    });
  });
});
