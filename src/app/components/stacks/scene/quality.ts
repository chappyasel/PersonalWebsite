export type DurableQualityRung = 0 | 1 | 2 | 3;
export type SceneQualityProfile =
  | "cinematic"
  | "showcase"
  | "balanced"
  | "efficient"
  | "safety";
export type SceneQualityMode = "auto" | SceneQualityProfile;
export type QualityTransitionReason =
  | "startup"
  | "decline"
  | "severe-decline"
  | "travel-decline"
  | "recovery"
  | "manual"
  | "restored"
  | "effects-error"
  | "safety-fallback"
  | "fallback-recovery";

export const AUTO_SCENE_QUALITY_PROFILES = [
  "showcase",
  "balanced",
  "efficient",
  "safety",
] as const satisfies readonly SceneQualityProfile[];

export const SCENE_QUALITY_PROFILES: readonly SceneQualityProfile[] = [
  "cinematic",
  ...AUTO_SCENE_QUALITY_PROFILES,
];

export const PROFILE_BY_LEGACY_RUNG: Readonly<
  Record<DurableQualityRung, SceneQualityProfile>
> = {
  0: "showcase",
  1: "balanced",
  2: "efficient",
  3: "safety",
};

export const LEGACY_RUNG_BY_PROFILE: Readonly<
  Record<SceneQualityProfile, DurableQualityRung>
> = {
  cinematic: 0,
  showcase: 0,
  balanced: 1,
  efficient: 2,
  safety: 3,
};

export type SceneQualityPlan = Readonly<{
  mode: SceneQualityMode;
  profile: SceneQualityProfile;
  legacyRung: DurableQualityRung;
  touch: boolean;
  dpr: number;
  dprCap: number;
  pixelBudget: number;
  physicalPixels: number;
  effects: Readonly<{
    composer: "full" | "finish" | "direct";
    bloom: boolean;
    bloomLevels: number;
    bloomResolutionScale: number;
    bloomIntensity: Readonly<{ dark: number; light: number }>;
    bloomLuminanceThreshold: Readonly<{ dark: number; light: number }>;
    bloomLuminanceSmoothing: number;
    ambientOcclusion: boolean;
    ambientOcclusionHalfRes: boolean;
    ambientOcclusionQuality:
      | "performance"
      | "low"
      | "medium"
      | "high"
      | "ultra";
    depthOfField: boolean;
    depthOfFieldResolutionScale: number;
    depthOfFieldBokehScale: number;
    finishing: boolean;
    multisampling: 0 | 8;
    adaptiveSharpen: boolean;
    analyticFixtureHalos: boolean;
  }>;
  environment: Readonly<{
    meadowDensity: number;
    meadowRung: 0 | 1 | 2 | 3;
    petals: number;
    dust: boolean;
    cloudDetail: "full" | "simplified";
    farGrassShader: "full" | "simplified";
    grounding: boolean;
  }>;
  butterflies: Readonly<{ wingBlurSamples: 0 | 1 | 3 | 5 }>;
  wildlife: Readonly<{ suspendOffscreen: boolean }>;
  backgroundSimulation: Readonly<{
    suspendSettledProps: boolean;
    pausePrewarmDuringTravel: boolean;
    suspendSettledHover: boolean;
  }>;
  customOverrides: boolean;
}>;

type ProfileDefinition = Readonly<{
  dprCap: number;
  /** Lowest linear render scale this profile may use when a very large CSS
   * viewport would otherwise exceed its physical-pixel budget. */
  minimumDpr: number;
  /** Manual-only profiles may render above native DPR for capture-quality
   * supersampling. Auto profiles remain capped at the panel's native DPR. */
  deviceDprScale: number;
  pixels: Readonly<{ desktop: number; touch: number }>;
  meadowDensity: number;
  meadowRung: 0 | 1 | 2 | 3;
  petals: number;
  dust: boolean;
  cloudDetail: "full" | "simplified";
  farGrassShader: "full" | "simplified";
  grounding: boolean;
  wingBlurSamples: 0 | 1 | 3 | 5;
  suspendOffscreenWildlife: boolean;
  composer: "full" | "finish";
  bloom: boolean;
  bloomLevels: number;
  bloomResolutionScale: number;
  bloomIntensity: Readonly<{ dark: number; light: number }>;
  bloomLuminanceThreshold: Readonly<{ dark: number; light: number }>;
  bloomLuminanceSmoothing: number;
  ambientOcclusion: boolean;
  ambientOcclusionHalfRes: boolean;
  ambientOcclusionQuality: "performance" | "low" | "medium" | "high" | "ultra";
  depthOfField: boolean;
  depthOfFieldResolutionScale: number;
  depthOfFieldBokehScale: number;
  multisampling: 0 | 8;
}>;

