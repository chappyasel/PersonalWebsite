/**
 * Geometry shared by the two sky-card renderers (the SVG favicon and the
 * satori PNG): where the Golden Gate window sits in the surveyed skyline
 * strip, and the size of the centered glyph.
 *
 * The strip (`skylineGeometry.ts`) is 1440 units wide; the bridge stands at
 * x 147..337. A 256-unit window from x 120 puts it left of centre with the
 * hills rising to the right, bottom edge on the tile's, and scales to the
 * tile by FRAME / 256.
 */
import {
  SKYLINE_HEIGHT,
  SKYLINE_SHAPES,
  SKYLINE_WIDTH,
  type SkylineShape,
} from "~/components/daylight/skylineGeometry";

export const SKY_CARD = {
  /** The window's left edge in strip units. */
  windowX: 120,
  /** Strip units shown across the tile. */
  windowWidth: 256,
  /** Glyph edge as a fraction of the frame. Both renderers center it. */
  glyph: { size: 0.625 },
  /** Two wispy clouds above the glyph, in frame fractions. */
  clouds: [
    { cx: 0.14, cy: 0.15, rx: 0.17, ry: 0.025 },
    { cx: 0.12, cy: 0.13, rx: 0.08, ry: 0.035 },
    { cx: 0.22, cy: 0.14, rx: 0.06, ry: 0.025 },
    { cx: 0.76, cy: 0.11, rx: 0.2, ry: 0.025 },
    { cx: 0.72, cy: 0.09, rx: 0.08, ry: 0.035 },
    { cx: 0.83, cy: 0.1, rx: 0.07, ry: 0.03 },
  ],
  cloudOpacity: 0.18,
  /** Sparse stars above the glyph, visible only in the SVG night scheme. */
  stars: [
    { cx: 0.12, cy: 0.13, r: 0.018, opacity: 0.9 },
    { cx: 0.23, cy: 0.22, r: 0.011, opacity: 0.55 },
    { cx: 0.42, cy: 0.08, r: 0.014, opacity: 0.7 },
    { cx: 0.61, cy: 0.19, r: 0.02, opacity: 1 },
    { cx: 0.79, cy: 0.1, r: 0.012, opacity: 0.6 },
    { cx: 0.87, cy: 0.25, r: 0.016, opacity: 0.8 },
  ],
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

/** Green hills in daylight and a darker forest green at night. */
export const ICON_HILL_COLOR = { light: "#57765a", dark: "#263d31" } as const;

/** Night cables recede; the roadway and tower bases catch the scene's lamps. */
export const ICON_BRIDGE_COLOR = {
  light: "#b74727",
  dark: "#493440",
  nightLight: "#b39777",
} as const;

export const ICON_SKYLINE_SHAPES: SkylineShape[] = SKYLINE_SHAPES.map(
  (shape) => {
    if (shape.tone !== "ggb") return shape;
    if (shape.kind === "rect") {
      const width = Math.max(shape.w, 4);
      return {
        ...shape,
        x: shape.x - (width - shape.w) / 2,
        w: width,
        opacity: 1,
      };
    }
    if (shape.kind === "stroke") {
      return { ...shape, width: Math.max(shape.width, 3), opacity: 1 };
    }
    return { ...shape, opacity: 1 };
  },
);
