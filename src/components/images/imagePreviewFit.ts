export type ImagePreviewSize = Readonly<{ width: number; height: number }>;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function fitImagePreview(
  image: ImagePreviewSize,
  viewport: ImagePreviewSize,
  {
    upscale = false,
    verticalInset,
  }: { upscale?: boolean; verticalInset?: number } = {},
): ImagePreviewSize {
  const horizontalInset = clamp(viewport.width * 0.06, 24, 72);
  const insetY = verticalInset ?? clamp(viewport.height * 0.08, 24, 72);
  const scale = Math.min(
    upscale ? Infinity : 1,
    Math.max(1, viewport.width - horizontalInset * 2) / image.width,
    Math.max(1, viewport.height - insetY * 2) / image.height,
  );
  return {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
  };
}