/** The complete, reversible policy table. Components consume resolved slices
 * instead of independently interpreting a numeric quality rung. */
export const SCENE_QUALITY_DEFINITIONS: Readonly<
  Record<SceneQualityProfile, ProfileDefinition>
> = Object.freeze({
  cinematic: {
    // Deliberately extravagant and manual-only: roughly twice the previous
    // capture budget, with up to 1.5× native linear supersampling.
    dprCap: 4,
    minimumDpr: 1,
    deviceDprScale: 1.5,
    pixels: { desktop: 16_600_000, touch: 9_400_000 },
    meadowDensity: 1,
    meadowRung: 3,
    petals: 49,
    dust: true,
    cloudDetail: "full",
    farGrassShader: "full",
    grounding: true,
    wingBlurSamples: 5,
    suspendOffscreenWildlife: false,
    composer: "full",
    bloom: true,
    bloomLevels: 10,
    bloomResolutionScale: 1,
    bloomIntensity: { dark: 1.8, light: 0.85 },
    bloomLuminanceThreshold: { dark: 1.05, light: 1.2 },
    bloomLuminanceSmoothing: 0.12,
    ambientOcclusion: true,
    ambientOcclusionHalfRes: false,
    ambientOcclusionQuality: "ultra",
    depthOfField: true,
    depthOfFieldResolutionScale: 1,
    depthOfFieldBokehScale: 2,
    multisampling: 8,
  },
  showcase: {
    dprCap: 3,
    minimumDpr: 1,
    deviceDprScale: 1,
    pixels: { desktop: 5_200_000, touch: 3_100_000 },
    meadowDensity: 1,
    meadowRung: 3,
    petals: 18,
    dust: true,
    cloudDetail: "full",
    farGrassShader: "full",
    grounding: true,
    wingBlurSamples: 3,
    suspendOffscreenWildlife: false,
    composer: "full",
    bloom: true,
    bloomLevels: 8,
    bloomResolutionScale: 0.5,
    bloomIntensity: { dark: 1.2, light: 0.4 },
    bloomLuminanceThreshold: { dark: 1.25, light: 1.35 },
    bloomLuminanceSmoothing: 0.08,
    ambientOcclusion: true,
    ambientOcclusionHalfRes: true,
    ambientOcclusionQuality: "medium",
    depthOfField: true,
    depthOfFieldResolutionScale: 0.6,
    depthOfFieldBokehScale: 1.6,
    multisampling: 0,
  },
  balanced: {
    dprCap: 2.75,
    minimumDpr: 0.85,
    deviceDprScale: 1,
    pixels: { desktop: 4_100_000, touch: 2_600_000 },
    meadowDensity: 1,
    meadowRung: 3,
    petals: 14,
    dust: true,
    cloudDetail: "full",
    farGrassShader: "simplified",
    grounding: true,
    wingBlurSamples: 3,
    suspendOffscreenWildlife: false,
    composer: "full",
    bloom: true,
    bloomLevels: 6,
    bloomResolutionScale: 0.5,
    bloomIntensity: { dark: 1.2, light: 0.4 },
    bloomLuminanceThreshold: { dark: 1.25, light: 1.35 },
    bloomLuminanceSmoothing: 0.08,
    ambientOcclusion: true,
    ambientOcclusionHalfRes: true,
    ambientOcclusionQuality: "low",
    depthOfField: true,
    depthOfFieldResolutionScale: 0.5,
    depthOfFieldBokehScale: 1.6,
    multisampling: 0,
  },
  efficient: {
    dprCap: 2.5,
    minimumDpr: 0.75,
    deviceDprScale: 1,
    pixels: { desktop: 3_200_000, touch: 2_100_000 },
    meadowDensity: 1,
    meadowRung: 3,
    petals: 10,
    dust: false,
    cloudDetail: "simplified",
    farGrassShader: "simplified",
    grounding: true,
    wingBlurSamples: 1,
    suspendOffscreenWildlife: false,
    composer: "full",
    bloom: true,
    bloomLevels: 5,
    bloomResolutionScale: 0.5,
    bloomIntensity: { dark: 1.2, light: 0.4 },
    bloomLuminanceThreshold: { dark: 1.25, light: 1.35 },
    bloomLuminanceSmoothing: 0.08,
    ambientOcclusion: false,
    ambientOcclusionHalfRes: true,
    ambientOcclusionQuality: "low",
    depthOfField: true,
    depthOfFieldResolutionScale: 0.45,
    depthOfFieldBokehScale: 1.6,
    multisampling: 0,
  },
  safety: {
    dprCap: 2,
    minimumDpr: 0.75,
    deviceDprScale: 1,
    pixels: { desktop: 2_500_000, touch: 1_600_000 },
    meadowDensity: 1,
    meadowRung: 3,
    petals: 7,
    dust: false,
    cloudDetail: "simplified",
    farGrassShader: "simplified",
    grounding: false,
    wingBlurSamples: 0,
    suspendOffscreenWildlife: true,
    composer: "finish",
    bloom: true,
    bloomLevels: 4,
    bloomResolutionScale: 0.5,
    bloomIntensity: { dark: 0.9, light: 0.3 },
    bloomLuminanceThreshold: { dark: 1.25, light: 1.35 },
    bloomLuminanceSmoothing: 0.08,
    ambientOcclusion: false,
    ambientOcclusionHalfRes: true,
    ambientOcclusionQuality: "low",
    depthOfField: false,
    depthOfFieldResolutionScale: 0.6,
    depthOfFieldBokehScale: 1.6,
    multisampling: 0,
  },
});

