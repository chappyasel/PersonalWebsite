import { SCENE_RESOLUTION_MAX_STEP } from "../scene/qualityAxes";

export type QualityReadoutRuntime = Readonly<{
  profile: string;
  /** What the axis controller is holding right now. */
  axisResolutionStep: number;
  dpr: number;
  physicalPixels: number;
  /** Axis names, printed verbatim. */
  effectsTier: string;
  contentTier: string;
}>;

export type QualityReadout = Readonly<{
  /** Who is driving quality: the controller, or a person. */
  mode: string;
  /** Where the last published frame actually stood. */
  effective: string;
  /** What that frame cost. */
  plan: string;
}>;

/**
 * The Rendering card in Scene Diagnostics, as three finished lines.
 *
 * Two rules here were learned the hard way and are the reason this is not
 * inline formatting.
 *
 * Pinning a resolution step leaves the axis controller adapting underneath,
 * so the pinned step and the controller's step disagree exactly when someone
 * is watching to see whether their pin took. Reporting the controller's
 * number there made a working pin look broken: a window whose pixel budget
 * capped it at DPR 1.62 rendered at step 11 and the panel said "res 9/11".
 * The number shown is the one the frame was RENDERED at, and it says so when
 * it is pinned, because an unmarked number that ignores the control beside it
 * reads as a broken control.
 *
 * The mode line never collapses to a bare "Waiting". The profile is known
 * from the control store before the canvas has published anything, and hiding
 * it makes a booting scene look like a broken one.
 */
export function qualityRenderingReadout({
  cinematicPlus,
  forcedProfile,
  pinnedResolutionStep,
  runtime,
}: {
  cinematicPlus: boolean;
  forcedProfile: string | null;
  /** Non-null while a person holds the resolution axis. */
  pinnedResolutionStep: number | null;
  runtime: QualityReadoutRuntime | null;
}): QualityReadout {
  const mode = cinematicPlus
    ? "Cinematic+ · manual"
    : forcedProfile
      ? `${forcedProfile} · manual`
      : "Auto · adapting";

  if (!runtime)
    return {
      mode,
      effective: "no frame published yet",
      plan: "Resolving render plan",
    };

  const renderedStep = pinnedResolutionStep ?? runtime.axisResolutionStep;
  const pinned = pinnedResolutionStep != null ? " pinned" : "";
  const megapixels = (runtime.physicalPixels / 1_000_000).toFixed(1);

  return {
    mode,
    effective: `Effective ${runtime.profile} · res ${renderedStep}/${SCENE_RESOLUTION_MAX_STEP}${pinned}`,
    plan: `DPR ${runtime.dpr.toFixed(2)} · ${megapixels} MP · fx ${runtime.effectsTier} · geo ${runtime.contentTier}`,
  };
}
