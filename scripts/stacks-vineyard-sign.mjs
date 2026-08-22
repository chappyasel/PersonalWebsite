// Homepage scene: die-cut the Martha's Vineyard town-mileage sign out of the
// owner-supplied product photo (a framed print on a white mat) and write it
// as an alpha-masked texture for the signpost prop in Musings.
//
//   node scripts/stacks-vineyard-sign.mjs [--source <file>]
//
// Default source: ~/Desktop/il_fullxfull.4714019740_27wx.avif (not committed;
// the shipped output is the sign face alone). Method: crop inside the frame,
// flood-fill the mat from the border to alpha 0 with a one-pixel feather,
// trim to the sign's box, resize to 640 wide.
//
// The catch, measured: the sign's cream panel is NOT enclosed — its left and
// right sides meet the mat directly — and mat and panel are within a few
// levels of each other in brightness (mat 237–255 neutral, panel 249/244/238
// warm). A brightness threshold leaks straight into the panel. What
// separates them is temperature: the mat and the print's drop shadow are
// neutral-to-bluish (b ≥ r), the panel and medallion interior are warm
// (r − b ≈ 11). So "mat" = bright AND not warm, and the fill is still by
// connectivity so a warm-ish speck in the mat cannot survive on its own.
// Output: public/images/stacks/musings/vineyard-sign.webp (+ a grey-backed
// preview in the OS temp dir for a look).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const args = process.argv.slice(2);
const srcArg = args.indexOf("--source");
const SRC =
  srcArg === -1
    ? path.join(os.homedir(), "Desktop/il_fullxfull.4714019740_27wx.avif")
    : args[srcArg + 1];
const OUT_WEBP = path.join(
  process.cwd(),
  "public/images/stacks/musings/vineyard-sign.webp",
);
const OUT_PREVIEW = path.join(
  os.tmpdir(),
  "stacks-render",
  "vineyard-sign-preview.png",
);
// Decode at full size; crop to the mat interior (inside the grey frame).
fs.mkdirSync(path.dirname(OUT_PREVIEW), { recursive: true });
const meta = await sharp(SRC).metadata();
const W = meta.width,
  H = meta.height;
// Crop just inside the frame's inner bevel (measured on the 1966×1728
// source: mat from x 150–1830, y 150–1600; the medallion's top sits only a
// few pixels below the bevel, so the top is tight).
const crop = {
  left: Math.round(W * 0.0814),
  top: Math.round(H * 0.0943),
  width: Math.round(W * 0.8444),
  height: Math.round(H * 0.8258),
};
const { data, info } = await sharp(SRC)
  .extract(crop)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const w = info.width,
  h = info.height;
const isMat = (i) =>
  Math.min(data[i], data[i + 1], data[i + 2]) >= 150 &&
  data[i] - data[i + 2] <= 5;
// Flood fill from the border: mark mat pixels (connected white) as outside.
const outside = new Uint8Array(w * h);
const stack = [];
for (let x = 0; x < w; x++) {
  stack.push(x, (h - 1) * w + x);
}
for (let y = 0; y < h; y++) {
  stack.push(y * w, y * w + w - 1);
}
while (stack.length) {
  const p = stack.pop();
  if (outside[p]) continue;
  if (!isMat(p * 4)) continue;
  outside[p] = 1;
  const x = p % w,
    y = (p - x) / w;
  if (x > 0) stack.push(p - 1);
  if (x < w - 1) stack.push(p + 1);
  if (y > 0) stack.push(p - w);
  if (y < h - 1) stack.push(p + w);
}
// If the crop still clips the frame, the border will not all be mat, and the
// frame would survive as grey bars around the sign. Say so loudly.
let borderKept = 0;
for (let x = 0; x < w; x++) {
  if (!outside[x]) borderKept++;
  if (!outside[(h - 1) * w + x]) borderKept++;
}
for (let y = 0; y < h; y++) {
  if (!outside[y * w]) borderKept++;
  if (!outside[y * w + w - 1]) borderKept++;
}
console.log(
  `border pixels kept (should be ~0): ${borderKept} of ${2 * (w + h)}`,
);
// Alpha: outside → 0, with a 1px feather using neighbor count.
let minX = w,
  minY = h,
  maxX = 0,
  maxY = 0;
const alpha = new Uint8Array(w * h);
for (let p = 0; p < w * h; p++) {
  if (outside[p]) {
    alpha[p] = 0;
    continue;
  }
  const x = p % w,
    y = (p - x) / w;
  let n = 0,
    o = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx,
        yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      n++;
      if (outside[yy * w + xx]) o++;
    }
  alpha[p] = Math.round(255 * (1 - (o / n) * 0.6));
  if (x < minX) minX = x;
  if (x > maxX) maxX = x;
  if (y < minY) minY = y;
  if (y > maxY) maxY = y;
}
for (let p = 0; p < w * h; p++) data[p * 4 + 3] = alpha[p];
const pad = 6;
const box = {
  left: Math.max(0, minX - pad),
  top: Math.max(0, minY - pad),
  width: Math.min(w, maxX + pad) - Math.max(0, minX - pad),
  height: Math.min(h, maxY + pad) - Math.max(0, minY - pad),
};
console.log(
  "sign bbox",
  box,
  "aspect h/w",
  (box.height / box.width).toFixed(4),
);
const img = sharp(data, { raw: { width: w, height: h, channels: 4 } }).extract(
  box,
);
const webp = await img
  .clone()
  .resize({ width: 640 })
  .webp({ quality: 86, alphaQuality: 90 })
  .toFile(OUT_WEBP);
console.log("webp", webp.width, webp.height, webp.size);
await img
  .clone()
  .resize({ width: 800 })
  .flatten({ background: "#7f7f7f" })
  .png()
  .toFile(OUT_PREVIEW);