export type SceneQualityAdvancedOverrides = Readonly<{
  effectiveDprLadder?: boolean;
  adaptiveSharpen?: boolean;
  skipAmbientOcclusion?: boolean;
  skipBloom?: boolean;
  skipDepthOfField?: boolean;
  simplifiedFarMeadow?: boolean;
  suspendSettledPropWork?: boolean;
  pausePrewarmDuringTravel?: boolean;
  suspendSettledHoverWork?: boolean;
  practicalGlowMode?: "aperture" | "halo" | "sprite";
}>;

export function resolveSceneQualityPlan({
  mode,
  profile,
  cssWidth,
  cssHeight,
  deviceDpr,
  touch,
  directRender = false,
  overrides,
  hasCustomOverrides,
}: {
  mode: SceneQualityMode;
  profile: SceneQualityProfile;
  cssWidth: number;
  cssHeight: number;
  deviceDpr: number;
  touch: boolean;
  directRender?: boolean;
  overrides?: SceneQualityAdvancedOverrides;
  hasCustomOverrides?: boolean;
}): SceneQualityPlan {
  const definition = SCENE_QUALITY_DEFINITIONS[profile];
  const useProfileDpr = overrides?.effectiveDprLadder !== false;
  const dprDefinition = useProfileDpr
    ? definition
    : SCENE_QUALITY_DEFINITIONS.showcase;
  const pixelBudget = dprDefinition.pixels[touch ? "touch" : "desktop"];
  const cssPixels = Math.max(1, cssWidth * cssHeight);
  const areaCap = Math.sqrt(pixelBudget / cssPixels);
  const minimumDpr = definition.minimumDpr;
  const dpr = Math.max(
    minimumDpr,
    Math.min(
      deviceDpr * dprDefinition.deviceDprScale,
      dprDefinition.dprCap,
      areaCap,
    ),
  );
  const ambientOcclusion =
    overrides?.skipAmbientOcclusion == null
      ? definition.ambientOcclusion
      : !overrides.skipAmbientOcclusion;
  const depthOfField =
    overrides?.skipDepthOfField == null
      ? definition.depthOfField
      : !overrides.skipDepthOfField;
  const bloom = definition.bloom && overrides?.skipBloom !== true;
  const customOverrides =
    hasCustomOverrides ??
    Boolean(
      overrides &&
        (overrides.effectiveDprLadder === false ||
          overrides.adaptiveSharpen === false ||
          overrides.skipAmbientOcclusion === false ||
          overrides.skipBloom === true ||
          overrides.skipDepthOfField === false ||
          overrides.simplifiedFarMeadow != null ||
          overrides.suspendSettledPropWork === false ||
          overrides.pausePrewarmDuringTravel === false ||
          overrides.suspendSettledHoverWork === false ||
          (overrides.practicalGlowMode != null &&
            overrides.practicalGlowMode !== "halo")),
    );

  return {
    mode,
    profile,
    legacyRung: LEGACY_RUNG_BY_PROFILE[profile],
    touch,
    dpr,
    dprCap: dprDefinition.dprCap,
    pixelBudget,
    physicalPixels: Math.round(cssPixels * dpr * dpr),
    effects: {
      composer: directRender ? "direct" : definition.composer,
      bloom: !directRender && bloom,
      bloomLevels: !directRender && bloom ? definition.bloomLevels : 0,
      bloomResolutionScale: definition.bloomResolutionScale,
      bloomIntensity: definition.bloomIntensity,
      bloomLuminanceThreshold: definition.bloomLuminanceThreshold,
      bloomLuminanceSmoothing: definition.bloomLuminanceSmoothing,
      ambientOcclusion: !directRender && ambientOcclusion,
      ambientOcclusionHalfRes: definition.ambientOcclusionHalfRes,
      ambientOcclusionQuality: definition.ambientOcclusionQuality,
      depthOfField: !directRender && depthOfField,
      depthOfFieldResolutionScale: definition.depthOfFieldResolutionScale,
      depthOfFieldBokehScale: definition.depthOfFieldBokehScale,
      finishing: !directRender,
      // Multisampled composer targets remain disabled on touch/iOS. The
      // desktop-only Cinematic tier combines 8× MSAA with SMAA for captures.
      multisampling: touch ? 0 : definition.multisampling,
      adaptiveSharpen: overrides?.adaptiveSharpen !== false,
      analyticFixtureHalos:
        profile === "safety" || overrides?.practicalGlowMode === "halo",
    },
    environment: {
      meadowDensity: definition.meadowDensity,
      meadowRung: definition.meadowRung,
      petals: definition.petals,
      dust: definition.dust,
      cloudDetail: definition.cloudDetail,
      farGrassShader:
        overrides?.simplifiedFarMeadow == null
          ? definition.farGrassShader
          : overrides.simplifiedFarMeadow
            ? "simplified"
            : "full",
      grounding: definition.grounding,
    },
    butterflies: { wingBlurSamples: definition.wingBlurSamples },
    wildlife: { suspendOffscreen: definition.suspendOffscreenWildlife },
    backgroundSimulation: {
      suspendSettledProps: overrides?.suspendSettledPropWork !== false,
      pausePrewarmDuringTravel: overrides?.pausePrewarmDuringTravel !== false,
      suspendSettledHover: overrides?.suspendSettledHoverWork !== false,
    },
    customOverrides,
  };
}

