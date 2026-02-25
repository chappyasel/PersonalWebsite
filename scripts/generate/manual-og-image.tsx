/**
 * Generate a static OG image for manual.chappyasel.com
 *
 * Usage: npx tsx scripts/generate/manual-og-image.tsx
 *
 * Outputs: public/images/manual-og.png
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
const OUTPUT = join(ROOT, "public/images/manual-og.png");
const FONT_PATH = join(ROOT, "public/fonts/GeorgiaPro-Bold.ttf");

const WIDTH = 1200;
const HEIGHT = 630;

const sections = [
  "Personality & Strengths",
  "Collaboration",
  "Communication",
  "Feedback",
  "Hobbies",
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
      // Book icon + label
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "14px",
          },
        },
        React.createElement(
          "svg",
          { width: "30", height: "30", viewBox: "0 0 256 256", fill: "none" },
          React.createElement("path", {
            d: "M228,48H164a44.06,44.06,0,0,0-36,18.77A44.06,44.06,0,0,0,92,48H32A20,20,0,0,0,12,68V192a20,20,0,0,0,20,20H96a20,20,0,0,1,20,20,12,12,0,0,0,24,0,20,20,0,0,1,20-20h68a20,20,0,0,0,20-20V68A20,20,0,0,0,228,48ZM92,188H36V72H92a20,20,0,0,1,20,20V192.81A43.79,43.79,0,0,0,92,188Zm128,0H164a43.79,43.79,0,0,0-20,4.81V92a20,20,0,0,1,20-20h56Z",
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
          "Personal Operating Manual",
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
        "How I work, communicate, and collaborate",
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
  console.log("Generating manual OG image...");

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
