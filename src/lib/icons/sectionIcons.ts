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

import { DAYLIGHT, NIGHT } from "~/lib/og/daylight";

/** A colour per colour scheme. `light` is the day; `dark` the night. */
export type ThemePair = { light: string; dark: string };

/** A centered Phosphor glyph over a section-colored sky and skyline. */
export type GlyphIconSpec = {
  kind: "glyph";
  glyph: Icon;
  /** Glyph colour per scheme. */
  color: ThemePair;
  background: {
    light: [string, string, string];
    dark: [string, string, string];
  };
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

/** Blue identifies the personal systems pages. */
const SYSTEM_SKY: GlyphIconSpec["background"] = {
  light: [DAYLIGHT.skyTop, "#3a7fb3", DAYLIGHT.skyLow],
  dark: [NIGHT.skyTop, NIGHT.skyMid, NIGHT.skyLow],
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
  books: {
    kind: "glyph",
    glyph: BooksIcon,
    color: { light: SKY_INK.light, dark: SKY_INK.light },
    background: {
      light: ["#aaa091", "#bdb3a3", "#d0c7b6"],
      dark: ["#494744", "#62605a", "#7b786f"],
    },
  },
  // The Weightlifting App's full rainbow tile stays the same in both themes.
  weightlifting: {
    kind: "image",
    light: {
      svg: "/images/weightlifting/app-icon-128.jpg",
      png: "/images/weightlifting/app-icon-256.jpg",
    },
    dark: "/images/weightlifting/app-icon-128.jpg",
    darkTile: { top: "#2c2c2e", bottom: "#161618" },
  },
  // The 3:45am alarm uses the same white ink as the other systems.
  routine: {
    kind: "glyph",
    glyph: AlarmIcon,
    color: SKY_INK,
    background: SYSTEM_SKY,
  },
  // How We Collaborate's handshake.
  manual: {
    kind: "glyph",
    glyph: HandshakeIcon,
    color: SKY_INK,
    background: SYSTEM_SKY,
  },
  // The gear the homepage section already wears.
  systems: {
    kind: "glyph",
    glyph: GearIcon,
    color: SKY_INK,
    background: SYSTEM_SKY,
  },
  // A die.
  liarsdice: {
    kind: "glyph",
    glyph: DiceFiveIcon,
    color: SKY_INK,
    background: {
      light: ["#22624b", "#3b8060", "#6a9b77"],
      dark: ["#153a2d", "#23523d", "#37664b"],
    },
  },
  // A journal, so the private pages carry no face.
  dad: {
    kind: "glyph",
    glyph: NotebookIcon,
    color: SKY_INK,
    background: {
      light: ["#875124", "#a7743e", "#c49962"],
      dark: ["#422c1b", "#624329", "#805a36"],
    },
  },
  // A screen with a play mark.
  youtube: {
    kind: "glyph",
    glyph: MonitorPlayIcon,
    color: SKY_INK,
    background: {
      light: ["#963f3c", "#b45b52", "#ce8371"],
      dark: ["#492322", "#6c3330", "#88473f"],
    },
  },
};