export const QUALITY_SAMPLE_WINDOW_MS = 2_000;
export const QUALITY_SAMPLE_INTERVAL_MS = 250;
export const QUALITY_TRAVEL_VALIDATION_MS =
  QUALITY_SAMPLE_WINDOW_MS + QUALITY_SAMPLE_INTERVAL_MS;
export const QUALITY_IGNORE_AFTER_TRANSITION_MS = 1_000;
export const QUALITY_DECLINE_SUSTAIN_MS = 1_750;
export const QUALITY_DECLINE_COOLDOWN_MS = 3_500;
export const QUALITY_RECOVERY_SUSTAIN_MS = 18_000;
export const QUALITY_RECOVERY_COOLDOWN_MS = 20_000;
export const QUALITY_SAFETY_FALLBACK_MS = 8_000;
export const QUALITY_PERSIST_STABLE_MS = 10_000;
/** Mild scheduling jitter above 1.25× target was enough to ratchet a 60 Hz
 * M5 Max from Showcase to Safety despite only 1.7–4.2% actually missed
 * frames. A decline now needs meaningful missed-frame evidence; p95 remains
 * useful when it is both materially slow and corroborated by drops. */
export const QUALITY_DECLINE_DROPPED_RATIO = 0.08;
export const QUALITY_DECLINE_P95_MULTIPLIER = 1.5;
export const QUALITY_DECLINE_P95_MIN_DROPPED_RATIO = 0.03;
export const QUALITY_DOWNGRADE_P95_IMPROVEMENT_RATIO = 0.9;
export const QUALITY_DOWNGRADE_DROP_IMPROVEMENT = 0.03;
// Policy semantics and large-viewport DPR floors changed in v3. Do not
// restore a Safety decision learned by the former jitter-sensitive policy.
const QUALITY_STORAGE_VERSION = 3;

