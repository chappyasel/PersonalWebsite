import { DAYLIGHT, NIGHT } from "~/lib/og/daylight";
import { phosphorPaths } from "~/lib/og/phosphor";

import { SKYLINE_NIGHT } from "~/components/daylight/skylineGeometry";

import type { GlyphIconSpec, ImageIconSpec } from "./sectionIcons";
import { TILE_RADIUS } from "./siteIconSizes";
import {
  ICON_BRIDGE_COLOR,
  ICON_HILL_COLOR,
  ICON_SKYLINE_SHAPES,
  SKY_CARD,
  skylinePlacement,
} from "./skyCard";

/**
 * The section favicon as an SVG that carries both colour schemes. A
 * `prefers-color-scheme: dark` block inside the file recolours it, and the
 * browser evaluates that against its own theme, which is what the tab strip
 * the icon sits on follows. No script, no swap, no duplicate links.
 *
 * Everything is scoped under the root id so several of these can sit
 * inline in one document (the preview sheet does that).
 */

/** Rendered edge; the viewBox is fixed so a scaled render keeps its geometry. */
export const SVG_FRAME = 64;

const RADIUS = Math.round(SVG_FRAME * TILE_RADIUS);
const F = SVG_FRAME;
const fmt = (n: number) => String(Math.round(n * 100) / 100);

const SKY_GLOW: { light: [string, number]; dark: [string, number] } = {
  light: [DAYLIGHT.skyEmber, 0.8],
  dark: ["#aeb5c3", 0.16],
};

function document(
  scope: string,
  light: string,
  dark: string,
  defs: string,
  body: string,
): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" id="${scope}" width="${F}" height="${F}" viewBox="0 0 ${F} ${F}">` +
    `<style>${light}@media (prefers-color-scheme: dark){${dark}}</style>` +
    `<defs>${defs}<clipPath id="${scope}-tile"><rect width="${F}" height="${F}" rx="${RADIUS}"/></clipPath></defs>` +
    body +
    `</svg>`
  );
}

/**
 * Whether a strip shape can show through the window. Path data here is
 * M/L/Z only (the strip is generated), so its numbers alternate x, y. A
 * margin keeps anything straddling the edge.
 */
function inWindow(shape: { kind: string } & Record<string, unknown>): boolean {
  const margin = 24;
  const x0 = SKY_CARD.windowX - margin;
  const x1 = SKY_CARD.windowX + SKY_CARD.windowWidth + margin;
  if (typeof shape.x === "number") {
    const w = typeof shape.w === "number" ? shape.w : 0;
    return shape.x + w >= x0 && shape.x <= x1;
  }
  if (typeof shape.d === "string") {
    const xs = (shape.d.match(/-?\d+(?:\.\d+)?/g) ?? [])
      .map(Number)
      .filter((_, index) => index % 2 === 0);
    return Math.max(...xs) >= x0 && Math.min(...xs) <= x1;
  }
  return true;
}

/**
 * The surveyed skyline through the Golden Gate window, every shape carrying
 * a class so the day and night paints live in the stylesheet. The night
 * lights (windows, lamps, the beacon) are their own group, shown after dark.
 * Shapes that fall outside the window are left out: the whole strip is
 * 1440 units wide and the favicon shows 256 of them.
 */
function skylineMarkup(): string {
  const { scale, left, top } = skylinePlacement(F);
  const shapes = ICON_SKYLINE_SHAPES.filter(inWindow).map((shape) => {
    const tone = shape.tone ?? "sil";
    if (shape.kind === "rect") {
      return `<rect class="f-${tone}" x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}"${shape.opacity != null ? ` fill-opacity="${shape.opacity}"` : ""}/>`;
    }
    if (shape.kind === "stroke") {
      return `<path class="s-${tone}" d="${shape.d}" fill="none" stroke-width="${shape.width}"${shape.opacity != null ? ` stroke-opacity="${shape.opacity}"` : ""}/>`;
    }
    return `<path class="f-${tone}" d="${shape.d}"${shape.opacity != null ? ` fill-opacity="${shape.opacity}"` : ""}/>`;
  });
  const lights = SKYLINE_NIGHT.filter(inWindow).map((shape) => {
    if (shape.kind === "stroke") {
      return `<path d="${shape.d}" fill="none" stroke="${ICON_BRIDGE_COLOR.nightLight}" stroke-width="${shape.width}" stroke-dasharray="2 1.6" stroke-opacity=".35"/>`;
    }
    if (shape.kind === "dot") {
      return `<circle cx="${shape.x}" cy="${shape.y}" r="${shape.r}" fill="${shape.tone === "beacon" ? NIGHT.beacon : NIGHT.window}" fill-opacity="${shape.tone === "beacon" ? 0.8 : 0.85}"/>`;
    }
    return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" fill="${shape.tone === "crown" ? NIGHT.crown : NIGHT.window}" fill-opacity="${shape.tone === "crown" ? 0.5 : 0.8}"/>`;
  });
  return (
    `<g transform="translate(${fmt(left)} ${fmt(top)}) scale(${fmt(scale)})">` +
    shapes.join("") +
    `<g class="nl">${lights.join("")}</g>` +
    `</g>`
  );
}

