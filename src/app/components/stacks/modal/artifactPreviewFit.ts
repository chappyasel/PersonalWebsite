export type ArtifactPreviewSize = Readonly<{
  width: number;
  height: number;
}>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Match the photo viewer's contain fit while leaving room for touch edges
 * and the inspector chrome. Source-sized images are never enlarged. */
export function fitArtifactPreviewToViewport(
  image: ArtifactPreviewSize,
  viewport: ArtifactPreviewSize,
): ArtifactPreviewSize {
  const horizontalInset = clamp(viewport.width * 0.06, 24, 72);
  const verticalInset = clamp(viewport.height * 0.08, 24, 72);
  const availableWidth = Math.max(1, viewport.width - horizontalInset * 2);
  const availableHeight = Math.max(1, viewport.height - verticalInset * 2);
  const scale = Math.min(
    1,
    availableWidth / image.width,
    availableHeight / image.height,
  );
  return {
    width: Math.round(image.width * scale),
    height: Math.round(image.height * scale),
  };
}
