// Homepage 3D scene label pipeline — rasterises the owner-drawn SVG labels in
// scripts/stacks-labels/ to small webp textures in /public/images/stacks/labels.
//
//   node scripts/stacks-labels.mjs            # rebuild every label
//   node scripts/stacks-labels.mjs realgood   # rebuild one
//
// Why bake rather than draw on a canvas at runtime like the soda cans: the
// SVG is a file a person can open and edit, the result is byte-identical on
// every visitor's machine (canvas text depends on whichever Arial the OS
// has), and a label is a few KB of webp. Fonts are resolved from the system
// at bake time on purpose — the outputs are committed, so only the machine
// running this script needs them.
//
// Labels ship at the size they are authored: each SVG's width/height is the
// texture size, chosen per prop for the face it lands on (a bag front is
// portrait 512×736, the tub's wrap-around strip is 1536×576). Keep authored
// sizes in the same class as the v8 feature photos (512-ish on the short
// side); the props wearing them are about half a world unit across.
import fs from "node:fs";
import path from "node:path";

import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

const SRC = path.join(process.cwd(), "scripts", "stacks-labels");
const OUT = path.join(process.cwd(), "public", "images", "stacks", "labels");
const QUALITY = 84;

const only = process.argv.slice(2);
const files = fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith(".svg"))
  .filter((f) => only.length === 0 || only.includes(f.replace(/\.svg$/, "")));
if (files.length === 0) {
  console.error(`no labels matched ${only.join(", ") || "(all)"} in ${SRC}`);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

for (const file of files) {
  const name = file.replace(/\.svg$/, "");
  const svg = fs.readFileSync(path.join(SRC, file), "utf8");
  const rendered = new Resvg(svg, {
    fitTo: { mode: "original" },
    font: { loadSystemFonts: true, defaultFontFamily: "Arial" },
  }).render();
  const png = rendered.asPng();
  const out = path.join(OUT, `${name}.webp`);
  const webp = await sharp(png).webp({ quality: QUALITY, effort: 6 }).toBuffer();
  fs.writeFileSync(out, webp);
  console.log(
    `${name.padEnd(16)} ${(webp.length / 1024).toFixed(1).padStart(6)} KB  ${rendered.width}x${rendered.height}`,
  );
}