/** The sky card with a glyph over it: the day by day, the night by night. */
export function siteIconSvg(spec: GlyphIconSpec, scope: string): string {
  const paths = phosphorPaths(spec.glyph, "bold");
  const glyphSize = F * SKY_CARD.glyph.size;
  const glyphOffset = (F - glyphSize) / 2;
  const scale = glyphSize / paths.viewBoxSize;
  const glyphMarkup = `<g class="g" transform="translate(${fmt(glyphOffset)} ${fmt(glyphOffset)}) scale(${scale.toFixed(4)})">${paths.markup}</g>`;

  const light =
    `#${scope} .g{fill:${spec.color.light}}` +
    `#${scope} .clouds{fill:#fff;opacity:${SKY_CARD.cloudOpacity}}` +
    `#${scope} .s0{stop-color:${spec.background.light[0]}}#${scope} .s1{stop-color:${spec.background.light[1]}}#${scope} .s2{stop-color:${spec.background.light[2]}}` +
    `#${scope} .e0{stop-color:${SKY_GLOW.light[0]};stop-opacity:${SKY_GLOW.light[1]}}#${scope} .e1{stop-color:${SKY_GLOW.light[0]};stop-opacity:0}` +
    `#${scope} .f-sil{fill:${ICON_HILL_COLOR.light}}#${scope} .f-ggb{fill:${ICON_BRIDGE_COLOR.light}}#${scope} .f-sutro-red{fill:${DAYLIGHT.sutroRed}}#${scope} .f-sutro-white{fill:${DAYLIGHT.sutroWhite}}` +
    `#${scope} .s-sil{stroke:${ICON_HILL_COLOR.light}}#${scope} .s-ggb{stroke:${ICON_BRIDGE_COLOR.light}}#${scope} .s-sutro-red{stroke:${DAYLIGHT.sutroRed}}#${scope} .s-sutro-white{stroke:${DAYLIGHT.sutroWhite}}` +
    `#${scope} .stars,#${scope} .nl{display:none}`;
  const dark =
    `#${scope} .g{fill:${spec.color.dark}}` +
    `#${scope} .clouds{display:none}#${scope} .stars{display:inline;fill:#e3e6e9;opacity:.4}` +
    `#${scope} .s0{stop-color:${spec.background.dark[0]}}#${scope} .s1{stop-color:${spec.background.dark[1]}}#${scope} .s2{stop-color:${spec.background.dark[2]}}` +
    `#${scope} .e0{stop-color:${SKY_GLOW.dark[0]};stop-opacity:${SKY_GLOW.dark[1]}}#${scope} .e1{stop-color:${SKY_GLOW.dark[0]};stop-opacity:0}` +
    `#${scope} .f-sil{fill:${ICON_HILL_COLOR.dark}}#${scope} .f-ggb{fill:url(#${scope}-bridge-night)}#${scope} .f-sutro-red,#${scope} .f-sutro-white{fill:${ICON_HILL_COLOR.dark}}` +
    `#${scope} .s-sil{stroke:${ICON_HILL_COLOR.dark}}#${scope} .s-ggb{stroke:url(#${scope}-bridge-night)}#${scope} .s-sutro-red,#${scope} .s-sutro-white{stroke:${ICON_HILL_COLOR.dark}}` +
    `#${scope} .nl{display:inline}`;

  const defs =
    `<linearGradient id="${scope}-bridge-night" gradientUnits="userSpaceOnUse" x1="0" y1="66" x2="0" y2="110">` +
    `<stop offset="0" stop-color="${ICON_BRIDGE_COLOR.dark}"/><stop offset=".55" stop-color="#765650"/><stop offset="1" stop-color="${ICON_BRIDGE_COLOR.nightLight}"/>` +
    `</linearGradient>` +
    `<linearGradient id="${scope}-sky" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" class="s0"/><stop offset=".6" class="s1"/><stop offset="1" class="s2"/>` +
    `</linearGradient>` +
    `<radialGradient id="${scope}-glow" cx=".91" cy="1" r=".6">` +
    `<stop offset="0" class="e0"/><stop offset=".7" class="e1"/>` +
    `</radialGradient>`;

  const body =
    `<g clip-path="url(#${scope}-tile)">` +
    `<rect width="${F}" height="${F}" fill="url(#${scope}-sky)"/>` +
    `<rect y="${fmt(F * 0.3)}" width="${F}" height="${fmt(F * 0.7)}" fill="url(#${scope}-glow)"/>` +
    `<g class="clouds">${SKY_CARD.clouds
      .map(
        ({ cx, cy, rx, ry }) =>
          `<ellipse cx="${fmt(F * cx)}" cy="${fmt(F * cy)}" rx="${fmt(F * rx)}" ry="${fmt(F * ry)}"/>`,
      )
      .join("")}</g>` +
    `<g class="stars">${SKY_CARD.stars
      .map(
        ({ cx, cy, r, opacity }) =>
          `<circle cx="${fmt(F * cx)}" cy="${fmt(F * cy)}" r="${fmt(F * r)}" opacity="${opacity}"/>`,
      )
      .join("")}</g>` +
    skylineMarkup() +
    `</g>` +
    glyphMarkup;

  return document(scope, light, dark, defs, body);
}

/**
 * An existing raster mark, both appearances embedded: the light tile shows
 * by day; by night the dark-appearance image is drawn over the dark tile,
 * as a phone draws it. `light` and `dark` are the images as data URIs.
 */
export function siteImageIconSvg(
  spec: ImageIconSpec,
  scope: string,
  images: { light: string; dark: string },
): string {
  const light = `#${scope} .d{display:none}`;
  const dark = `#${scope} .l{display:none}#${scope} .d{display:inline}`;
  const defs =
    `<linearGradient id="${scope}-dark" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${spec.darkTile.top}"/><stop offset="1" stop-color="${spec.darkTile.bottom}"/>` +
    `</linearGradient>`;
  const body =
    `<g clip-path="url(#${scope}-tile)">` +
    `<image class="l" href="${images.light}" width="${F}" height="${F}"/>` +
    `<g class="d"><rect width="${F}" height="${F}" fill="url(#${scope}-dark)"/>` +
    `<image href="${images.dark}" width="${F}" height="${F}"/></g>` +
    `</g>`;
  return document(scope, light, dark, defs, body);
}
