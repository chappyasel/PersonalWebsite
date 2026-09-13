import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

import { transferPixels } from "./color-transfer.mjs";

const [unit = "books", label = "light-desktop"] = process.argv.slice(2);
const root = "scripts/generate/room-artwork-inputs";
const file = `display-colors/${unit}/${label}.json`;
const bytes = await readFile(`${root}/${file}`);
const calibration = JSON.parse(bytes);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const manifest = JSON.parse(await readFile(`${root}/manifest.json`));
const entry = manifest.cases.find((c) => c.unit === unit && c.label === label);
const source = await readFile(`${root}/${entry.inputSvg}`, "utf8");
assert.equal(
  hash(source),
  calibration.sourceSvgSha256,
  "Apply color calibration to the unchanged quality output, never an already corrected image",
);
let index = 0;
let output = source.replace(/<(path|polygon|image)\s[^>]*\/>/g, (tag) => {
  const correction = calibration.corrections[index++];
  assert.equal(correction.index, index);
  if (!correction.fill) return tag;
  const fill = tag.match(/fill="([^"]+)"/)[1];
  return tag.replaceAll(fill, correction.fill);
});
for (const c of calibration.corrections.filter((c) => c.gradient))
  output = output.replace(c.gradient.before, c.gradient.after);
for (const c of calibration.corrections.filter((c) => c.curves)) {
  const tag = [...source.matchAll(/<(path|polygon|image)\s[^>]*\/>/g)][
    c.index - 1
  ][0];
  const href = tag.match(/href="([^"]+)"/)[1];
  const detail = entry.details.find((d) => d.href === href);
  assert.equal(
    detail.sha256,
    c.sourceSha256,
    "Detail changed before color correction",
  );
  const original = await readFile(`${root}/${detail.file}`);
  assert.equal(hash(original), c.sourceSha256, "Source detail bytes changed");
  const { data, info } = await sharp(original)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const corrected = await sharp(transferPixels(data, c.curves), { raw: info })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
  const sha256 = hash(corrected);
  const file = `details/${sha256}.webp`;
  await writeFile(`${root}/${file}`, corrected);
  Object.assign(detail, { file, sha256, bytes: corrected.length });
}
await writeFile(`${root}/${entry.inputSvg}`, output);
entry.svgSha256 = hash(output);
entry.displayColorCalibration = { file, sha256: hash(bytes) };
await writeFile(
  `${root}/manifest.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("APPLIED DISPLAY COLORS", unit, label);