export type SceneQualityMetrics = Readonly<{
  targetFrameMs: number;
  targetHz: number;
  p95: number;
  droppedFrameRatio: number;
  sampleCount: number;
}>;

export type SceneQualityAdaptationState = Readonly<{
  profile: SceneQualityProfile;
  moving: boolean;
  frozen: boolean;
  directRender: boolean;
  queuedDeclineSteps: 0 | 1 | 2;
  declineSince: number | null;
  recoverySince: number | null;
  severeSafetySince: number | null;
  fallbackRecoverySince: number | null;
  lastTransitionAt: number;
  ignoreUntil: number;
  stableSince: number;
  transitionReason: QualityTransitionReason;
  metrics: SceneQualityMetrics | null;
  /** Signal immediately before the last automatic downgrade. Another
   * downgrade is blocked until the lower tier measurably helps or pressure
   * becomes severe. */
  declineBaseline: SceneQualityMetrics | null;
}>;

export type SceneQualityAdaptationEvent =
  | {
      type: "sample";
      now: number;
      metrics: SceneQualityMetrics;
      visible: boolean;
    }
  | { type: "movement"; now: number; moving: boolean }
  | { type: "ignore"; now: number; reason?: QualityTransitionReason }
  | { type: "freeze"; frozen: boolean }
  | {
      type: "profile";
      now: number;
      profile: SceneQualityProfile;
      reason: QualityTransitionReason;
    }
  | { type: "effects-error"; now: number };

export function initialSceneQualityAdaptationState(
  profile: SceneQualityProfile = "balanced",
  now = 0,
  reason: QualityTransitionReason = "startup",
): SceneQualityAdaptationState {
  return {
    profile,
    moving: false,
    frozen: false,
    directRender: false,
    queuedDeclineSteps: 0,
    declineSince: null,
    recoverySince: null,
    severeSafetySince: null,
    fallbackRecoverySince: null,
    lastTransitionAt: -Infinity,
    ignoreUntil: now + QUALITY_IGNORE_AFTER_TRANSITION_MS,
    stableSince: now,
    transitionReason: reason,
    metrics: null,
    declineBaseline: null,
  };
}

function profileAtOffset(profile: SceneQualityProfile, offset: number) {
  const index = AUTO_SCENE_QUALITY_PROFILES.indexOf(
    profile as (typeof AUTO_SCENE_QUALITY_PROFILES)[number],
  );
  const autoIndex = index < 0 ? 1 : index;
  return AUTO_SCENE_QUALITY_PROFILES[
    Math.max(
      0,
      Math.min(AUTO_SCENE_QUALITY_PROFILES.length - 1, autoIndex + offset),
    )
  ]!;
}

function transitionProfile(
  state: SceneQualityAdaptationState,
  profile: SceneQualityProfile,
  now: number,
  reason: QualityTransitionReason,
): SceneQualityAdaptationState {
  return {
    ...state,
    profile,
    directRender: false,
    queuedDeclineSteps: 0,
    declineSince: null,
    recoverySince: null,
    severeSafetySince: null,
    fallbackRecoverySince: null,
    lastTransitionAt: now,
    ignoreUntil: now + QUALITY_IGNORE_AFTER_TRANSITION_MS,
    stableSince: now,
    transitionReason: reason,
    declineBaseline: null,
  };
}

function transitionForDecline(
  state: SceneQualityAdaptationState,
  profile: SceneQualityProfile,
  now: number,
  reason: QualityTransitionReason,
  metrics: SceneQualityMetrics,
) {
  return {
    ...transitionProfile(state, profile, now, reason),
    declineBaseline: metrics,
  };
}

