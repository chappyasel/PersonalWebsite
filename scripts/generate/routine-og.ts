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

import { DAYLIGHT, skyBand } from "./og-daylight";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = join(__dirname, "../..");
const OUTPUT = join(ROOT, "public/images/routine-og.png");
const FONT_PATH = join(ROOT, "public/fonts/GeorgiaPro-Bold.ttf");
const DATA_PATH = join(ROOT, "public/data/routine.json");

const WIDTH = 1200;
const HEIGHT = 630;
const SKY_HEIGHT = 232;

/**
 * The label row mirrors the live page's TOC exactly: the fixed sections, then
 * the rants in synced order under the same short labels page.tsx uses.
 */
const rantLabels: Record<string, string> = {
  "sinusoidal-vs-square-wave-alertness": "Alertness",
  caffeine: "Caffeine",
  "sleep-duration": "Sleep",
  "getting-back-on-track": "Recovery",
};

const data = JSON.parse(readFileSync(DATA_PATH, "utf-8")) as {
  rants: { id: string; title: string }[];
};

const sections = [
  "Why So Early?",
  "Morning",
  "Evening",
  "Supp Stacks",
  ...data.rants
    .filter((r) => r.id !== "supp-stacks")
    .map((r) => rantLabels[r.id] ?? r.title),
];

function joinWithDots(
  items: { text: string; color?: string }[],
  fontSize: number,
) {
  const children: React.ReactNode[] = [];
  items.forEach((item, i) => {
    if (i > 0) {
      children.push(
        React.createElement(
          "span",
          { key: `dot-${i}`, style: { color: "hsl(25, 5%, 65%)" } },
          "·",
        ),
      );
    }
    children.push(
      React.createElement(
        "span",
        { key: item.text, style: { color: item.color ?? DAYLIGHT.label } },
        item.text,
      ),
    );
  });
  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "14px",
        fontSize: `${fontSize}px`,
      },
    },
    ...children,
  );
}

function OGImage() {
  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: `linear-gradient(180deg, ${DAYLIGHT.arc0} 0%, ${DAYLIGHT.arc1} 45%, ${DAYLIGHT.arc2} 100%)`,
        fontFamily: "Georgia Pro",
      },
    },
    skyBand(WIDTH, SKY_HEIGHT),
    // Ground content
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flex: 1,
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "26px",
        },
      },
      // Sun icon + small-caps label
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "14px" } },
        React.createElement(
          "svg",
          { width: "28", height: "28", viewBox: "0 0 256 256", fill: "none" },
          React.createElement("path", {
            d: "M128,40a12,12,0,0,1,12-12h0a12,12,0,0,1,12,12V52a12,12,0,0,1-12,12h0A12,12,0,0,1,128,52ZM60,128a68,68,0,1,0,68-68A68.07,68.07,0,0,0,60,128Zm24,0a44,44,0,1,1,44,44A44.05,44.05,0,0,1,84,128ZM40,116H28a12,12,0,0,0,0,24H40a12,12,0,0,0,0-24Zm88,88a12,12,0,0,0-12,12v12a12,12,0,0,0,24,0V216A12,12,0,0,0,128,204Zm88-88H204a12,12,0,0,0,0,24h12a12,12,0,0,0,0-24ZM59.76,68.24a12,12,0,1,0,17-17l-8.48-8.48a12,12,0,0,0-17,17Zm0,119.52-8.48,8.48a12,12,0,0,0,17,17l8.48-8.48a12,12,0,1,0-17-17Zm136.48,0a12,12,0,0,0-17,17l8.48,8.48a12,12,0,0,0,17-17Zm0-119.52,8.48-8.48a12,12,0,0,0-17-17l-8.48,8.48a12,12,0,0,0,17,17Z",
            fill: DAYLIGHT.am,
          }),
        ),
        React.createElement(
          "span",
          {
            style: {
              fontSize: "25px",
              fontWeight: 700,
              color: DAYLIGHT.label,
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
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
            fontSize: "112px",
            fontWeight: 700,
            color: DAYLIGHT.fg,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          },
        },
        "Chappy Asel",
      ),
      // Schedule beats, tinted by arm of the day
      joinWithDots(
        [
          { text: "3:45am wake", color: DAYLIGHT.am },
          { text: "6:00am lift", color: DAYLIGHT.am },
          { text: "9:15pm sleep", color: DAYLIGHT.pm },
        ],
        31,
      ),
      // Section labels from the synced data
      joinWithDots(
        sections.map((s) => ({ text: s })),
        22,
      ),
    ),
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
