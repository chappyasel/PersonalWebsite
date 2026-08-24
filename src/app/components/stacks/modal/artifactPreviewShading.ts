// The room does not show a photo's raw pixels: the print is a lit material
// under the scene's rig, tonemapped with everything else. The preview does
// show the raw file. This module says how to turn one into the other for the
// length of the handoff, so the preview print carries the shelf's look while
// the layers swap and only then eases to the true photo.
//
// The measurement is per print and taken at click time — see
// `scene/artifactShadeProbe.ts`. What lives here is only the SHAPE of the
// correction and the fallback used when a print cannot be probed.
import type { ArtifactShadeSample } from "../scene/artifactShadeSamples";

/** Fallback only. Mean RGB of the same central photo region, scene render vs
 * settled preview, About portrait at 1440x900 (2026-08-23):
 *   light  scene [71, 92, 123]  preview [92, 119, 156]  -> x(.772, .773, .788)
 *   dark   scene [89, 94, 113]  preview [92, 119, 156]  -> x(.967, .790, .724)
 * These describe ONE print. Measurement across the About shelf found the
 * spread between prints is larger than the spread between themes — the
 * profile frame renders brighter than its file where the portrait renders a
 * quarter darker — which is why the live probe exists and why this constant
 * is now only what a failed probe falls back to. */
export const ARTIFACT_PREVIEW_SHADE: Record<"light" | "dark", string> = {
  light: "rgb(197, 197, 201)",
  dark: "rgb(247, 201, 185)",
};

export function artifactPreviewShadeColor(dark: boolean): string {
  return ARTIFACT_PREVIEW_SHADE[dark ? "dark" : "light"];
}

/** The correction as CSS applies it. `tint` is a multiply layer, so its
 * channels never exceed 1; anything the room ADDS is carried by `brightness`,
 * which a filter can take past 1. */
export type ArtifactPreviewShade = {
  tint: string;
  brightness: number;
};

export const NEUTRAL_ARTIFACT_PREVIEW_SHADE: ArtifactPreviewShade = {
  tint: "rgb(255, 255, 255)",
  brightness: 1,
};

function channelByte(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

/** Parse the fallback constant back into the factored form so both paths
 * feed the DOM the same shape. */
function fallbackShade(dark: boolean): ArtifactPreviewShade {
  const parsed = /rgb\((\d+), (\d+), (\d+)\)/.exec(
    artifactPreviewShadeColor(dark),
  );
  if (!parsed) return NEUTRAL_ARTIFACT_PREVIEW_SHADE;
  const channels = [
    Number(parsed[1]) / 255,
    Number(parsed[2]) / 255,
    Number(parsed[3]) / 255,
  ] as const;
  const brightness = Math.max(...channels);
  if (brightness <= 0) return NEUTRAL_ARTIFACT_PREVIEW_SHADE;
  return {
    tint: `rgb(${channels.map((c) => channelByte(c / brightness)).join(", ")})`,
    brightness,
  };
}

/** What the preview print should wear while the physical print is still on
 * screen: the measured sample when there is one, the per-theme constant when
 * there is not. */
export function artifactPreviewShade(
  sample: ArtifactShadeSample | undefined,
  dark: boolean,
): ArtifactPreviewShade {
  if (!sample) return fallbackShade(dark);
  return {
    tint: `rgb(${sample.tint.map(channelByte).join(", ")})`,
    brightness: sample.brightness,
  };
}

/** The `filter` value for the shaded state. A multiply layer can only darken,
 * and the room renders several prints BRIGHTER than their file, so the scalar
 * rides a filter instead. Kept as one string so the eased release can
 * interpolate against the identical function list. */
export function artifactPreviewShadeFilter(shade: ArtifactPreviewShade) {
  return `brightness(${shade.brightness.toFixed(4)})`;
}

export const ARTIFACT_PREVIEW_SHADE_FILTER_NONE = "brightness(1)";
