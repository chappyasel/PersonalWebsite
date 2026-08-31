export const ARTIFACT_PREVIEW_DISMISS_MIN_DISTANCE_PX = 28;
export const ARTIFACT_PREVIEW_DISMISS_MIN_VELOCITY_PX_PER_MS = 0.7;
export const ARTIFACT_PREVIEW_DISMISS_SAMPLE_WINDOW_MS = 100;

const ARTIFACT_PREVIEW_DISMISS_DIRECTION_RATIO = 1.2;
const ARTIFACT_PREVIEW_DISMISS_MAX_SCALE = 1.01;

export type ArtifactPreviewDismissPoint = Readonly<{
  x: number;
  y: number;
  time: number;
}>;

/** A preview may close only after a short, vertical fling at its resting
 * scale. The viewer owns the rubber-band movement; this function decides
 * whether the release carries enough intent to turn that movement into a
 * dismissal. */
export function artifactPreviewShouldDismissOnRelease(
  points: readonly ArtifactPreviewDismissPoint[],
  scale: number,
) {
  if (scale > ARTIFACT_PREVIEW_DISMISS_MAX_SCALE || points.length < 2)
    return false;

  const start = points[0]!;
  const end = points[points.length - 1]!;
  const distanceX = Math.abs(end.x - start.x);
  const distanceY = Math.abs(end.y - start.y);
  if (
    distanceY < ARTIFACT_PREVIEW_DISMISS_MIN_DISTANCE_PX ||
    distanceY < distanceX * ARTIFACT_PREVIEW_DISMISS_DIRECTION_RATIO
  )
    return false;

  const windowStart = end.time - ARTIFACT_PREVIEW_DISMISS_SAMPLE_WINDOW_MS;
  const velocityStart = points.find(
    (point) => point.time >= windowStart && point.time < end.time,
  );
  if (!velocityStart) return false;
  const elapsed = end.time - velocityStart.time;
  if (elapsed <= 0) return false;

  const velocityY = Math.abs(end.y - velocityStart.y) / elapsed;
  return velocityY >= ARTIFACT_PREVIEW_DISMISS_MIN_VELOCITY_PX_PER_MS;
}
