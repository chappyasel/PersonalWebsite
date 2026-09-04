/**
 * The daylight OG identity, runtime-safe: the single source for the share
 * cards' palette and the dome's surveyed skyline. Used by the hand-run
 * generator scripts (routine/manual, via scripts/generate/og-daylight.tsx,
 * which layers the baked cloud tile on top) and by next/og routes at
 * runtime (which skip the clouds — nothing here touches the filesystem).
 *
 * Sky hexes are the main 3D site's authored values from
 * src/app/components/stacks/theme.ts (light set: L36 skyTop #126bb0,
 * L37 skyHorizon #4f8ab3, L38 skyShadow #6a9aba, L39 skyEmber #f5c78d,
 * L49 skyline #5b7288); the Golden Gate wears daylightRendering.ts
 * goldenGatePaintLinear mixed at the shader's day ratio. OG cards are
 * single static images, so they render the light theme only.
 *
 * Imports are relative (not `~`) so scripts/generate can load this file
 * under tsx without path-alias resolution.
 */
import {
  MOON,
  SKYLINE_HEIGHT,
  SKYLINE_NIGHT,
  SKYLINE_SHAPES,
  SKYLINE_VIEWBOX,
  SKYLINE_WIDTH,
} from "../../components/daylight/skylineGeometry";
import React from "react";

export const DAYLIGHT = {
  skyTop: "#126bb0",
  skyMid: "#4f8ab3",
  skyLow: "#6a9aba",
  skyEmber: "#f5c78d",
  silhouette: "#5b7288",
  ggb: "hsl(8, 36%, 42%)",
  arc0: "hsl(26, 24%, 93%)",
  arc0Clear: "hsla(26, 24%, 93%, 0)",
  arc1: "hsl(46, 30%, 95.5%)",
  arc2: "hsl(60, 9%, 98%)",
  am: "hsl(35, 48%, 38%)",
  pm: "hsl(228, 20%, 44%)",
  fg: "hsl(25, 6%, 32%)",
  label: "hsl(25, 5%, 50%)",
  subtitle: "hsl(25, 5%, 45%)",
} as const;

/** The dome's surveyed skyline, aspect-true across the card width. */
export function skyline(width: number) {
  const height = Math.round((width * SKYLINE_HEIGHT) / SKYLINE_WIDTH);
  return React.createElement(
    "svg",
    {
      width,
      height,
      viewBox: SKYLINE_VIEWBOX,
      style: { position: "absolute" as const, bottom: -1, left: 0 },
    },
    ...SKYLINE_SHAPES.map((shape, i) => {
      const fill = shape.tone === "ggb" ? DAYLIGHT.ggb : DAYLIGHT.silhouette;
      if (shape.kind === "rect") {
        return React.createElement("rect", {
          key: i,
          fill,
          fillOpacity: shape.opacity,
          x: shape.x,
          y: shape.y,
          width: shape.w,
          height: shape.h,
        });
      }
      if (shape.kind === "stroke") {
        return React.createElement("path", {
          key: i,
          d: shape.d,
          fill: "none",
          stroke: fill,
          strokeWidth: shape.width,
          strokeOpacity: shape.opacity,
        });
      }
      return React.createElement("path", {
        key: i,
        fill,
        fillOpacity: shape.opacity,
        d: shape.d,
      });
    }),
  );
}

/**
 * The dark set — theme.ts L89 skyTop #1e2842, L90 skyHorizon #3a4762,
 * L91 skyShadow #1b2233, L92 skyEmber #e07c3e, L97 skyline #141b2b,
 * L98 skyWindow #ffbe73 — plus the night-layer paints the pages use.
 */
export const NIGHT = {
  // Measured from the rendered scene (post-ACES, post-grade), not from
  // theme.ts inputs — see the .dark .daylight-root notes in daylight.css.
  skyTop: "#1c284d",
  skyMid: "#2e3e67",
  skyLow: "#2b3050",
  ember: "#e07c3e",
  silhouette: "#191a2c",
  window: "#ffbe73",
  // The bridge as the scene renders it at night: vivid rose-red
  // (measured #b33b4a at the towers).
  ggb: "#a63a46",
  lamp: "#ff9e3d",
  beacon: "#e61f1a",
  crown: "#c7b39e",
  ink: "hsl(220, 25%, 92%)",
  inkMuted: "hsl(220, 20%, 74%)",
  inkFaint: "hsl(221, 15%, 58%)",
  am: "hsl(38, 48%, 68%)",
  pm: "hsl(228, 32%, 76%)",
  deep: "#10141d",
} as const;