export function reduceSceneQualityAdaptation(
  state: SceneQualityAdaptationState,
  event: SceneQualityAdaptationEvent,
): SceneQualityAdaptationState {
  if (event.type === "freeze")
    return {
      ...state,
      frozen: event.frozen,
      declineSince: null,
      recoverySince: null,
    };
  if (event.type === "effects-error")
    return {
      ...state,
      directRender: true,
      fallbackRecoverySince: null,
      stableSince: event.now,
      transitionReason: "effects-error",
    };
  if (event.type === "profile")
    return transitionProfile(state, event.profile, event.now, event.reason);
  if (event.type === "ignore")
    return {
      ...state,
      declineSince: null,
      recoverySince: null,
      severeSafetySince: null,
      fallbackRecoverySince: null,
      ignoreUntil: Math.max(
        state.ignoreUntil,
        event.now + QUALITY_IGNORE_AFTER_TRANSITION_MS,
      ),
      stableSince: event.now,
      transitionReason: event.reason ?? state.transitionReason,
    };
  if (event.type === "movement") {
    if (event.moving)
      return {
        ...state,
        moving: true,
        declineSince: null,
        recoverySince: null,
      };
    return {
      ...state,
      moving: false,
      queuedDeclineSteps: state.frozen ? 0 : state.queuedDeclineSteps,
      declineSince: null,
      recoverySince: null,
      ignoreUntil: Math.max(
        state.ignoreUntil,
        event.now + QUALITY_TRAVEL_VALIDATION_MS,
      ),
      stableSince: event.now,
    };
  }

  const { now, metrics, visible } = event;
  if (!visible || metrics.sampleCount < 2 || !Number.isFinite(metrics.p95))
    return state;
  let next: SceneQualityAdaptationState = { ...state, metrics };
  if (state.frozen || now < state.ignoreUntil) return next;

  const severe =
    metrics.p95 > metrics.targetFrameMs * 1.75 ||
    metrics.droppedFrameRatio > 0.35;
  const declining =
    severe ||
    metrics.droppedFrameRatio > QUALITY_DECLINE_DROPPED_RATIO ||
    (metrics.p95 > metrics.targetFrameMs * QUALITY_DECLINE_P95_MULTIPLIER &&
      metrics.droppedFrameRatio > QUALITY_DECLINE_P95_MIN_DROPPED_RATIO);
  const recovering =
    metrics.p95 <= metrics.targetFrameMs * 1.1 &&
    metrics.droppedFrameRatio < 0.05;

  if (state.declineBaseline && !severe) {
    if (!declining) {
      next = { ...next, declineBaseline: null };
    } else {
      const baseline = state.declineBaseline;
      const improved =
        metrics.p95 <= baseline.p95 * QUALITY_DOWNGRADE_P95_IMPROVEMENT_RATIO ||
        metrics.droppedFrameRatio <=
          Math.max(
            0,
            baseline.droppedFrameRatio - QUALITY_DOWNGRADE_DROP_IMPROVEMENT,
          );
      if (!improved)
        return {
          ...next,
          declineSince: null,
          recoverySince: null,
          stableSince: now,
        };
      next = { ...next, declineBaseline: null };
    }
  }

  if (state.queuedDeclineSteps > 0 && !state.moving) {
    // Travel frames share a rolling window with the first settled frames.
    // Never let that stale work become an unconditional downgrade: after the
    // validation delay, the clean settled window must independently confirm
    // pressure. A healthy window disarms the queued signal immediately.
    if (!declining)
      next = {
        ...next,
        queuedDeclineSteps: 0,
      };
    else if (now - state.lastTransitionAt >= QUALITY_DECLINE_COOLDOWN_MS) {
      const confirmedSteps = severe ? 2 : 1;
      const steps = Math.min(state.queuedDeclineSteps, confirmedSteps);
      return transitionForDecline(
        next,
        profileAtOffset(state.profile, steps),
        now,
        "travel-decline",
        metrics,
      );
    }
  }

  if (state.directRender) {
    if (!recovering)
      return { ...next, fallbackRecoverySince: null, stableSince: now };
    const since = state.fallbackRecoverySince ?? now;
    if (now - since < QUALITY_RECOVERY_SUSTAIN_MS)
      return { ...next, fallbackRecoverySince: since };
    return {
      ...transitionProfile(
        next,
        state.transitionReason === "effects-error" ? state.profile : "safety",
        now,
        "fallback-recovery",
      ),
      directRender: false,
    };
  }

  if (declining) {
    const steps = severe ? 2 : 1;
    if (state.moving) {
      const declineSince = state.declineSince ?? now;
      if (now - declineSince < QUALITY_DECLINE_SUSTAIN_MS)
        return {
          ...next,
          declineSince,
          recoverySince: null,
          stableSince: now,
        };
      return {
        ...next,
        queuedDeclineSteps: Math.max(state.queuedDeclineSteps, steps) as
          | 0
          | 1
          | 2,
        declineSince,
        recoverySince: null,
        stableSince: now,
      };
    }
    if (state.profile === "safety") {
      const severeSince = severe ? (state.severeSafetySince ?? now) : null;
      if (
        severeSince != null &&
        now - severeSince >= QUALITY_SAFETY_FALLBACK_MS
      )
        return {
          ...next,
          directRender: true,
          severeSafetySince: null,
          stableSince: now,
          transitionReason: "safety-fallback",
        };
      return {
        ...next,
        declineSince: null,
        recoverySince: null,
        severeSafetySince: severeSince,
        stableSince: now,
      };
    }
    const declineSince = state.declineSince ?? now;
    if (
      now - declineSince >= QUALITY_DECLINE_SUSTAIN_MS &&
      now - state.lastTransitionAt >= QUALITY_DECLINE_COOLDOWN_MS
    )
      return transitionForDecline(
        next,
        profileAtOffset(state.profile, steps),
        now,
        severe ? "severe-decline" : "decline",
        metrics,
      );
    return {
      ...next,
      declineSince,
      recoverySince: null,
      severeSafetySince: null,
      stableSince: now,
    };
  }

  if (!recovering)
    return {
      ...next,
      declineSince: null,
      recoverySince: null,
      severeSafetySince: null,
      stableSince: now,
    };
  if (state.profile === "showcase" || state.moving)
    return { ...next, declineSince: null, severeSafetySince: null };
  const recoverySince = state.recoverySince ?? now;
  if (
    now - recoverySince >= QUALITY_RECOVERY_SUSTAIN_MS &&
    now - state.lastTransitionAt >= QUALITY_RECOVERY_COOLDOWN_MS
  )
    return transitionProfile(
      next,
      profileAtOffset(state.profile, -1),
      now,
      "recovery",
    );
  return {
    ...next,
    declineSince: null,
    recoverySince,
    severeSafetySince: null,
  };
}

