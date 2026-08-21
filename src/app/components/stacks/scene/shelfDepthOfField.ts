import type { DepthOfFieldEffect } from "postprocessing";

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
  const occurrenceCount = material.fragmentShader
    .split(STOCK_DISTANCE_EXPRESSION)
    .length - 1;
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
