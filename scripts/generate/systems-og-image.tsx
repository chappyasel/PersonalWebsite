/**
 * Generate a static OG image for /systems
 *
 * Usage: npx tsx scripts/generate/systems-og-image.tsx
 *
 * Outputs: public/images/systems-og.png
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
const OUTPUT = join(ROOT, "public/images/systems-og.png");
const FONT_PATH = join(ROOT, "public/fonts/GeorgiaPro-Bold.ttf");
const DATA_PATH = join(ROOT, "public/data/systems.json");

const WIDTH = 1200;
const HEIGHT = 630;

/**
 * The seven layer labels come from the synced data so they can never drift
 * from the live page; the glyph beside each is the one the page gives it.
 */
const data = JSON.parse(readFileSync(DATA_PATH, "utf-8")) as {
  sections: { id: string; layers?: { id: string; title: string }[] }[];
};

const layers = (data.sections.find((s) => s.layers)?.layers ?? []).map(
  (l) => ({ id: l.id, text: l.title }),
);

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
        "Personal Systems",
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
        "Seven layers, from foundations to tools",
      ),
      // The seven layers as two centred rows (4 + 3), each label behind the
      // glyph the page gives that layer
      sectionLabelRows(layers, { fontSize: 21, glyphSize: 22, gap: "26px" }),
    ),
  );
}

async function main() {
  console.log("Generating systems OG image...");

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
