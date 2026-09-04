/**
 * Geometry shared by the two sky-card renderers (the SVG favicon and the
 * satori PNG): where the Golden Gate window sits in the surveyed skyline
 * strip, and where the glyph and the sun or moon go on the tile.
 *
 * The strip (`skylineGeometry.ts`) is 1440 units wide; the bridge stands at
 * x 147..337. A 256-unit window from x 120 puts it left of centre with the
 * hills rising to the right, bottom edge on the tile's, and scales to the
 * tile by FRAME / 256.
 */
import {
  SKYLINE_HEIGHT,
  SKYLINE_WIDTH,
} from "~/components/daylight/skylineGeometry";

export const SKY_CARD = {
  /** The window's left edge in strip units. */
  windowX: 120,
  /** Strip units shown across the tile. */
  windowWidth: 256,
  /** Glyph edge and top-left offset as fractions of the frame. */
  glyph: { size: 0.5, offset: 0.2 },
  /** Sun or moon centre and radius as fractions of the frame. */
  disc: { x: 0.8, y: 0.18, r: 0.07, halo: 0.15 },
  /** Night stars as frame fractions plus opacity. */
  stars: [
    [0.14, 0.14, 0.85],
    [0.36, 0.09, 0.6],
    [0.58, 0.2, 0.45],
  ] as Array<[number, number, number]>,
} as const;

/** How the whole strip lands on a `frame`-pixel tile. */
export function skylinePlacement(frame: number) {
  const scale = frame / SKY_CARD.windowWidth;
  return {
    scale,
    /** Rendered strip size in tile pixels. */
    width: SKYLINE_WIDTH * scale,
    height: SKYLINE_HEIGHT * scale,
    /** Strip origin relative to the tile's top-left. */
    left: -SKY_CARD.windowX * scale,
    top: frame - SKYLINE_HEIGHT * scale,
  };
}
