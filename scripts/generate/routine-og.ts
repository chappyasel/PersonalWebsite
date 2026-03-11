/**
 * Generate a static OG image for the routine page
 *
 * Usage: npx tsx scripts/generate/routine-og.ts
 *
 * Outputs: public/images/routine-og.png
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import React from "react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = join(__dirname, "../..");
const OUTPUT = join(ROOT, "public/images/routine-og.png");
const FONT_PATH = join(ROOT, "public/fonts/GeorgiaPro-Bold.ttf");

const WIDTH = 1200;
const HEIGHT = 630;

const sections = [
  "Morning Routine",
  "Evening Routine",
  "Supplements",
  "Sleep",
  "Caffeine",
];

const LABEL_COLOR = "hsl(25, 5%, 50%)";

function OGImage() {
  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        width: "100%",
        height: "100%",
        backgroundColor: "hsl(60, 9%, 98%)",
        position: "relative",
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      },
    },
    // Main content - single centered column
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "28px",
        },
      },
      // Sun icon + label
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "14px",
          },
        },
        // Sun/sunrise SVG icon (Phosphor sun icon style)
        React.createElement(
          "svg",
          { width: "30", height: "30", viewBox: "0 0 256 256", fill: "none" },
          React.createElement("path", {
            d: "M128,40a12,12,0,0,1,12-12h0a12,12,0,0,1,12,12V52a12,12,0,0,1-12,12h0A12,12,0,0,1,128,52ZM60,128a68,68,0,1,0,68-68A68.07,68.07,0,0,0,60,128Zm24,0a44,44,0,1,1,44,44A44.05,44.05,0,0,1,84,128ZM40,116H28a12,12,0,0,0,0,24H40a12,12,0,0,0,0-24Zm88,88a12,12,0,0,0-12,12v12a12,12,0,0,0,24,0V216A12,12,0,0,0,128,204Zm88-88H204a12,12,0,0,0,0,24h12a12,12,0,0,0,0-24ZM59.76,68.24a12,12,0,1,0,17-17l-8.48-8.48a12,12,0,0,0-17,17Zm0,119.52-8.48,8.48a12,12,0,0,0,17,17l8.48-8.48a12,12,0,1,0-17-17Zm136.48,0a12,12,0,0,0-17,17l8.48,8.48a12,12,0,0,0,17-17Zm0-119.52,8.48-8.48a12,12,0,0,0-17-17l-8.48,8.48a12,12,0,0,0,17,17Z",
            fill: LABEL_COLOR,
          }),
        ),
        React.createElement(
          "span",
          {
            style: {
              fontSize: "26px",
              fontWeight: 700,
              color: LABEL_COLOR,
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              fontFamily: "Georgia Pro",
            },
          },
          "Core Daily Routine",
        ),
      ),
      // Name
      React.createElement(
        "div",
        {
          style: {
            fontSize: "120px",
            fontWeight: 700,
            color: "hsl(25, 5%, 38%)",
            letterSpacing: "-0.02em",
            lineHeight: 1,
            fontFamily: "Georgia Pro",
          },
        },
        "Chappy Asel",
      ),
      // Subtitle
      React.createElement(
        "div",
        {
          style: {
            fontSize: "34px",
            color: "hsl(25, 5%, 55%)",
            lineHeight: 1.4,
            fontFamily: "Georgia Pro",
          },
        },
        "3:45am wake \u00b7 6:00am lift \u00b7 9:15pm sleep",
      ),
      // Section pills
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexWrap: "wrap" as const,
            justifyContent: "center",
            gap: "12px",
            marginTop: "8px",
          },
        },
        ...sections.map((s) =>
          React.createElement(
            "div",
            {
              key: s,
              style: {
                fontSize: "22px",
                color: LABEL_COLOR,
                backgroundColor: "rgba(92, 87, 84, 0.08)",
                padding: "10px 24px",
                borderRadius: "24px",
                fontFamily: "Georgia Pro",
              },
            },
            s,
          ),
        ),
      ),
    ),
    // Bottom border accent
    React.createElement("div", {
      style: {
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "100%",
        height: "4px",
        display: "flex",
        background:
          "linear-gradient(90deg, hsl(25, 5%, 75%), hsl(25, 5%, 45%), hsl(25, 5%, 75%))",
      },
    }),
  );
}

async function main() {
  console.log("Generating routine OG image...");

  const fontData = readFileSync(FONT_PATH);

  const svg = await satori(React.createElement(OGImage), {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      {
        name: "Georgia Pro",
        data: fontData,
        weight: 700,
        style: "normal",
      },
    ],
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: WIDTH },
  });
  const png = resvg.render().asPng();

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, png);

  console.log(`Written to ${OUTPUT} (${(png.length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
