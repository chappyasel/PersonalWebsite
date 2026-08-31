export type ArtifactPreviewTargetRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export type ArtifactPreviewTargetCorrection = Readonly<{
  scale: number;
  offsetX: number;
  offsetY: number;
}>;

export const IDENTITY_ARTIFACT_PREVIEW_TARGET_CORRECTION: ArtifactPreviewTargetCorrection =
  { scale: 1, offsetX: 0, offsetY: 0 };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Closed-loop correction measured while the physical print is hidden at its
 * fullscreen target. It makes the real scene plane begin return directly
 * beneath the DOM plane instead of exposing a larger or vertically offset
 * copy when its middle-flight fade starts. */
export function nextArtifactPreviewTargetCorrection(
  current: ArtifactPreviewTargetCorrection,
  target: ArtifactPreviewTargetRect,
  actual: ArtifactPreviewTargetRect,
): ArtifactPreviewTargetCorrection {
  if (target.width <= 0 || actual.width <= 0) return current;
  const ratio = clamp(target.width / actual.width, 0.9, 1.1);
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;
  const actualCenterX = actual.left + actual.width / 2;
  const actualCenterY = actual.top + actual.height / 2;
  const dx = targetCenterX - actualCenterX;
  const dy = targetCenterY - actualCenterY;
  const quiet = (value: number) => (Math.abs(value) < 0.2 ? 0 : value);
  return {
    scale: clamp(current.scale * ratio, 0.75, 1.35),
    offsetX: clamp(
      current.offsetX + quiet(dx),
      -target.width / 2,
      target.width / 2,
    ),
    offsetY: clamp(
      current.offsetY + quiet(dy),
      -target.height / 2,
      target.height / 2,
    ),
  };
}