/**
 * The seven section accents at night, from the `.dark .daylight-root` block
 * in daylight.css with the same +2 lightness NIGHT.am and NIGHT.pm carry
 * over their CSS twins, so a glyph reads against the sky at card size.
 */
export const NIGHT_ACCENT = {
  am: NIGHT.am,
  pm: NIGHT.pm,
  moss: "hsl(150, 22%, 64%)",
  coral: "hsl(10, 52%, 72%)",
  coffee: "hsl(26, 36%, 66%)",
  indigo: "hsl(256, 30%, 76%)",
  plum: "hsl(288, 20%, 70%)",
} as const;

/** The page hero's star field, as card-space fractions (x%, y%, size px). */
const STARS: Array<[number, number, number, number]> = [
  [12, 14, 3, 1],
  [47, 19, 3.5, 1],
  [76, 16, 3, 0.95],
  [94, 21, 2.5, 0.8],
  [7, 5, 2.5, 0.85],
  [55, 26, 2, 0.75],
  [70, 4, 3, 0.95],
  [97, 11, 3.5, 0.85],
  [18, 29, 2, 0.7],
  [36, 12, 2.5, 0.8],
  [59, 6, 2, 0.75],
  [86, 24, 3, 0.85],
  [31, 8, 3, 0.95],
  [63, 9, 2.5, 0.85],
  [88, 6, 3.5, 0.95],
  [22, 25, 2.5, 0.75],
  [40, 4, 3.5, 0.9],
  [83, 27, 2.5, 0.7],
  [4, 19, 2, 0.7],
  [27, 17, 3, 0.85],
  [51, 15, 2.5, 0.75],
  [67, 22, 2, 0.7],
];

/**
 * The surveyed skyline at night: silhouette and Golden Gate in the dark
 * hexes, plus the generated night layer — windows, Bay Lights, deck lamps,
 * beacons, the Salesforce crown.
 */
export function nightSkyline(width: number) {
  const height = Math.round((width * SKYLINE_HEIGHT) / SKYLINE_WIDTH);
  const day = SKYLINE_SHAPES.map((shape, i) => {
    const fill = shape.tone === "ggb" ? NIGHT.ggb : NIGHT.silhouette;
    if (shape.kind === "rect") {
      return React.createElement("rect", {
        key: `d${i}`,
        fill,
        fillOpacity: shape.opacity,
        x: shape.x,
        y: shape.y,
        width: shape.w,
        height: shape.h,
      });
    }
    if (shape.kind === "stroke") {
      return React.createElement("path", {
        key: `d${i}`,
        d: shape.d,
        fill: "none",
        stroke: fill,
        strokeWidth: shape.width,
        strokeOpacity: shape.opacity,
      });
    }
    return React.createElement("path", {
      key: `d${i}`,
      fill,
      fillOpacity: shape.opacity,
      d: shape.d,
    });
  });
  const lights = SKYLINE_NIGHT.map((shape, i) => {
    if (shape.kind === "stroke") {
      return React.createElement("path", {
        key: `n${i}`,
        d: shape.d,
        fill: "none",
        stroke: NIGHT.lamp,
        strokeWidth: shape.width,
        strokeDasharray: "2 1.6",
        strokeOpacity: 0.55,
      });
    }
    if (shape.kind === "dot") {
      return React.createElement("circle", {
        key: `n${i}`,
        cx: shape.x,
        cy: shape.y,
        r: shape.r,
        fill: shape.tone === "beacon" ? NIGHT.beacon : NIGHT.window,
        fillOpacity: shape.tone === "beacon" ? 0.8 : 0.85,
      });
    }
    return React.createElement("rect", {
      key: `n${i}`,
      x: shape.x,
      y: shape.y,
      width: shape.w,
      height: shape.h,
      fill: shape.tone === "crown" ? NIGHT.crown : NIGHT.window,
      fillOpacity: shape.tone === "crown" ? 0.5 : 0.8,
    });
  });
  return React.createElement(
    "svg",
    {
      width,
      height,
      viewBox: SKYLINE_VIEWBOX,
      style: { position: "absolute" as const, bottom: -1, left: 0 },
    },
    ...day,
    ...lights,
  );
}

