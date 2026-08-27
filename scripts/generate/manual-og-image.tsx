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

import { DAYLIGHT, skyBand } from "./og-daylight";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = join(__dirname, "../..");
const OUTPUT = join(ROOT, "public/images/manual-og.png");
const FONT_PATH = join(ROOT, "public/fonts/GeorgiaPro-Bold.ttf");
const DATA_PATH = join(ROOT, "public/data/manual.json");

const WIDTH = 1200;
const HEIGHT = 630;
const SKY_HEIGHT = 232;

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

const sections = data.sections.map((s) => shortTitles[s.id] ?? s.title);

function joinWithDots(items: string[], fontSize: number) {
  const children: React.ReactNode[] = [];
  items.forEach((text, i) => {
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
        { key: text, style: { color: DAYLIGHT.label } },
        text,
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
      // Book icon + small-caps label
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "14px" } },
        React.createElement(
          "svg",
          { width: "28", height: "28", viewBox: "0 0 256 256", fill: "none" },
          React.createElement("path", {
            d: "M228,48H164a44.06,44.06,0,0,0-36,18.77A44.06,44.06,0,0,0,92,48H32A20,20,0,0,0,12,68V192a20,20,0,0,0,20,20H96a20,20,0,0,1,20,20,12,12,0,0,0,24,0,20,20,0,0,1,20-20h68a20,20,0,0,0,20-20V68A20,20,0,0,0,228,48ZM92,188H36V72H92a20,20,0,0,1,20,20V192.81A43.79,43.79,0,0,0,92,188Zm128,0H164a43.79,43.79,0,0,0-20,4.81V92a20,20,0,0,1,20-20h56Z",
            fill: DAYLIGHT.pm,
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
          "Personal Operating Manual",
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
      // Subtitle
      React.createElement(
        "div",
        {
          style: {
            fontSize: "31px",
            color: DAYLIGHT.subtitle,
            lineHeight: 1.4,
          },
        },
        "How I work, communicate, and collaborate",
      ),
      // Section labels from the synced data
      joinWithDots(sections, 22),
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
