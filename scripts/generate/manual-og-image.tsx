/**
 * Generate a static OG image for manual.chappyasel.com
 *
 * Usage: npx tsx scripts/generate/manual-og-image.tsx
 *
 * Outputs: public/images/manual-og.png
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
const OUTPUT = join(ROOT, "public/images/manual-og.png");
const FONT_PATH = join(ROOT, "public/fonts/GeorgiaPro-Bold.ttf");
const DATA_PATH = join(ROOT, "public/data/manual.json");

const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Section labels come from the synced data so they can never drift from the
 * live page. The one long personality title gets the same kind of compression
 * the reader does when scanning the page.
 */
const shortTitles: Record<string, string> = {
  "personality-strengths-blind-spots": "Personality & Strengths",
};

const data = JSON.parse(readFileSync(DATA_PATH, "utf-8")) as {
  sections: { id: string; title: string }[];
};

const sections = data.sections.map((s) => ({
  id: s.id,
  text: shortTitles[s.id] ?? s.title,
}));

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
            fontSize: "76px",
            fontWeight: 700,
            color: NIGHT.ink,
            letterSpacing: "-0.015em",
            lineHeight: 1,
          },
        },
        "Personal Operating Manual",
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
      React.createElement(
        "div",
        {
          style: {
            fontSize: "29px",
            color: NIGHT.inkMuted,
            lineHeight: 1.4,
          },
        },
        "How I work, communicate, and collaborate",
      ),
      // Section labels from the synced data as two centred rows, each label
      // behind the glyph the page gives that section
      sectionLabelRows(sections, { fontSize: 24, glyphSize: 25 }),
    ),
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
