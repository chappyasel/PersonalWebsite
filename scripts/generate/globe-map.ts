#!/usr/bin/env tsx
// Bakes the About globe's map: public/models/globe-map-light.webp and
// globe-map-dark.webp, a 2048x1024 equirectangular pair the ball samples the
// way other props sample the palette atlases.
//
//   pnpm generate:globe-map            # write both textures
//   pnpm generate:globe-map --png DIR  # also drop PNG previews into DIR
//
// Natural Earth 50m arrives through the world-atlas package, d3-geo projects
// it into SVG, resvg rasterises, sharp encodes. The visited countries in
// aboutTravel.ts are filled here, once, so no geodata and no projection code
// ship to the browser. Rerun after editing VISITED_PLACES or the colours.
//
// The colours are tuned against the graded render, not against these hexes:
// ACES compresses everything on the shelf, so the ink here is more saturated
// than it reads in the room.
import { ABOUT_GLOBE_THEME_COLORS } from "../../src/app/components/stacks/scene/aboutGlobePalette";
import { ABOUT_GLOBE_MAP_URLS } from "../../src/app/components/stacks/scene/aboutTravel";
import { Resvg } from "@resvg/resvg-js";
import {
  type GeoPermissibleObjects,
  geoEquirectangular,
  geoPath,
} from "d3-geo";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { mesh } from "topojson-client";

import { loadCountries, visitedGeometry } from "./globeCountries";

const WIDTH = 2048;
const HEIGHT = WIDTH / 2;
/** A visited feature narrower than this on the texture gets a dot at its
 * centroid as well, so Barbados (one texel) still reads as a mark. */
const MIN_MARK_PX = 6;
const MARK_DOT_RADIUS = 3;

type Theme = Readonly<{
  ocean: string;
  land: string;
  coast: string;
  border: string;
  visited: string;
  visitedEdge: string;
}>;

/** The low-poly Earth palette the rest of the room's props share: a teal sea
 * and a flat green land, the way Zoe XR's poly.pizza Earth paints them.
 * Visited countries are a warm gold, which stays apart from both the green
 * around it and the logo-orange chapter marks on top of it. Two earlier cuts
 * failed on the grade: an antique parchment globe collapsed into one
 * orange-yellow ball under the warm key light, and a navy sea read as a
 * different game from the shelf it sat on. The night set is the same hues
 * pulled down, like the dark atlas. */
const THEMES: Readonly<Record<"light" | "dark", Theme>> =
  ABOUT_GLOBE_THEME_COLORS;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

const { topology, countriesObject, countries, byName } = loadCountries();

const projection = geoEquirectangular()
  .scale(WIDTH / (2 * Math.PI))
  .translate([WIDTH / 2, HEIGHT / 2]);
const path = geoPath(projection);

const landPath = path(countries as unknown as GeoPermissibleObjects) ?? "";
const bordersPath =
  path(mesh(topology, countriesObject, (a, b) => a !== b)) ?? "";
const coastPath =
  path(mesh(topology, countriesObject, (a, b) => a === b)) ?? "";
const visited = visitedGeometry(byName);
const visitedPath = visited.map((geometry) => path(geometry) ?? "").join("");
const dots = visited.flatMap((geometry) => {
  const [[x0, y0], [x1, y1]] = path.bounds(geometry);
  if (Math.max(x1 - x0, y1 - y0) >= MIN_MARK_PX) return [];
  const [cx, cy] = path.centroid(geometry);
  return [{ cx, cy }];
});

function svg(theme: Theme) {
  const dotMarkup = dots
    .map(
      ({ cx, cy }) =>
        `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${MARK_DOT_RADIUS}" fill="${theme.visited}" stroke="${theme.visitedEdge}" stroke-width="0.8"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<rect width="${WIDTH}" height="${HEIGHT}" fill="${theme.ocean}"/>
<path d="${landPath}" fill="${theme.land}"/>
<path d="${bordersPath}" fill="none" stroke="${theme.border}" stroke-width="0.7" stroke-linejoin="round"/>
<path d="${coastPath}" fill="none" stroke="${theme.coast}" stroke-width="0.9" stroke-linejoin="round"/>
<path d="${visitedPath}" fill="${theme.visited}" stroke="${theme.visitedEdge}" stroke-width="0.9" stroke-linejoin="round"/>
${dotMarkup}
</svg>`;
}

const pngDirIndex = process.argv.indexOf("--png");
const pngDir = pngDirIndex >= 0 ? process.argv[pngDirIndex + 1] : undefined;
if (pngDir) mkdirSync(pngDir, { recursive: true });

for (const key of ["light", "dark"] as const) {
  const theme = THEMES[key];
  const png = new Resvg(svg(theme), {
    fitTo: { mode: "width", value: WIDTH },
    background: theme.ocean,
  })
    .render()
    .asPng();
  const webp = await sharp(png).webp({ quality: 84, effort: 6 }).toBuffer();
  const target = join(root, "public", ABOUT_GLOBE_MAP_URLS[key]);
  writeFileSync(target, webp);
  if (pngDir) writeFileSync(join(pngDir, `globe-map-${key}.png`), png);
  console.log(
    `Wrote ${ABOUT_GLOBE_MAP_URLS[key]}: ${(webp.byteLength / 1024).toFixed(0)} KB, ${visited.length} places, ${dots.length} too small for their outline.`,
  );
}