export function qualityProfileFromValue(
  value: number | string,
): SceneQualityProfile | null {
  if (typeof value === "number")
    return value >= 0 && value <= 3
      ? PROFILE_BY_LEGACY_RUNG[value as DurableQualityRung]
      : null;
  if ((SCENE_QUALITY_PROFILES as readonly string[]).includes(value))
    return value as SceneQualityProfile;
  if (value === "0" || value === "1" || value === "2" || value === "3")
    return PROFILE_BY_LEGACY_RUNG[Number(value) as DurableQualityRung];
  return null;
}

export function qualityModeFromSearch(search: string): SceneQualityMode {
  const raw = new URLSearchParams(search).get("quality");
  return raw == null ? "auto" : (qualityProfileFromValue(raw) ?? "auto");
}

export function forcedQualityFromSearch(
  search: string,
): DurableQualityRung | null {
  const mode = qualityModeFromSearch(search);
  return mode === "auto" ? null : LEGACY_RUNG_BY_PROFILE[mode];
}

export function sceneQualityStorageBucket({
  touch,
  cssWidth,
  cssHeight,
  deviceDpr,
}: {
  touch: boolean;
  cssWidth: number;
  cssHeight: number;
  deviceDpr: number;
}) {
  const pixels = cssWidth * cssHeight * deviceDpr * deviceDpr;
  const pixelBucket =
    pixels <= 3_000_000 ? "small" : pixels <= 6_000_000 ? "medium" : "large";
  return `stacks-quality:v${QUALITY_STORAGE_VERSION}:${touch ? "coarse" : "fine"}:${pixelBucket}`;
}

// Compatibility helpers retained for scripts and focused callers while the
// application itself consumes SceneQualityPlan.
export const PHYSICAL_PIXEL_BUDGET = {
  touch: SCENE_QUALITY_DEFINITIONS.showcase.pixels.touch,
  desktop: SCENE_QUALITY_DEFINITIONS.showcase.pixels.desktop,
} as const;
export const PHYSICAL_PIXEL_BUDGET_BY_RUNG = {
  touch: [3_100_000, 2_600_000, 2_100_000, 1_600_000],
  desktop: [5_200_000, 4_100_000, 3_200_000, 2_500_000],
} as const;
export const DPR_CAP_BY_RUNG = AUTO_SCENE_QUALITY_PROFILES.map(
  (profile) => SCENE_QUALITY_DEFINITIONS[profile].dprCap,
);

