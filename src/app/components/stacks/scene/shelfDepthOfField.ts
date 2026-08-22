import type { DepthOfFieldEffect } from "postprocessing";

import { depthOfFieldTargetForUnit } from "./worldLayout";

/**
 * The stock depth-of-field shader starts increasing blur immediately on both
 * sides of its target distance. This radius covers the complete shelf volume,
 * including its authored yaw and the About camera's maximum lateral shift, so
 * shelf faces and props receive exactly zero circle-of-confusion.
 */
export const SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS = 1.05;

/** Keep the old 2.2-unit distance to full blur after adding the clear band. */
export const SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE =
  2.2 - SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS;

const STOCK_DISTANCE_EXPRESSION = "abs(signedDistance)";
const SHELF_DISTANCE_EXPRESSION =
  "max(0.0, abs(signedDistance) - SHELF_FOCUS_CLEAR_RADIUS)";

/** Mirror the shader's circle-of-confusion curve for deterministic tests. */
export function shelfDepthOfFieldBlurAmount(distanceDelta: number): number {
  const outsideShelf = Math.max(
    0,
    Math.abs(distanceDelta) - SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS,
  );
  const t = Math.min(
    1,
    Math.max(0, outsideShelf / SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE),
  );
  return t * t * (3 - 2 * t);
}

/**
 * Give the installed postprocessing effect a genuine in-focus volume. The
 * package exposes its circle-of-confusion material but no clear-band option,
 * so patch that one distance expression before the first painted frame.
 */
export function installShelfDepthOfFieldFocusBand(
  effect: DepthOfFieldEffect,
): void {
  const material = effect.cocMaterial;
  material.defines.SHELF_FOCUS_CLEAR_RADIUS =
    SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS.toFixed(6);

  if (material.fragmentShader.includes(SHELF_DISTANCE_EXPRESSION)) return;
  const occurrenceCount =
    material.fragmentShader.split(STOCK_DISTANCE_EXPRESSION).length - 1;
  if (occurrenceCount !== 1) {
    throw new Error(
      "Unsupported postprocessing circle-of-confusion shader: expected one signed-distance expression",
    );
  }

  material.fragmentShader = material.fragmentShader.replace(
    STOCK_DISTANCE_EXPRESSION,
    SHELF_DISTANCE_EXPRESSION,
  );
  material.needsUpdate = true;
}

/**
 * Golf owns a real tee-to-green action axis. The focal plane stays put — a
 * shot must never rack focus — but the accepted range widens enough that the
 * club at address and the cup at the far end are both legible.
 *
 * Not exported. Nothing outside this module applies it, and a test that reads
 * it back proves only that the number is itself; `shelfDepthOfField.test.ts`
 * pins 16.5 through `resolveShelfDepthOfFieldTuning`.
 */
const GOLF_DEPTH_OF_FIELD_FALLOFF_RANGE = 16.5;

export type ShelfDepthOfFieldTuning = Readonly<{
  /** World-space point the effect measures camera distance against. */
  target: [number, number, number];
  focusRange: number;
  bokehScale: number;
  resolutionScale: number;
}>;

/**
 * The single place that decides whether depth of field runs and how it is
 * tuned. Returns null when the pass must not mount at all, which is a
 * different thing from mounting it at zero strength: an unmounted pass costs
 * no render target, no texture sample, and no per-frame work.
 *
 * Three independent reasons suppress it. The quality plan drops it on the
 * cheaper effect tiers, `?nodof` isolates it for comparison, and sitting down
 * puts the camera inside the blur volume where the treatment reads as a
 * smeared foreground rather than depth.
 */
export function resolveShelfDepthOfFieldTuning({
  plan,
  activeUnit,
  golfFocused,
  seated,
  isolated = false,
}: {
  plan: Readonly<{
    depthOfField: boolean;
    depthOfFieldBokehScale: number;
    depthOfFieldResolutionScale: number;
  }>;
  activeUnit: number;
  golfFocused: boolean;
  seated: boolean;
  /** `?nodof` — the reload-time comparison switch. */
  isolated?: boolean;
}): ShelfDepthOfFieldTuning | null {
  if (!plan.depthOfField || isolated || seated) return null;
  return {
    target: [...depthOfFieldTargetForUnit(activeUnit)],
    focusRange: golfFocused
      ? GOLF_DEPTH_OF_FIELD_FALLOFF_RANGE
      : SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE,
    bokehScale: plan.depthOfFieldBokehScale,
    resolutionScale: plan.depthOfFieldResolutionScale,
  };
}

/**
 * Push live tuning onto a mounted effect.
 *
 * The React wrapper reconstructs the whole effect whenever bokeh, focus, or
 * resolution props change, which drops a frame and re-allocates two render
 * targets every time a diagnostics slider moves. So the wrapper keeps stable
 * constructor values and the tuning arrives here instead — including the
 * blur pass, which owns a second copy of the resolution scale and is the one
 * everybody forgets.
 */
export function applyShelfDepthOfFieldTuning(
  effect: DepthOfFieldEffect,
  tuning: Omit<ShelfDepthOfFieldTuning, "target">,
): void {
  installShelfDepthOfFieldFocusBand(effect);
  effect.bokehScale = tuning.bokehScale;
  effect.cocMaterial.focusRange = tuning.focusRange;
  effect.resolution.scale = tuning.resolutionScale;
  effect.blurPass.resolution.scale = tuning.resolutionScale;
}
