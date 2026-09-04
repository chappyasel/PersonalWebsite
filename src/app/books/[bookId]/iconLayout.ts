/**
 * Geometry for the book favicon: a whole cover, centred in a square frame,
 * over a blurred copy of itself. The OG card composes the same layers at
 * 1200x630; these numbers are that card scaled to a favicon.
 */

/** Rendered favicon edge in pixels. 64 stays sharp on 2x tab strips. */
export const ICON_FRAME = 64;

/** Room around the cover so its shadow and the blurred edge survive. */
export const ICON_INSET = 6;

/** Covers whose pixel size cannot be read are treated as the classic 2:3. */
export const FALLBACK_COVER_RATIO = { width: 2, height: 3 };

/** The OG card rounds its 300px-wide cover by 20px. Keep that proportion. */
const CORNER_RATIO = 20 / 300;

export type ImageDimensions = { width: number; height: number };

export type CoverBox = {
  width: number;
  height: number;
  /** Corner radius in pixels, at least 1 so a tiny cover still reads. */
  radius: number;
};

/**
 * Fit a whole cover inside the frame, minus the inset on every side. The
 * longer edge fills the available square; the shorter edge keeps the cover's
 * own ratio, so nothing gets cropped.
 */
export function fitCoverInFrame(
  dimensions: ImageDimensions | null,
  frame = ICON_FRAME,
  inset = ICON_INSET,
): CoverBox {
  const usable =
    dimensions && dimensions.width > 0 && dimensions.height > 0
      ? dimensions
      : FALLBACK_COVER_RATIO;
  const limit = Math.max(1, frame - inset * 2);
  const scale = Math.min(limit / usable.width, limit / usable.height);
  const width = Math.max(1, Math.round(usable.width * scale));
  const height = Math.max(1, Math.round(usable.height * scale));
  return {
    width,
    height,
    radius: Math.max(1, Math.round(width * CORNER_RATIO)),
  };
}
