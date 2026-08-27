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
import React from "react";

import {
  SKYLINE_HEIGHT,
  SKYLINE_SHAPES,
  SKYLINE_VIEWBOX,
  SKYLINE_WIDTH,
} from "../../components/daylight/skylineGeometry";

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
