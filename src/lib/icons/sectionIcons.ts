import type { Icon } from "@phosphor-icons/react";
import {
  AlarmIcon,
  BooksIcon,
  DiceFiveIcon,
  GearIcon,
  HandshakeIcon,
  MonitorPlayIcon,
  NotebookIcon,
} from "@phosphor-icons/react/dist/ssr";

import { NIGHT } from "~/lib/og/daylight";

/** A colour per colour scheme. `light` is the day; `dark` the night. */
export type ThemePair = { light: string; dark: string };

/**
 * A Phosphor glyph over the sky card: the daylight share card at favicon
 * scale, day sky by day and night sky by night, the Golden Gate and the
 * hills along the bottom. Every section without a mark of its own uses it,
 * so the tabs read as one family.
 */
export type GlyphIconSpec = {
  kind: "glyph";
  glyph: Icon;
  /** Glyph colour per scheme. */
  color: ThemePair;
};

/**
 * An existing raster mark, the way an app ships its icon: an opaque tile
 * for the light scheme and a transparent dark-appearance image drawn over
 * `darkTile`, as iOS draws dark icons over its own dark background. Paths
 * are under public/.
 */
export type ImageIconSpec = {
  kind: "image";
  light: { svg: string; png: string };
  dark: string;
  darkTile: { top: string; bottom: string };
};

export type SiteIconSpec = GlyphIconSpec | ImageIconSpec;

/** The sky's own ink for a glyph: warm white by day, the night card's ink after dark. */
export const SKY_INK: ThemePair = {
  light: "hsl(40, 30%, 96%)",
  dark: NIGHT.ink,
};

export type SectionIconKey =
  | "books"
  | "weightlifting"
  | "routine"
  | "manual"
  | "systems"
  | "liarsdice"
  | "dad"
  | "youtube";

/**
 * One spec per section, read by both renderers: the satori PNGs (light
 * scheme only, for Safari tabs and home screens) and the SVG favicon, which
 * carries both schemes behind a prefers-color-scheme media query.
 */
export const SECTION_ICONS: Record<SectionIconKey, SiteIconSpec> = {
  // The library's root. Each book's own page keeps its cover as the icon.
  books: { kind: "glyph", glyph: BooksIcon, color: SKY_INK },
  // The Weightlifting App's own icon, from its Xcode asset catalog: the
  // rainbow tile by day, the dark-appearance gradient dumbbell by night.
  weightlifting: {
    kind: "image",
    light: {
      svg: "/images/weightlifting/app-icon-128.jpg",
      png: "/images/weightlifting/app-icon-256.jpg",
    },
    dark: "/images/weightlifting/app-icon-dark-128.png",
    darkTile: { top: "#2c2c2e", bottom: "#161618" },
  },
  // The 3:45am alarm: sky ink by day, the morning ochre by night.
  routine: {
    kind: "glyph",
    glyph: AlarmIcon,
    color: { light: SKY_INK.light, dark: NIGHT.am },
  },
  // How We Collaborate's handshake.
  manual: { kind: "glyph", glyph: HandshakeIcon, color: SKY_INK },
  // The gear the homepage section already wears.
  systems: { kind: "glyph", glyph: GearIcon, color: SKY_INK },
  // A die.
  liarsdice: { kind: "glyph", glyph: DiceFiveIcon, color: SKY_INK },
  // A journal, so the private pages carry no face.
  dad: { kind: "glyph", glyph: NotebookIcon, color: SKY_INK },
  // A screen with a play mark.
  youtube: { kind: "glyph", glyph: MonitorPlayIcon, color: SKY_INK },
};
