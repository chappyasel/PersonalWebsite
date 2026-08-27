/**
 * Shared daylight-identity pieces for the routine and manual OG cards.
 *
 * The sky hexes are the main 3D site's authored values from
 * src/app/components/stacks/theme.ts (light set: L36 skyTop #126bb0,
 * L37 skyHorizon #4f8ab3, L38 skyShadow #6a9aba, L39 skyEmber #f5c78d,
 * L49 skyline #5b7288); the ground and accents mirror the tokens in
 * src/styles/daylight.css. OG cards are single static images, so they render
 * the light theme only.
 */
import React from "react";

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

/**
 * The surveyed east-facing skyline from the dome shader, same geometry as
 * src/components/daylight/Skyline.tsx, stretched across the card width.
 */
export function skyline(width: number, height: number) {
  const fill = DAYLIGHT.silhouette;
  return React.createElement(
    "svg",
    {
      width,
      height,
      viewBox: "0 0 640 60",
      preserveAspectRatio: "none",
      style: { position: "absolute" as const, bottom: -1, left: 0 },
    },
    React.createElement("path", {
      fill,
      d: "M0 36 Q28 26 56 31 Q78 34 96 30 Q120 25 144 40 Q160 48 176 52 L176 60 L0 60 Z",
    }),
    React.createElement("path", {
      fill,
      d: "M90 29 L96.5 10.5 L103.5 10.5 L110 29 Z",
    }),
    ...[
      [92, 2.5, 1.7, 9],
      [99.15, 0.5, 1.7, 11],
      [106.3, 2.5, 1.7, 9],
      [91, 10.5, 18, 1.7],
      [92, 5.6, 16, 1.2],
    ].map(([x, y, w, h]) =>
      React.createElement("rect", { fill, x, y, width: w, height: h }),
    ),
    React.createElement("path", { fill, d: "M184 60 Q200 47 216 52 L216 60 Z" }),
    ...[
      [197, 34, 6, 16],
      [196, 32, 8, 3],
      [197.5, 30, 5, 2],
      [228, 46, 14, 14],
      [244, 42, 10, 18],
      [256, 48, 18, 12],
      [276, 44, 12, 16],
    ].map(([x, y, w, h]) =>
      React.createElement("rect", { fill, x, y, width: w, height: h }),
    ),
    React.createElement("path", {
      fill,
      d: "M292 50 L300 17 L308 50 L308 60 L292 60 Z",
    }),
    ...[
      [299.3, 13, 1.4, 5],
      [291.4, 32, 3, 10],
      [305.6, 32, 3, 10],
      [316, 40, 12, 20],
      [330, 36, 9, 24],
      [341, 44, 16, 16],
      [359, 38, 11, 22],
      [372, 46, 14, 14],
      [388, 41, 10, 19],
      [400, 47, 18, 13],
    ].map(([x, y, w, h]) =>
      React.createElement("rect", { fill, x, y, width: w, height: h }),
    ),
    React.createElement("path", {
      fill,
      d: "M429 60 L429 36 C429 24 431 17 434.5 13 L447.5 13 C451 17 452 24 452 36 L452 60 Z",
    }),
    ...[
      [464, 38, 12, 22],
      [505, 46, 135, 2.4],
      [542, 22, 2.2, 38],
      [549, 22, 2.2, 38],
      [541, 24, 11, 2],
      [541, 32, 11, 1.6],
      [541, 40, 11, 1.6],
      [607, 22, 2.2, 38],
      [614, 22, 2.2, 38],
      [606, 24, 11, 2],
      [606, 32, 11, 1.6],
      [606, 40, 11, 1.6],
    ].map(([x, y, w, h]) =>
      React.createElement("rect", { fill, x, y, width: w, height: h }),
    ),
    React.createElement("path", {
      d: "M546.5 23 Q579 41 610.5 23",
      fill: "none",
      stroke: fill,
      strokeWidth: 1.6,
    }),
    React.createElement("path", {
      d: "M546.5 23 Q526 38 507 46",
      fill: "none",
      stroke: fill,
      strokeWidth: 1.4,
    }),
    React.createElement("path", {
      d: "M610.5 23 Q627 36 640 44",
      fill: "none",
      stroke: fill,
      strokeWidth: 1.4,
    }),
    React.createElement("path", { fill, d: "M626 60 Q636 50 640 51 L640 60 Z" }),
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
    skyline(width, 84),
  );
}
