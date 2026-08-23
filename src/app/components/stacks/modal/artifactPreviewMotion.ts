export const ARTIFACT_PREVIEW_DURATION_MS = 360;
export const ARTIFACT_PREVIEW_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
export const ARTIFACT_CAROUSEL_DURATION_MS = 520;
export const ARTIFACT_CAROUSEL_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
export const ARTIFACT_PREVIEW_CROSSFADE_START = 0.3;
export const ARTIFACT_PREVIEW_CROSSFADE_END = 0.7;

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

/** Crossfade progress within the shared preview timeline. The first and last
 * 30% stay solid so the DOM clone can match the physical source at both ends. */
export function artifactPreviewCrossfade(progress: number): number {
  return Math.min(
    1,
    Math.max(
      0,
      (progress - ARTIFACT_PREVIEW_CROSSFADE_START) /
        (ARTIFACT_PREVIEW_CROSSFADE_END -
          ARTIFACT_PREVIEW_CROSSFADE_START),
    ),
  );
}

function cubicCoordinate(t: number, first: number, second: number) {
  const inverse = 1 - t;
  return (
    3 * inverse * inverse * t * first +
    3 * inverse * t * t * second +
    t * t * t
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
    const sampledX = cubicCoordinate(parameter, 0.16, 0.3);
    if (sampledX < x) lower = parameter;
    else upper = parameter;
    parameter = (lower + upper) / 2;
  }
  return cubicCoordinate(parameter, 1, 1);
}