/**
 * Full-bleed night sky for the share cards: the dark gradient with its
 * ember, the hero's star field, the moon riding over the city, the lit
 * skyline along the bottom edge, and a base fade into the deep. Render as
 * the card's first child; content flows over it.
 */
export function nightSky(width: number, height: number) {
  const scale = width / SKYLINE_WIDTH;
  const moonR = MOON.r * scale;
  const moonX = MOON.x * scale;
  const stripH = SKYLINE_HEIGHT * scale;
  const moonBottom = stripH - MOON.y * scale;
  return React.createElement(
    "div",
    {
      style: {
        position: "absolute" as const,
        top: 0,
        left: 0,
        display: "flex",
        width: "100%",
        height: "100%",
        background: `linear-gradient(180deg, ${NIGHT.skyTop} 0%, ${NIGHT.skyMid} 62%, ${NIGHT.skyLow} 100%)`,
      },
    },
    React.createElement("div", {
      style: {
        position: "absolute" as const,
        left: 0,
        right: 0,
        bottom: 0,
        height: "70%",
        background: `radial-gradient(50% 60% at 91% 100%, ${NIGHT.ember}66, ${NIGHT.ember}00 70%)`,
      },
    }),
    ...STARS.map(([x, y, s, o], i) =>
      React.createElement("div", {
        key: `s${i}`,
        style: {
          position: "absolute" as const,
          left: `${x}%`,
          top: `${(y * 630) / height}%`,
          width: s,
          height: s,
          borderRadius: 999,
          backgroundColor: "#ffffff",
          opacity: o,
        },
      }),
    ),
    // The moon, at the strip's own azimuth, with a soft halo
    React.createElement("div", {
      style: {
        position: "absolute" as const,
        left: moonX - moonR,
        bottom: moonBottom - moonR,
        width: moonR * 2,
        height: moonR * 2,
        borderRadius: 999,
        background: `radial-gradient(circle at 42% 38%, #d9d8cb 0%, #c4cbd8 60%, #aeb8c9 100%)`,
        boxShadow: "0 0 34px 12px rgba(107, 128, 168, 0.30)",
      },
    }),
    nightSkyline(width),
    React.createElement("div", {
      style: {
        position: "absolute" as const,
        left: 0,
        right: 0,
        bottom: 0,
        height: 38,
        background: `linear-gradient(180deg, ${NIGHT.deep}00, ${NIGHT.deep}cc 96%)`,
      },
    }),
  );
}

/**
 * Cloudless sky band with the ember glow, the skyline, and the base haze —
 * the runtime shell of the daylight card family.
 */
export function skyBand(width: number, height: number) {
  return React.createElement(
    "div",
    {
      style: {
        position: "relative" as const,
        display: "flex",
        width: "100%",
        height,
        background: `linear-gradient(180deg, ${DAYLIGHT.skyTop} 0%, ${DAYLIGHT.skyMid} 62%, ${DAYLIGHT.skyLow} 100%)`,
      },
    },
    // Ember at 91%: the dome anchors its glow at azimuth -1.15, 91% across
    // the strip's window
    React.createElement("div", {
      style: {
        position: "absolute" as const,
        left: 0,
        right: 0,
        bottom: 0,
        height: "100%",
        background: `radial-gradient(55% 65% at 91% 100%, ${DAYLIGHT.skyEmber}d9, ${DAYLIGHT.skyEmber}00 70%)`,
      },
    }),
    skyline(width),
    // The base haze: the buildings' feet dissolve into the ground instead of
    // ending on a hard baseline
    React.createElement("div", {
      style: {
        position: "absolute" as const,
        left: 0,
        right: 0,
        bottom: 0,
        height: 44,
        background: `linear-gradient(180deg, ${DAYLIGHT.arc0Clear}, ${DAYLIGHT.arc0} 92%)`,
      },
    }),
  );
}
