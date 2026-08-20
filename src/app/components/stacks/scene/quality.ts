import {
  SCENE_DROPPED_FRAME_MULTIPLIER,
  SCENE_FRAME_BUDGET_HZ,
  SCENE_FRAME_BUDGET_MS,
} from "./frameBudget";

export type DurableQualityRung = 0 | 1 | 2 | 3;
export type SceneQualityProfile =
  | "cinematic"
  | "showcase"
  | "balanced"
  | "efficient"
  | "safety";
export type SceneQualityMode = "auto" | SceneQualityProfile;
export type RendererCapability =
  | "unknown"
  | "constrained"
  | "standard"
  | "high";

/** GPU families that only ever appear in phones and tablets.
 *
 * Apple is deliberately NOT here. Recent Safari masks the renderer to the
 * literal string "Apple GPU" on iOS and macOS alike, so matching it would
 * class an M-series desktop as constrained and cost it a minute at reduced
 * geometry before headroom climbed it back. An A-series pattern does not help
 * either, because the masked string never contains the part number. Apple
 * hardware is separated at the starting-state seam instead, where a narrow
 * touch viewport is honest evidence of a phone. */
const MOBILE_GPU_PATTERN = /adreno|mali|powervr/i;

/**
 * Bias the cold-start estimate toward `constrained` on evidence available
 * before a single frame renders.
 *
 * Each signal may only push DOWN. A false positive costs a returning visitor
 * some quality for a few seconds until measurement overrides it; a false
 * negative costs them a janky first impression. Those are not symmetric.
 *
 * Both navigator fields are absent on some browsers, Safari included, so a
 * missing signal must leave the estimate exactly as it was.
 */
function suggestsConstrainedDevice({
  logicalCores,
  deviceMemoryGb,
  unmaskedRenderer,
}: {
  logicalCores?: number | null;
  deviceMemoryGb?: number | null;
  unmaskedRenderer?: string | null;
}) {
  if (typeof logicalCores === "number" && logicalCores > 0 && logicalCores < 4)
    return true;
  if (
    typeof deviceMemoryGb === "number" &&
    deviceMemoryGb > 0 &&
    deviceMemoryGb <= 4
  )
    return true;
  return Boolean(unmaskedRenderer && MOBILE_GPU_PATTERN.test(unmaskedRenderer));
}

export function deriveRendererCapability({
  webglVersion,
  maxTextureSize,
  maxSamples,
  physicalPixels,
  observed,
  logicalCores,
  deviceMemoryGb,
  unmaskedRenderer,
}: {
  webglVersion: 1 | 2;
  maxTextureSize: number;
  maxSamples: number;
  physicalPixels: number;
  observed?: Pick<
    SceneQualityMetrics,
    "p95" | "targetFrameMs" | "droppedFrameRatio" | "sampleCount"
  > | null;
  /** `navigator.hardwareConcurrency`, absent on some browsers. */
  logicalCores?: number | null;
  /** `navigator.deviceMemory` in gigabytes, absent on some browsers. */
  deviceMemoryGb?: number | null;
  /** `UNMASKED_RENDERER_WEBGL`, absent where the extension is blocked. */
  unmaskedRenderer?: string | null;
}): RendererCapability {
  if (
    (observed &&
      observed.sampleCount >= 60 &&
      (observed.p95 > observed.targetFrameMs * 1.45 ||
        observed.droppedFrameRatio > 0.25)) ||
    webglVersion === 1 ||
    maxTextureSize < 8192 ||
    maxSamples < 2 ||
    physicalPixels > 9_000_000 ||
    suggestsConstrainedDevice({
      logicalCores,
      deviceMemoryGb,
      unmaskedRenderer,
    })
  )
    return "constrained";
  if (
    webglVersion === 2 &&
    maxTextureSize >= 16384 &&
    maxSamples >= 4 &&
    physicalPixels <= 6_000_000
  )
    return "high";
  return "standard";
}

