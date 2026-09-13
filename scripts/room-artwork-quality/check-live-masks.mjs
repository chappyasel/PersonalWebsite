import {
  ABOUT_BOOT_STAGE_GEOMETRY,
  aboutBootStageForViewport,
} from "../../src/app/components/stacks/boot/aboutBootStage.ts";
import { artworkFrame } from "../../src/app/components/stacks/illustration/artworkFrame.ts";
import { RAIL_RIGHT_PX_FALLBACK } from "../../src/app/components/stacks/scene/worldLayout.ts";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import sharp from "sharp";

// Run from the checkout root with pnpm exec tsx. This uses committed fresh
// owner masks, current display geometry, and the final served SVGs. No browser.
const candidate = process.cwd();
const captures = `${candidate}/scripts/generate/room-artwork-inputs/quality`;
const output = process.argv.find((arg) => arg.startsWith("--out="))?.slice(6);
const catalog = JSON.parse(
  await fs.readFile(
    `${candidate}/src/app/components/stacks/illustration/artwork/catalog.json`,
    "utf8",
  ),
);
function distance(mask, width, height) {
  const d = new Uint16Array(mask.length);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : 60000;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y) d[i] = Math.min(d[i], d[i - width] + 1);
    }
  for (let y = height - 1; y >= 0; y--)
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (x + 1 < width) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y + 1 < height) d[i] = Math.min(d[i], d[i + width] + 1);
    }
  return d;
}
const alpha = (data) =>
  Uint8Array.from({ length: data.length / 4 }, (_, i) =>
    data[i * 4 + 3] >= 128 ? 1 : 0,
  );
// librsvg omits embedded WebP. Decode it to identical PNG pixels for this
// offline mask check; the served file remains SVG with embedded WebP.
async function pngDetails(svg) {
  const cache = new Map();
  for (const match of svg.matchAll(/href="data:image\/webp;base64,([^"]+)"/g)) {
    if (!cache.has(match[0])) {
      const png = await sharp(Buffer.from(match[1], "base64")).png().toBuffer();
      cache.set(
        match[0],
        `href="data:image/png;base64,${png.toString("base64")}"`,
      );
    }
  }
  for (const [from, to] of cache) svg = svg.replaceAll(from, to);
  return svg;
}
const results = [];
for (const [key, source] of Object.entries(catalog)) {
  const stem = `${source.unit}/${source.theme}-${source.viewport}`;
  const capture = JSON.parse(
    await fs.readFile(`${captures}/${stem}/capture.json`, "utf8"),
  );
  const svg = await fs.readFile(
    `${candidate}/public/images/stacks/boot/${stem}.svg`,
    "utf8",
  );
  const groups = new Map(
    [...svg.matchAll(/<g data-part="([^"]+)"[^>]*>[\s\S]*?<\/g>/g)].map((m) => [
      m[1],
      m[0],
    ]),
  );
  assert.equal(
    groups.size,
    capture.owners.length + 1,
    `${stem}: owner set mismatch`,
  );
  const [viewportWidth, viewportHeight] =
    source.viewport === "phone" ? [390, 844] : [1440, 900];
  const frame = artworkFrame(
    source,
    aboutBootStageForViewport(
      viewportWidth,
      viewportHeight,
      RAIL_RIGHT_PX_FALLBACK,
      ABOUT_BOOT_STAGE_GEOMETRY,
      source.unitIndex,
    ),
    viewportWidth,
    viewportHeight,
  );
  const cssScale = frame.width / source.viewBox[2];
  const owners = [];
  for (const owner of capture.owners) {
    const group = groups.get(owner.id);
    assert.ok(group, `Missing ${stem}/${owner.id}`);
    const [x, y, width, height] = owner.box;
    const input = await sharp(`${captures}/${stem}/${owner.images.mask}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(input.info.width, width * capture.scale);
    assert.equal(input.info.height, height * capture.scale);
    const isolated = `<svg xmlns="http://www.w3.org/2000/svg" width="${input.info.width}" height="${input.info.height}" viewBox="${x} ${y} ${width} ${height}">${await pngDetails(group)}</svg>`;
    const rendered = await sharp(Buffer.from(isolated))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.deepEqual(
      rendered.info,
      input.info,
      `${stem}/${owner.id}: crop dimensions`,
    );
    const a = alpha(input.data),
      b = alpha(rendered.data);
    const da = distance(a, input.info.width, input.info.height),
      db = distance(b, input.info.width, input.info.height);
    let max = 0,
      lost = 0,
      added = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i]) max = Math.max(max, db[i]);
      if (b[i]) max = Math.max(max, da[i]);
      if (a[i] && !b[i]) lost++;
      if (b[i] && !a[i]) added++;
    }
    owners.push({
      id: owner.id,
      maxCssPxManhattan: (max / capture.scale) * cssScale,
      lostPixels: lost,
      addedPixels: added,
    });
  }
  const result = {
    key,
    owners,
    maxCssPxManhattan: Math.max(
      ...owners.map((owner) => owner.maxCssPxManhattan),
    ),
  };
  results.push(result);
  console.log(
    key,
    result.maxCssPxManhattan.toFixed(3),
    owners.filter((owner) => owner.maxCssPxManhattan > 3),
  );
}
if (output) await fs.writeFile(output, JSON.stringify(results, null, 2) + "\n");
assert.ok(
  results.every((result) => result.maxCssPxManhattan <= 3),
  "Final owners deviate from their fresh live masks by more than 3 CSS pixels",
);
console.log(
  `Passed ${results.length} variants and ${results.reduce((sum, result) => sum + result.owners.length, 0)} fresh-owner comparisons.`,
);