export function resolveDpr({
  cssWidth,
  cssHeight,
  deviceDpr,
  rung,
  touch,
  effectiveRungBudgets = false,
}: {
  cssWidth: number;
  cssHeight: number;
  deviceDpr: number;
  rung: DurableQualityRung;
  touch: boolean;
  effectiveRungBudgets?: boolean;
}) {
  const cssPixels = Math.max(1, cssWidth * cssHeight);
  const profile = PROFILE_BY_LEGACY_RUNG[rung];
  const definition = SCENE_QUALITY_DEFINITIONS[profile];
  const budget = effectiveRungBudgets
    ? PHYSICAL_PIXEL_BUDGET_BY_RUNG[touch ? "touch" : "desktop"][rung]
    : PHYSICAL_PIXEL_BUDGET[touch ? "touch" : "desktop"];
  return Math.max(
    effectiveRungBudgets ? definition.minimumDpr : 1,
    Math.min(deviceDpr, DPR_CAP_BY_RUNG[rung]!, Math.sqrt(budget / cssPixels)),
  );
}

export function meadowQualityRung(
  durable: DurableQualityRung,
  _moving: boolean,
) {
  return SCENE_QUALITY_DEFINITIONS[PROFILE_BY_LEGACY_RUNG[durable]].meadowRung;
}
export function cloudDetailEnabled(skySimplify: boolean, _moving: boolean) {
  return !skySimplify;
}
export function landmarkDetailEnabled(_cloudSimplify: boolean) {
  return true;
}
export function tiltShiftEnabled(
  postprocessing: "full" | "finish" | "off",
  _depthOfField: boolean,
  disabledBySearch: boolean,
) {
  return postprocessing !== "off" && !disabledBySearch;
}
export function postprocessingQuality(durable: DurableQualityRung) {
  return SCENE_QUALITY_DEFINITIONS[PROFILE_BY_LEGACY_RUNG[durable]].composer;
}

// Old reducer exports are intentionally small adapters for external harnesses.
export const QUALITY_TRANSITION_COOLDOWN_MS = QUALITY_DECLINE_COOLDOWN_MS;
export const QUALITY_RECOVERY_STABLE_MS = QUALITY_RECOVERY_SUSTAIN_MS;
export type QualityState = {
  durable: DurableQualityRung;
  moving: boolean;
  lastTransitionAt: number;
  recoveryUsed: boolean;
  stableSince: number | null;
};
export type QualityEvent =
  | { type: "decline"; now: number }
  | { type: "incline"; now: number }
  | { type: "unstable" }
  | { type: "recover"; now: number }
  | { type: "movement"; moving: boolean }
  | { type: "force"; rung: DurableQualityRung; now: number };
export function initialQualityState(
  forced?: DurableQualityRung | null,
): QualityState {
  return {
    durable: forced ?? 0,
    moving: false,
    lastTransitionAt: forced == null ? -Infinity : 0,
    recoveryUsed: forced != null,
    stableSince: null,
  };
}
export function reduceQuality(
  state: QualityState,
  event: QualityEvent,
): QualityState {
  if (event.type === "movement") return { ...state, moving: event.moving };
  if (event.type === "unstable") return { ...state, stableSince: null };
  if (event.type === "incline")
    return state.stableSince == null
      ? { ...state, stableSince: event.now }
      : state;
  if (event.type === "force")
    return {
      ...state,
      durable: event.rung,
      lastTransitionAt: event.now,
      recoveryUsed: true,
      stableSince: null,
    };
  if (event.type === "decline") {
    if (
      state.durable === 3 ||
      event.now - state.lastTransitionAt < QUALITY_DECLINE_COOLDOWN_MS
    )
      return { ...state, stableSince: null };
    return {
      ...state,
      durable: (state.durable + 1) as DurableQualityRung,
      lastTransitionAt: event.now,
      stableSince: null,
    };
  }
  if (
    state.durable === 0 ||
    state.recoveryUsed ||
    state.stableSince == null ||
    event.now - state.stableSince < QUALITY_RECOVERY_SUSTAIN_MS
  )
    return state;
  return {
    ...state,
    durable: (state.durable - 1) as DurableQualityRung,
    lastTransitionAt: event.now,
    recoveryUsed: true,
    stableSince: null,
  };
}