export function bookCoverWidthForNeed(
  projectedCssPixels: number,
  profile: SceneQualityProfile,
): 256 | 384 {
  if (profile === "efficient" || profile === "safety") return 256;
  return projectedCssPixels * 1.35 > 256 ? 384 : 256;
}
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
    /** What the meadow actually draws. Automatic mode drives this from the
     * content axis; a forced preset pins it to that preset's tier. */
    contentTier: SceneContentTier;
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

/** Narrow layouts share the mobile presentation seam, but this cap remains
 * independent of pointer type and renderer classification. Cinematic is
 * manual-only and deliberately keeps its capture-quality DPR policy. */
export const NARROW_VIEWPORT_DPR_CAP_BY_PROFILE: Readonly<
  Record<Exclude<SceneQualityProfile, "cinematic">, number>
> = Object.freeze({
  showcase: 2,
  balanced: 1.75,
  efficient: 1.5,
  safety: 1.25,
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

/**
 * Which profile's authored effect block a tier renders.
 *
 * The inverse of the effects column of `AXES_BY_PROFILE`, with one wrinkle:
 * Showcase and Balanced both sit at `full` while their blocks differ —
 * medium versus low ambient occlusion, eight bloom levels versus six. So a
 * tier cannot simply replace the profile's block, or a Balanced device asked
 * for `full` would be handed Showcase's, which is an upgrade nobody asked
 * for. The tier is a CAP: the block comes from whichever of the two is
 * cheaper, exactly as `cheaperContentTier` already does for content.
 */
const EFFECTS_SOURCE_PROFILE: Readonly<
  Record<SceneEffectsTier, SceneQualityProfile>
> = {
  cinematic: "cinematic",
  full: "showcase",
  lean: "efficient",
  minimal: "safety",
};

/** The profile whose effect block should be rendered, given the current
 * profile and the effects axis. Never richer than the profile itself. */
export function effectsProfileFor(
  profile: SceneQualityProfile,
  tier?: SceneEffectsTier,
): SceneQualityProfile {
  if (!tier) return profile;
  const capped = EFFECTS_SOURCE_PROFILE[tier];
  const order = SCENE_QUALITY_PROFILES;
  return order.indexOf(capped) > order.indexOf(profile) ? capped : profile;
}

export function resolveSceneQualityPlan({
  mode,
  profile,
  cssWidth,
  cssHeight,
  deviceDpr,
  touch,
  narrowViewport = false,
  directRender = false,
  overrides,
  hasCustomOverrides,
  contentTier,
  effectsTier,
  resolutionStep,
}: {
  mode: SceneQualityMode;
  profile: SceneQualityProfile;
  cssWidth: number;
  cssHeight: number;
  deviceDpr: number;
  touch: boolean;
  narrowViewport?: boolean;
  directRender?: boolean;
  overrides?: SceneQualityAdvancedOverrides;
  hasCustomOverrides?: boolean;
  /** Supplied by the content axis in automatic mode. Falls back to the
   * profile's own tier, which is what a forced preset resolves to. */
  contentTier?: SceneContentTier;
  effectsTier?: SceneEffectsTier;
  /** Supplied by the resolution axis: 0 is the floor, 11 the ceiling. The
   * ladder is computed against this plan's own cap, so the top step is
   * exactly the resolution the profile would have chosen anyway. Null leaves
   * resolution entirely to the profile, which is what the test harness pin
   * and every forced-DPR assertion rely on. */
  resolutionStep?: number | null;
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
  const dprCap =
    narrowViewport && profile !== "cinematic"
      ? Math.min(
          dprDefinition.dprCap,
          NARROW_VIEWPORT_DPR_CAP_BY_PROFILE[
            useProfileDpr ? profile : "showcase"
          ],
        )
      : dprDefinition.dprCap;
  const profileDpr = Math.max(
    minimumDpr,
    Math.min(deviceDpr * dprDefinition.deviceDprScale, dprCap, areaCap),
  );
  // The resolution axis may only take resolution DOWN from what the profile
  // and the pixel budget already allow. It is a finer ladder inside the
  // existing ceiling, never a way past it, so every preset cap survives
  // untouched and so do the assertions that encode them.
  const dpr =
    resolutionStep == null
      ? profileDpr
      : sceneResolutionScale(resolutionStep, profileDpr);
  // The effects axis selects which authored block renders. Everything else
  // on the plan — pixel budget, meadow, petals — still comes from `profile`.
  const effects = SCENE_QUALITY_DEFINITIONS[effectsProfileFor(profile, effectsTier)];
  const ambientOcclusion =
    overrides?.skipAmbientOcclusion == null
      ? effects.ambientOcclusion
      : !overrides.skipAmbientOcclusion;
  const depthOfField =
    overrides?.skipDepthOfField == null
      ? effects.depthOfField
      : !overrides.skipDepthOfField;
  const bloom = effects.bloom && overrides?.skipBloom !== true;
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
    dprCap,
    pixelBudget,
    physicalPixels: Math.round(cssPixels * dpr * dpr),
    effects: {
      composer: directRender ? "direct" : effects.composer,
      bloom: !directRender && bloom,
      bloomLevels: !directRender && bloom ? effects.bloomLevels : 0,
      bloomResolutionScale: effects.bloomResolutionScale,
      bloomIntensity: effects.bloomIntensity,
      bloomLuminanceThreshold: effects.bloomLuminanceThreshold,
      bloomLuminanceSmoothing: effects.bloomLuminanceSmoothing,
      ambientOcclusion: !directRender && ambientOcclusion,
      ambientOcclusionHalfRes: effects.ambientOcclusionHalfRes,
      ambientOcclusionQuality: effects.ambientOcclusionQuality,
      depthOfField: !directRender && depthOfField,
      depthOfFieldResolutionScale: effects.depthOfFieldResolutionScale,
      depthOfFieldBokehScale: effects.depthOfFieldBokehScale,
      finishing: !directRender,
      // Multisampled composer targets remain disabled on touch/iOS. The
      // desktop-only Cinematic tier combines 8× MSAA with SMAA for captures.
      multisampling: touch ? 0 : effects.multisampling,
      adaptiveSharpen: overrides?.adaptiveSharpen !== false,
      analyticFixtureHalos:
        effectsProfileFor(profile, effectsTier) === "safety" || overrides?.practicalGlowMode === "halo",
    },
    environment: {
      meadowDensity: definition.meadowDensity,
      meadowRung: definition.meadowRung,
      contentTier: contentTier ?? CONTENT_TIER_BY_PROFILE[profile],
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

/** Re-exported so existing consumers keep one import site. The values live in
 * `frameBudget.ts`, which has no imports of its own, so a module that only
 * needs the budget does not pull this policy table in with it. */
export {
  SCENE_DROPPED_FRAME_MULTIPLIER,
  SCENE_FRAME_BUDGET_HZ,
  SCENE_FRAME_BUDGET_MS,
} from "./frameBudget";

/** Which resource a sampling window was short of.
 * `unknown` is a real answer: it moves nothing. */
export type SceneFrameConstraint = "cpu" | "gpu" | "headroom" | "unknown";

/** Main-thread cost above 70% of budget leaves too little room for the GPU to
 * finish inside the frame, whatever the GPU is doing. */
export const QUALITY_CPU_BOUND_MS = SCENE_FRAME_BUDGET_MS * 0.7;
/** A frame is the GPU's fault only when the main thread demonstrably is not
 * the bottleneck: under 40% of budget, while frames still arrive late. */
export const QUALITY_GPU_BOUND_CPU_MS = SCENE_FRAME_BUDGET_MS * 0.4;
export const QUALITY_GPU_BOUND_P95_MS = SCENE_FRAME_BUDGET_MS * 1.25;
/** Headroom is evidence to climb on, so it is stricter than "not failing":
 * half the budget spent, and almost nothing missed. */
/** Share of the frame on the main thread that reads as CPU-bound regardless
 * of absolute cost. Closes the band between the absolute CPU and GPU bounds,
 * where a frame dominated by JS used to get no verdict at all. */
export const QUALITY_CPU_BOUND_SHARE = 0.6;
/** The one dropped-frame line, used in both directions. Above it the scene is
 * under pressure and something should get cheaper; below it there is nothing
 * to fix and quality may climb. Deliberately a single number: every ratchet
 * this system has had came from a gap between a decline threshold and a
 * higher recovery bar. */
export const QUALITY_PRESSURE_DROPPED_RATIO = 0.08;
/** How far past the budget a frame interval must run before it is evidence of
 * pressure rather than of a refresh rate. A vsync-locked 60 Hz display sits
 * at exactly the budget when it is completely idle, so the interval needs
 * real margin before it means anything. */
export const QUALITY_PRESSURE_P95_MULTIPLIER = 1.25;
/** Main-thread cost below which a frame that is not failing has room to
 * spare. Cost, not interval: see classifySceneFrameConstraint. */
export const QUALITY_HEADROOM_CPU_MS = SCENE_FRAME_BUDGET_MS * 0.5;

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
//
// v5: quality became three independent axes graded against an absolute frame
// budget. Every v4 entry was learned by a policy that could read a steady
// 40 Hz as healthy, so those decisions are not evidence about anything.
const QUALITY_STORAGE_VERSION = 5;

export type SceneQualityMetrics = Readonly<{
  targetFrameMs: number;
  targetHz: number;
  p95: number;
  droppedFrameRatio: number;
  sampleCount: number;
  /** 95th percentile main-thread milliseconds per frame, aggregated over the
   * same window as `p95` so the two terms stay comparable. */
  cpuMs: number;
  /** 95th percentile GPU milliseconds where a timer query is available, else
   * null. Null must leave every classification behaving exactly as it would
   * without the extension. */
  gpuMs: number | null;
}>;

/** The three axes quality moves on, each with its own time constant.
 *
 * They are separate because they answer different questions. Resolution is
 * cheap, reversible and invisible in motion, so it moves first and often.
 * Effects are a GPU cost. Content is a main-thread and geometry cost, and it
 * is the one people notice, so it is sticky. Collapsing them into one ladder
 * is what made a phone shed pixels it did not have to spare while keeping
 * every triangle it could not afford. */
export type SceneEffectsTier = "cinematic" | "full" | "lean" | "minimal";
export type SceneContentTier = "full" | "reduced" | "minimal";

export const SCENE_EFFECTS_TIERS: readonly SceneEffectsTier[] = [
  "minimal",
  "lean",
  "full",
  "cinematic",
] as const;
export const SCENE_CONTENT_TIERS: readonly SceneContentTier[] = [
  "minimal",
  "reduced",
  "full",
] as const;

export type SceneContentDefinition = Readonly<{
  /** Index into the grass asset's levels of detail: 66, 32, then 16 triangles
   * per tuft. The far lawn keeps level 1 at every tier. */
  nearTuftLod: 0 | 1 | 2;
  terrainSegmentsX: number;
  terrainSegmentsZ: number;
  /** The near lawn's wind shader. `simplified` binds the one-sample variant
   * the far lawn already uses. */
  nearGrassShader: "full" | "simplified";
  suspendOffscreenWildlife: boolean;
}>;

/**
 * What each content tier actually draws.
 *
 * Every tier holds grass instance count at full density and moves no prop,
 * camera or colour. Only the triangles inside an instance, the terrain
 * tessellation, the wind shader and offscreen wildlife residency change.
 * Thinning coverage is the one geometry change that reads as a different
 * scene rather than a cheaper one, so automatic mode never spends it.
 *
 * Projected scene triangles: 422,807 full, 297,949 reduced, 243,378 minimal.
 */
export const SCENE_CONTENT_DEFINITIONS: Readonly<
  Record<SceneContentTier, SceneContentDefinition>
> = {
  full: {
    nearTuftLod: 0,
    terrainSegmentsX: 240,
    terrainSegmentsZ: 132,
    nearGrassShader: "full",
    suspendOffscreenWildlife: false,
  },
  reduced: {
    nearTuftLod: 1,
    terrainSegmentsX: 160,
    terrainSegmentsZ: 88,
    nearGrassShader: "full",
    suspendOffscreenWildlife: true,
  },
  minimal: {
    nearTuftLod: 2,
    terrainSegmentsX: 120,
    terrainSegmentsZ: 66,
    nearGrassShader: "simplified",
    suspendOffscreenWildlife: true,
  },
};

/** The lowest linear render scale the resolution axis may reach. Mirrored by
 * `SCENE_RESOLUTION_FLOOR` in the axis controller, which imports from here so
 * the two cannot drift. */
export const SCENE_RESOLUTION_SCALE_FLOOR = 0.6;
export const SCENE_RESOLUTION_STEPS = 12;
export const SCENE_RESOLUTION_STEP_MAX = SCENE_RESOLUTION_STEPS - 1;

/** Twelve geometrically spaced steps between the floor and a ceiling.
 *
 * Geometric rather than linear so a step feels the same size wherever the
 * ceiling sits: on a device capped at 3 a linear ladder would make the top
 * steps imperceptible and the bottom ones cliffs. The top step returns the
 * ceiling exactly, which is what lets the axis be introduced without moving
 * any resolution that is not under pressure.
 */
export function sceneResolutionScale(step: number, ceiling: number): number {
  const top = Math.max(SCENE_RESOLUTION_SCALE_FLOOR, ceiling);
  const clamped = Math.min(SCENE_RESOLUTION_STEP_MAX, Math.max(0, step));
  // Both endpoints are returned exactly rather than computed. `pow` puts a
  // 1.75 ceiling at 1.7500000000000002, and a framebuffer sized from that is
  // a pixel off the one every existing resolution assertion encodes.
  if (clamped >= SCENE_RESOLUTION_STEP_MAX) return top;
  if (clamped <= 0 || top === SCENE_RESOLUTION_SCALE_FLOOR)
    return SCENE_RESOLUTION_SCALE_FLOOR;
  return (
    SCENE_RESOLUTION_SCALE_FLOOR *
    Math.pow(top / SCENE_RESOLUTION_SCALE_FLOOR, clamped / SCENE_RESOLUTION_STEP_MAX)
  );
}

/**
 * Where a device with no learned entry should START.
 *
 * A phone that begins at Balanced spends its opening half-minute walking down
 * the ladder while the visitor watches. Most visitors are gone before it
 * arrives, so the adaptation never reaches the person it was for. Starting a
 * likely-constrained device lower costs a capable one a brief climb and costs
 * a weak one nothing, and those are not symmetric.
 *
 * This is a starting point only, never a floor or a ceiling: the controller
 * re-derives everything from measurement within seconds either way.
 *
 * Viewport and pointer are consulted HERE rather than inside the capability
 * estimate. That keeps rendering capability free of input, which ADR 0017
 * requires, while still letting an initial guess use the fact that a narrow
 * touch viewport is a phone.
 */
export function startingProfileForDevice({
  weakRenderer = false,
  touch,
  narrowViewport,
}: {
  /** Genuine weakness only. Deliberately NOT the `constrained` capability:
   * that classification also fires on `physicalPixels > 9_000_000`, which is
   * an M-series desktop driving a 5K or 6K panel. Lots of pixels to push is a
   * reason to lower the pixel budget, which the plan already does, and the
   * exact opposite of a reason to start it on reduced geometry. */
  weakRenderer?: boolean;
  touch: boolean;
  narrowViewport: boolean;
}): SceneQualityProfile {
  if (weakRenderer || (touch && narrowViewport)) return "efficient";
  return "balanced";
}

/**
 * Whether the renderer itself looks weak, independent of how many pixels it
 * has been asked to fill. Same signals as the capability estimate minus the
 * pixel-count branch.
 */
export function rendererLooksWeak({
  webglVersion,
  maxTextureSize,
  maxSamples,
  logicalCores,
  deviceMemoryGb,
  unmaskedRenderer,
}: {
  webglVersion: 1 | 2;
  maxTextureSize: number;
  maxSamples: number;
  logicalCores?: number | null;
  deviceMemoryGb?: number | null;
  unmaskedRenderer?: string | null;
}) {
  return (
    webglVersion === 1 ||
    maxTextureSize < 8192 ||
    maxSamples < 2 ||
    suggestsConstrainedDevice({
      logicalCores,
      deviceMemoryGb,
      unmaskedRenderer,
    })
  );
}

/** Where each preset stands on the content axis. Lives here rather than with
 * the axis controller so the plan can resolve a content tier without the
 * policy module depending on the controller. */
export const CONTENT_TIER_BY_PROFILE: Readonly<
  Record<SceneQualityProfile, SceneContentTier>
> = {
  cinematic: "full",
  showcase: "full",
  balanced: "full",
  efficient: "reduced",
  safety: "minimal",
};

/**
 * The cheaper of two content tiers.
 *
 * Two systems express pressure in automatic mode: the profile ladder, which
 * still resolves effects and the resolution cap, and the content axis. They
 * can disagree, and when they do the scene should believe the more worried
 * one. Without this, a ladder that had ratcheted all the way to Safety still
 * drew full geometry, because geometry had stopped listening to the profile.
 */
export function cheaperContentTier(
  a: SceneContentTier,
  b: SceneContentTier,
): SceneContentTier {
  return SCENE_CONTENT_TIERS.indexOf(a) <= SCENE_CONTENT_TIERS.indexOf(b)
    ? a
    : b;
}

/** Safety's contract, expressed as numbers a test can check rather than as a
 * set of knob positions. The reference viewport is 393x852 at device pixel
 * ratio 3, which is the harness context already used for mobile assertions. */
export const SAFETY_BUDGET = {
  maxTriangles: 250_000,
  maxPhysicalPixels: 500_000,
  referenceCssWidth: 393,
  referenceCssHeight: 852,
  referenceDpr: 3,
} as const;

export type SceneFrameSample = Readonly<{ ms: number; cpuMs: number }>;

const percentileOf = (sorted: readonly number[], portion: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * portion) - 1)]!;

/**
 * Reduce a window of frames to the metrics the policy grades.
 *
 * Frame interval and main-thread cost are aggregated identically, as 95th
 * percentiles over the same frames, so the two terms of every classification
 * stay comparable. Nothing here is derived from the observed distribution:
 * the budget is absolute, which is the whole point.
 */
export function summariseSceneFrameWindow(
  frames: readonly SceneFrameSample[],
  gpuMs: number | null = null,
): SceneQualityMetrics | null {
  if (frames.length < 2) return null;
  const sorted = frames.map((frame) => frame.ms).sort((a, b) => a - b);
  const sortedCpu = frames.map((frame) => frame.cpuMs).sort((a, b) => a - b);
  return {
    targetFrameMs: SCENE_FRAME_BUDGET_MS,
    targetHz: SCENE_FRAME_BUDGET_HZ,
    p95: percentileOf(sorted, 0.95),
    droppedFrameRatio:
      sorted.filter((ms) => ms > SCENE_FRAME_BUDGET_MS * SCENE_DROPPED_FRAME_MULTIPLIER).length /
      sorted.length,
    sampleCount: sorted.length,
    cpuMs: percentileOf(sortedCpu, 0.95),
    gpuMs,
  };
}

/**
 * Which resource this window was short of.
 *
 * The GPU test substitutes measured GPU time for the frame interval when a
 * timer query supplied it, because the interval also contains work the GPU is
 * not responsible for. The CPU and headroom tests never substitute: they
 * describe the main thread, and a GPU timer says nothing about it.
 */
export function classifySceneFrameConstraint(
  metrics: Pick<
    SceneQualityMetrics,
    "p95" | "droppedFrameRatio" | "cpuMs" | "gpuMs"
  >,
): SceneFrameConstraint {
  const { cpuMs, p95, gpuMs, droppedFrameRatio } = metrics;
  // Whether there is a problem is asked first. The composition of a frame
  // says where the time went, not whether the time was affordable, and the
  // two used to be conflated: a verdict of "cpu" made content coarsen after
  // ten seconds even on a window comfortably inside budget, so a machine
  // meeting 60 Hz could still be quietly degraded.
  //
  // Pressure is read from drops and from an interval with real margin over
  // the budget. Bare `p95 > budget` is not usable: on a vsync-locked display
  // the interval IS the refresh period, so a completely idle 60 Hz machine
  // reports 16.67 ms and floating-point noise decides whether it is in
  // trouble.
  const pressured =
    droppedFrameRatio >= QUALITY_PRESSURE_DROPPED_RATIO ||
    p95 > SCENE_FRAME_BUDGET_MS * QUALITY_PRESSURE_P95_MULTIPLIER;

  // Room to spare is a question about COST, for the same reason. An interval
  // cannot distinguish two milliseconds of work waiting for vsync from
  // sixteen milliseconds of work. An earlier revision asked it anyway, with a
  // p95 under 80 percent of the budget, which no healthy 60 Hz display can
  // ever satisfy — it would have climbed on 120 Hz hardware and never once on
  // 60 Hz.
  if (!pressured)
    return cpuMs < QUALITY_HEADROOM_CPU_MS ? "headroom" : "unknown";

  if (cpuMs > QUALITY_CPU_BOUND_MS) return "cpu";
  const gpuTerm = gpuMs ?? p95;
  if (cpuMs < QUALITY_GPU_BOUND_CPU_MS && gpuTerm > QUALITY_GPU_BOUND_P95_MS)
    return "gpu";
  // Last, so this can only turn a former "unknown" into a verdict and never
  // outrank the two absolute tests above.
  //
  // Absolute cost alone left a dead band, and real hardware sat in it: a
  // measured frame of 11.0 ms carrying 9.7 ms of main thread is 88 % CPU and
  // returned "unknown", because 9.7 is under the 11.67 ms CPU bound and over
  // the 6.67 ms ceiling that would have called it GPU. With no verdict the
  // controller could neither choose an axis nor arm the "resolution is not
  // helping" give-up, so it went on buying pixels back from an idle GPU.
  const frameMs = Math.max(p95, cpuMs);
  if (frameMs > 0 && cpuMs / frameMs >= QUALITY_CPU_BOUND_SHARE) return "cpu";
  return "unknown";
}

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

/** One rung better, within the automatic range. There is deliberately no
 * downward counterpart: the profile falls only by the cold-start estimate or
 * a manual choice. */
function nextProfileUp(profile: SceneQualityProfile): SceneQualityProfile {
  const index = AUTO_SCENE_QUALITY_PROFILES.indexOf(
    profile as (typeof AUTO_SCENE_QUALITY_PROFILES)[number],
  );
  if (index <= 0) return profile;
  return AUTO_SCENE_QUALITY_PROFILES[index - 1]!;
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

  // The profile is a device estimate and a manual override. It is not a
  // feedback loop, and it used to be one.
  //
  // ADR #19 gave runtime adaptation to three axes (see qualityAxes.ts):
  // resolution, effects, and content, each moving on its own evidence. This
  // ladder kept adapting alongside them on its own thresholds, and the two
  // disagreed in public. A machine could sit at `safety` while the axes
  // reported full effects and full geometry, because the ladder owned the
  // pixel budget and nothing told the axes it had given up on the device.
  //
  // The asymmetry was the visible half. Decline needed 1.75 s above 8 %
  // dropped; recovery needed 18 s unbroken below 5 %, and a single sample
  // over the line reset the clock to zero. Anything that hovers near 5 % —
  // a fast machine with periodic main-thread hitches — falls three rungs in
  // about sixteen seconds and never climbs back.
  //
  // Everything the ladder did is covered: the axes drop resolution before
  // anything visible, fall to lean and minimal effects under GPU pressure,
  // coarsen content under CPU pressure, and carry their own travel handling.
  // The one sample-driven transition left here is the composer fallback,
  // because direct rendering has to be able to end.
  if (!state.directRender) {
    // The profile climbs, and only climbs. Showcase carries settings no axis
    // owns — ambient-occlusion quality, bloom levels, the far-grass shader,
    // petal count — so freezing the profile at the cold-start estimate would
    // permanently deny a capable machine its best look. Promotion is safe
    // where decline was not: it moves on the same headroom verdict the
    // resolution axis climbs on, so the two cannot contradict each other, and
    // an upward-only loop has no floor to ratchet down to.
    if (classifySceneFrameConstraint(metrics) === "headroom") {
      const promoted = nextProfileUp(state.profile);
      const since = state.recoverySince ?? now;
      if (
        promoted !== state.profile &&
        !state.moving &&
        now - since >= QUALITY_RECOVERY_SUSTAIN_MS &&
        now - state.lastTransitionAt >= QUALITY_RECOVERY_COOLDOWN_MS
      )
        return transitionProfile(next, promoted, now, "recovery");
      return { ...next, recoverySince: since, severeSafetySince: null };
    }
    next = { ...next, recoverySince: null };

    // One last resort survives, and only from the bottom rung. If a device
    // that already opened at Safety is still severely over budget eight
    // seconds later, the effect chain comes out entirely — the axes can thin
    // effects but never remove the composer. This is the floor below the
    // floor, not quality adaptation, and it cannot ratchet: nothing except
    // the cold-start device estimate or a manual override puts a machine at
    // Safety to begin with.
    if (state.profile !== "safety") return next;
    const severe =
      metrics.p95 > metrics.targetFrameMs * 1.75 ||
      metrics.droppedFrameRatio > 0.35;
    const severeSince = severe ? (state.severeSafetySince ?? now) : null;
    if (severeSince != null && now - severeSince >= QUALITY_SAFETY_FALLBACK_MS)
      return {
        ...next,
        directRender: true,
        severeSafetySince: null,
        stableSince: now,
        transitionReason: "safety-fallback",
      };
    return { ...next, severeSafetySince: severeSince };
  }
  const recovering =
    metrics.p95 <= metrics.targetFrameMs * 1.1 &&
    metrics.droppedFrameRatio < 0.05;
  if (!recovering)
    return { ...next, fallbackRecoverySince: null, stableSince: now };
  const since = state.fallbackRecoverySince ?? now;
  if (now - since < QUALITY_RECOVERY_SUSTAIN_MS)
    return { ...next, fallbackRecoverySince: since };
  return {
    ...transitionProfile(next, state.profile, now, "fallback-recovery"),
    directRender: false,
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
  capability = "unknown",
  cssWidth,
  cssHeight,
  deviceDpr,
}: {
  touch?: boolean;
  capability?: RendererCapability;
  cssWidth: number;
  cssHeight: number;
  deviceDpr: number;
}) {
  const pixels = cssWidth * cssHeight * deviceDpr * deviceDpr;
  const pixelBucket =
    pixels <= 3_000_000 ? "small" : pixels <= 6_000_000 ? "medium" : "large";
  return `stacks-quality:v${QUALITY_STORAGE_VERSION}:${capability}:${pixelBucket}`;
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
