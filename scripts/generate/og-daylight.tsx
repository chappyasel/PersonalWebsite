/**
 * Shared daylight-identity pieces for the routine and manual OG cards.
 *
 * The sky hexes are the main 3D site's authored values from
 * src/app/components/stacks/theme.ts (light set: L36 skyTop #126bb0,
 * L37 skyHorizon #4f8ab3, L38 skyShadow #6a9aba, L39 skyEmber #f5c78d,
 * L49 skyline #5b7288); the ground and accents mirror the tokens in
 * src/styles/daylight.css, and the skyline renders the same surveyed
 * geometry the pages use (src/components/daylight/skylineGeometry.ts).
 * OG cards are single static images, so they render the light theme only.
 */
import React from "react";

import {
  SKYLINE_SHAPES,
  SKYLINE_VIEWBOX,
} from "../../src/components/daylight/skylineGeometry";

export const DAYLIGHT = {
  skyTop: "#126bb0",
  skyMid: "#4f8ab3",
  skyLow: "#6a9aba",
  skyEmber: "#f5c78d",
  silhouette: "#5b7288",
  arc0: "hsl(26, 18%, 94%)",
  arc1: "hsl(46, 24%, 96%)",
  arc2: "hsl(60, 9%, 98%)",
  am: "hsl(35, 48%, 38%)",
  pm: "hsl(228, 20%, 44%)",
  fg: "hsl(25, 6%, 32%)",
  label: "hsl(25, 5%, 50%)",
  subtitle: "hsl(25, 5%, 45%)",
} as const;

/** The surveyed skyline, stretched across the card width. */
export function skyline(width: number, height: number) {
  const fill = DAYLIGHT.silhouette;
  return React.createElement(
    "svg",
    {
      width,
      height,
      viewBox: SKYLINE_VIEWBOX,
      preserveAspectRatio: "none",
      style: { position: "absolute" as const, bottom: -1, left: 0 },
    },
    ...SKYLINE_SHAPES.map((shape, i) => {
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

/** Sky band with the ember glow and skyline, spanning the card width. */
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
    // Ember glow between Salesforce and the bridge
    React.createElement("div", {
      style: {
        position: "absolute" as const,
        left: 0,
        right: 0,
        bottom: 0,
        height: "100%",
        background: `radial-gradient(55% 65% at 76% 100%, ${DAYLIGHT.skyEmber}d9, ${DAYLIGHT.skyEmber}00 70%)`,
      },
    }),
    // 52 * (1200/1440) keeps the geometry at true proportions on the card
    skyline(width, 44),
  );
}
