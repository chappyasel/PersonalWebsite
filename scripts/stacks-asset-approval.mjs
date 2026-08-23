// Build review-only contact sheets for homepage source assets. This never
// writes to public/models: an externally sourced model must be approved before
// it enters the shipped manifest or the live scene.
//
// 2026-08-22 round: the Gay Head lighthouse that replaced the Musings
// sailboat. "Source" is Robert Mirabelle's GLB exactly as downloaded (grey
// plain materials, 11,762 triangles); "scene-ready" is the BUILT
// public/models/lighthouse.glb — the pipeline's rematerial/drop/decimate
// output, whose baked placeholder colours are the Gay Head palette the
// runtime tints refine. The 2026-08-15 round (sailboat, phone, notebook,
// harmonica) is in git history at that date.
//
//   node scripts/stacks-asset-approval.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const MODELS = path.join(ROOT, "public", "models");
const OUT = path.join(
  ROOT,
  "docs",
  "research",
  "assets",
  "2026-08-22-lighthouse-approval",
);
const NAME = "lighthouse";
const SOURCE_URL =
  "https://static.poly.pizza/8200c7f5-9b4b-4f92-a9aa-0ca5d8ff9121.glb";

function render(name, file) {
  const link = path.join(MODELS, `${name}.glb`);
  if (fs.existsSync(link)) {
    throw new Error(`Refusing to replace existing ${link}`);
  }
  fs.symlinkSync(file, link);
  try {
    execFileSync(
      "node",
      [
        "scripts/stacks-render.mjs",
        name,
        "--yaws",
        "0,90,180",
        "--pitch",
        "0.08",
      ],
      { cwd: ROOT, stdio: "inherit" },
    );
  } finally {
    fs.unlinkSync(link);
  }
  return path.join(os.tmpdir(), "stacks-render", `${name}.png`);
}

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "stacks-approval-"));
  const source = path.join(temp, `${NAME}-source.glb`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  fs.writeFileSync(source, Buffer.from(await response.arrayBuffer()));
  const ready = path.join(MODELS, `${NAME}.glb`);
  if (!fs.existsSync(ready))
    throw new Error(`Build ${ready} first (node scripts/stacks-models.mjs)`);

  fs.mkdirSync(OUT, { recursive: true });
  const sourcePng = render(`approval-${NAME}-source`, source);
  const readyPng = render(`approval-${NAME}-ready`, ready);
  await sharp(sourcePng)
    .png()
    .toFile(path.join(OUT, `${NAME}-source-angles.png`));
  await sharp(readyPng)
    .png()
    .toFile(path.join(OUT, `${NAME}-scene-ready-angles.png`));

  // Light/dark palette-field context: the scene-ready strip knocked out of
  // its white ground and laid on the two theme swatches.
  const resized = await sharp(readyPng)
    .resize({ width: 840 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < resized.data.length; i += 4) {
    if (
      resized.data[i] > 250 &&
      resized.data[i + 1] > 250 &&
      resized.data[i + 2] > 250
    ) {
      resized.data[i + 3] = 0;
    }
  }
  const strip = await sharp(resized.data, {
    raw: { ...resized.info, channels: 4 },
  })
    .png()
    .toBuffer();
  const field = (background) =>
    sharp({
      create: { width: 900, height: 330, channels: 3, background },
    })
      .composite([{ input: strip, left: 30, top: 20 }])
      .png()
      .toBuffer();
  const [light, dark] = await Promise.all([field("#b9c8c2"), field("#17212b")]);
  await sharp({
    create: { width: 900, height: 660, channels: 3, background: "#ffffff" },
  })
    .composite([
      { input: light, left: 0, top: 0 },
      { input: dark, left: 0, top: 330 },
    ])
    .png()
    .toFile(path.join(OUT, `${NAME}-light-dark-context.png`));
  console.log(`Approval renders written to ${OUT}`);
}

await main();
