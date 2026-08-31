export const ARTIFACT_PREVIEW_DURATION_MS = 420;
export const ARTIFACT_PREVIEW_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
export const ARTIFACT_CAROUSEL_DURATION_MS = 520;
export const ARTIFACT_CAROUSEL_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
/** The physical and DOM planes begin their synchronized flight together. */
export const ARTIFACT_PREVIEW_CROSSFADE_START = 0.02;
export const ARTIFACT_PREVIEW_CROSSFADE_END = 0.12;

/** Fade the unfiltered DOM pixels over the opaque scene pixels, then retire
 * the scene only after the DOM plane fully covers it. Their combined opacity
 * never falls below one. Closing reverses the visible handoff in mid-flight. */
export const ARTIFACT_PREVIEW_DOM_IN_START = 0.3;
export const ARTIFACT_PREVIEW_DOM_IN_END = 0.46;
export const ARTIFACT_PREVIEW_SOURCE_OUT_START = 0.46;
export const ARTIFACT_PREVIEW_SOURCE_OUT_END = 0.58;
export const ARTIFACT_PREVIEW_SOURCE_IN_START = 0.42;
export const ARTIFACT_PREVIEW_SOURCE_IN_END = 0.54;
export const ARTIFACT_PREVIEW_DOM_OUT_START = 0.54;
export const ARTIFACT_PREVIEW_DOM_OUT_END = 0.7;
export const ARTIFACT_PREVIEW_DETAIL_IN_START = 0.42;
export const ARTIFACT_PREVIEW_DETAIL_OUT_START = 0.32;

/** Linear ramp from 0 at `start` to 1 at `end`, clamped outside. */
export function artifactPreviewRamp(
  progress: number,
  start: number,
  end: number,
): number {
  return Math.min(1, Math.max(0, (progress - start) / (end - start)));
}

/** Both geometry owners use the same clock. Their opacity handoff is staged
 * separately in the middle of the flight. */
export function artifactPreviewPhysicalTravel(
  progress: number,
  _returning: boolean,
) {
  return artifactPreviewRamp(progress, 0, 1);
}

/** react-photo-view passes phase 3 for an adjacent-image slide. Entry and
 * exit keep the tighter handoff timing; arrows get a slower, balanced curve
 * so the horizontal movement reads instead of looking like a replacement. */
export function artifactPreviewDuration(phase: number): number {
  return phase === 3
    ? ARTIFACT_CAROUSEL_DURATION_MS
    : ARTIFACT_PREVIEW_DURATION_MS;
}

export function artifactPreviewEasing(phase: number): string {
  return phase === 3 ? ARTIFACT_CAROUSEL_EASING : ARTIFACT_PREVIEW_EASING;
}

/** Normalized progress through the early cover-and-retire phase. */
export function artifactPreviewCrossfade(progress: number): number {
  return artifactPreviewRamp(
    progress,
    ARTIFACT_PREVIEW_CROSSFADE_START,
    ARTIFACT_PREVIEW_CROSSFADE_END,
  );
}

function cubicCoordinate(t: number, first: number, second: number) {
  const inverse = 1 - t;
  return (
    3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t * t * t
  );
}

/** Numeric twin of the CSS timing function used by react-photo-view. */
export function artifactPreviewEase(progress: number): number {
  const x = Math.min(1, Math.max(0, progress));
  if (x === 0 || x === 1) return x;

  let lower = 0;
  let upper = 1;
  let parameter = x;
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const sampledX = cubicCoordinate(parameter, 0.4, 0.2);
    if (sampledX < x) lower = parameter;
    else upper = parameter;
    parameter = (lower + upper) / 2;
  }
  return cubicCoordinate(parameter, 0, 1);
}
