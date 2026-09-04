/**
 * Generate a static OG image for the routine page
 *
 * Usage: npx tsx scripts/generate/routine-og.ts
 *
 * Outputs: public/images/routine-og.png
 */
import { NIGHT, nightSky } from "../../src/lib/og/daylight";
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import React from "react";
import satori from "satori";
import { fileURLToPath } from "url";

import { sectionLabelRows } from "./og-section-glyph";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = join(__dirname, "../..");
const OUTPUT = join(ROOT, "public/images/routine-og.png");
const FONT_PATH = join(ROOT, "public/fonts/GeorgiaPro-Bold.ttf");
const DATA_PATH = join(ROOT, "public/data/routine.json");

const WIDTH = 1200;
const HEIGHT = 630;

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

const sections: { id: string; text: string }[] = [
  { id: "why-early", text: "Why So Early?" },
  { id: "morning", text: "Morning" },
  { id: "evening", text: "Evening" },
  { id: "supp-stacks", text: "Supp Stacks" },
  ...data.rants
    .filter((r) => r.id !== "supp-stacks")
    .map((r) => ({ id: r.id, text: rantLabels[r.id] ?? r.title })),
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
          { key: `dot-${i}`, style: { color: NIGHT.inkFaint } },
          "·",
        ),
      );
    }
    children.push(
      React.createElement(
        "span",
        { key: item.text, style: { color: item.color ?? NIGHT.inkFaint } },
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
        fontFamily: "Georgia Pro",
      },
    },
    nightSky(WIDTH, HEIGHT),
    // Content rides high in the sky; the skyline keeps the bottom.
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "92px",
          gap: "24px",
        },
      },
      React.createElement(
        "div",
        {
          style: {
            fontSize: "23px",
            fontWeight: 700,
            color: NIGHT.inkMuted,
            letterSpacing: "0.34em",
            textTransform: "uppercase" as const,
          },
        },
        "Chappy Asel",
      ),
      React.createElement(
        "div",
        {
          style: {
            fontSize: "84px",
            fontWeight: 700,
            color: NIGHT.ink,
            letterSpacing: "-0.015em",
            lineHeight: 1,
          },
        },
        "Core Daily Routine",
      ),
      // A short ember rule instead of a tilde
      React.createElement("div", {
        style: {
          width: "68px",
          height: "3px",
          borderRadius: "2px",
          backgroundColor: NIGHT.ember,
          opacity: 0.75,
          marginTop: "6px",
          marginBottom: "8px",
        },
      }),
      // Schedule beats, tinted by arm of the day. Repeated by hand from the
      // synced routine; routine.data.test.ts fails when they drift.
      joinWithDots(
        [
          { text: "3:45am wake", color: NIGHT.am },
          { text: "6:15am lift", color: NIGHT.am },
          { text: "9:15pm sleep", color: NIGHT.pm },
        ],
        30,
      ),
      // Section labels from the synced data as two centred rows, each label
      // behind the glyph the page gives that section
      sectionLabelRows(sections, { fontSize: 24, glyphSize: 25 }),
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
