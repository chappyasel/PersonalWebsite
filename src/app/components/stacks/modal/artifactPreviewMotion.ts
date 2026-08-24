export const ARTIFACT_PREVIEW_DURATION_MS = 360;
export const ARTIFACT_PREVIEW_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
export const ARTIFACT_CAROUSEL_DURATION_MS = 520;
export const ARTIFACT_CAROUSEL_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
/** Where the open timeline hands the morph from the physical print to the
 * DOM clone. This still marks the phase change; the opacity windows below
 * decide what the viewer actually sees. */
export const ARTIFACT_PREVIEW_CROSSFADE_START = 0.3;
export const ARTIFACT_PREVIEW_CROSSFADE_END = 0.7;

/** The handoff is a STAGGER, not a crossfade: the DOM print fades in OVER
 * the still-solid physical print, and only once the DOM is solid does the
 * physical print leave underneath it. At every frame one layer is fully
 * opaque, so the swap never dips below full coverage the way the old
 * simultaneous 30-70% crossfade did (two half-faded copies compose to ~75%
 * and read as a flicker now that the two are the same shape). The close
 * plays the same windows mirrored: physical in under the solid DOM first,
 * DOM out after.
 *
 * The 6% gap between the windows is clock slack: the DOM ramp runs on the
 * CSS animation clock and the physical print on the render loop's elapsed
 * time, and the two start a frame or two apart. Sharing an edge would let
 * that skew fade both at once for a few frames. */
export const ARTIFACT_PREVIEW_DOM_IN_START = 0.48;
export const ARTIFACT_PREVIEW_DOM_IN_END = 0.62;
export const ARTIFACT_PREVIEW_SOURCE_OUT_START = 0.68;
export const ARTIFACT_PREVIEW_SOURCE_OUT_END = 0.86;

/** The close does NOT mirror those windows, and mirroring them was a real
 * mistake. Only one of the two layers can rotate: the physical print turns in
 * the room, while the DOM clone can only carry a homography of a small,
 * weakly-perspective plane — which is a squash and a shrink, and reads as
 * SCALING rather than tipping over. Mirroring left that flat-looking layer on
 * top for the first half of the close, so a print that lies flat on the shelf
 * appeared to just scale down into place instead of rotating back down onto
 * it (measured: 0.3% shear across the whole close).
 *
 * So the close hands straight back to the room. The physical print never left
 * the target — it has been sitting there at opacity 0 — so raising it is a
 * swap between two things already in the same place, and once the clone is
 * gone the rest of the close is the real object rotating home. */
export const ARTIFACT_PREVIEW_SOURCE_IN_END = 0.06;
export const ARTIFACT_PREVIEW_DOM_OUT_START = 0.1;
export const ARTIFACT_PREVIEW_DOM_OUT_END = 0.24;

/** Linear ramp from 0 at `start` to 1 at `end`, clamped outside. */
export function artifactPreviewRamp(
  progress: number,
  start: number,
  end: number,
): number {
  return Math.min(1, Math.max(0, (progress - start) / (end - start)));
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

/** Crossfade progress within the shared preview timeline. Kept for the
 * model-artifact path; image previews use the staggered windows above. */
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
    const sampledX = cubicCoordinate(parameter, 0.16, 0.3);
    if (sampledX < x) lower = parameter;
    else upper = parameter;
    parameter = (lower + upper) / 2;
  }
  return cubicCoordinate(parameter, 1, 1);
}
