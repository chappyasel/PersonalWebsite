import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

import {
  channelValue,
  fitChannel,
  labelColor,
  labelHex,
  pixelColor,
  transferPixels,
} from "./color-transfer.mjs";

const [unit = "books", label = "light-desktop"] = process.argv.slice(2);
const root = "scripts/generate/room-artwork-inputs";
const folder = `/tmp/room-artwork-display/${unit}/${label}`;
const manifest = JSON.parse(await readFile(`${root}/manifest.json`));
const entry = manifest.cases.find((c) => c.unit === unit && c.label === label);
const contract = JSON.parse(await readFile(`${root}/${entry.inputCapture}`));
const source = await readFile(`${root}/${entry.inputSvg}`, "utf8");
const capture = JSON.parse(await readFile(`${folder}/display.json`));
const hash = (b) => createHash("sha256").update(b).digest("hex");
if (entry.displayColorCalibration) {
  const previous = JSON.parse(
    await readFile(`${root}/${entry.displayColorCalibration.file}`),
  );
  assert.equal(
    hash(source),
    previous.sourceSvgSha256,
    "Restore the frozen quality output with package.mjs before fitting colors again",
  );
}
assert.deepEqual(
  capture.metadata.savedCamera,
  contract.camera,
  "Reference camera differs from the approved projection",
);
assert.deepEqual(
  capture.metadata.canvas,
  contract.raster,
  "Reference is not on the contract pixel grid",
);
assert.deepEqual(
  capture.metadata.owners,
  contract.owners.map((o, i) => ({ id: o.id, code: labelColor(i + 1) })),
  "Reference owner inventory differs",
);
if (capture.contractSha256)
  assert.equal(capture.contractSha256, entry.captureSha256);
const attr = (tag) =>
  Object.fromEntries(
    [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
  );
const elements = [];
let painted = source;
let original = source;
for (const group of source.matchAll(
  /<g data-part="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g,
)) {
  let body = group[2],
    originalBody = body;
  for (const match of group[2].matchAll(/<(path|polygon|image)\s[^>]*\/>/g)) {
    const tag = match[0],
      attrs = attr(tag),
      index = elements.length + 1;
    const element = { owner: group[1], index, type: match[1], tag, attrs };
    let replacement;
    if (element.type === "image") {
      const detail = entry.details.find((d) => d.href === attrs.href);
      assert.ok(detail, "Missing texture reference");
      const bytes = await readFile(`${root}/${detail.file}`);
      const { data, info } = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const mask = Buffer.from(data),
        c = labelColor(index);
      for (let i = 0; i < mask.length; i += 4) {
        mask[i] = (c >> 16) & 255;
        mask[i + 1] = (c >> 8) & 255;
        mask[i + 2] = c & 255;
      }
      const png = await sharp(mask, { raw: info }).png().toBuffer();
      replacement = tag.replace(
        attrs.href,
        `data:image/png;base64,${png.toString("base64")}`,
      );
      const unmodified = await sharp(bytes).png().toBuffer();
      element.originalTag = tag.replace(
        attrs.href,
        `data:image/png;base64,${unmodified.toString("base64")}`,
      );
      originalBody = originalBody.replace(tag, element.originalTag);
      element.detail = detail;
      element.data = data;
      element.info = info;
    } else {
      replacement = tag.replace(
        /(fill|stroke)="[^"]+"/g,
        (_, key) => `${key}="${labelHex(index)}"`,
      );
    }
    body = body.replace(tag, replacement);
    elements.push(element);
  }
  painted = painted.replace(group[0], group[0].replace(group[2], body));
  original = original.replace(
    group[0],
    group[0].replace(group[2], originalBody),
  );
}
const [width, height] = contract.raster;
const viewport = (svg) =>
  svg.replace(
    /viewBox="[^"]+"/,
    `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"`,
  );
const decode = (buffer) => sharp(buffer).ensureAlpha().raw().toBuffer();
const [svgIds, before, final, ownerIds] = await Promise.all([
  decode(Buffer.from(viewport(painted))),
  decode(Buffer.from(viewport(original))),
  decode(`${folder}/live.png`),
  decode(`${folder}/owners.png`),
]);
for (const pixels of [svgIds, before, final, ownerIds])
  assert.equal(
    pixels.length,
    width * height * 4,
    "Capture image dimensions differ",
  );
const elementAt = new Map(elements.map((e) => [labelColor(e.index), e]));
const ownerAt = new Map(capture.metadata.owners.map((o) => [o.code, o.id]));
for (const e of elements) {
  e.samples = [];
  e.heldout = [];
}
// Both paint order and live visibility must agree. Erode two reference pixels
// to reject antialiasing, focus fringes and the accepted silhouette residual.
for (let y = 2; y < height - 2; y++)
  for (let x = 2; x < width - 2; x++) {
    const i = (y * width + x) * 4,
      id = pixelColor(svgIds, i),
      e = elementAt.get(id);
    if (!e || before[i + 3] < 250) continue;
    const owner = pixelColor(ownerIds, i);
    if (ownerAt.get(owner) !== e.owner) continue;
    let interior = true;
    for (const offset of [
      -2,
      2,
      -width * 2,
      width * 2,
      -width - 1,
      -width + 1,
      width - 1,
      width + 1,
    ]) {
      const j = i + offset * 4;
      if (
        pixelColor(svgIds, j) !== id ||
        pixelColor(ownerIds, j) !== owner ||
        before[j + 3] < 250
      ) {
        interior = false;
        break;
      }
    }
    if (!interior) continue;
    const sample = {
      x,
      y,
      a: [...before.subarray(i, i + 3)],
      b: [...final.subarray(i, i + 3)],
    };
    const hold = ((x >> 3) + (y >> 3)) % 2 === 1;
    (hold ? e.heldout : e.samples).push(sample);
  }
const median = (values) => {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
};
const error = (samples, transform) =>
  samples.length
    ? samples.reduce(
        (sum, s) =>
          sum +
          s.b.reduce((v, b, k) => v + Math.abs(b - transform(s.a, k)), 0) / 3,
        0,
      ) / samples.length
    : null;
const corrections = [];
let output = source;
let rendered = original;
for (const e of elements) {
  const samples = e.samples;
  const correction = {
    owner: e.owner,
    index: e.index,
    type: e.type,
    sourceFill: e.attrs.fill,
    samples: samples.length,
    heldout: e.heldout.length,
  };
  let changed = e.tag,
    renderedTag;
  if (e.type === "image" && e.owner.startsWith("grab-shaker-")) {
    correction.unchanged =
      "Translucent shell/liquid: final RGB contains the room background";
  } else if (e.type === "image" && samples.length >= 24) {
    const curves = [0, 1, 2].map((k) =>
      fitChannel(
        samples
          .filter((s) => {
            // Fitting low-gradient interiors avoids teaching lens blur to the SVG.
            const i = (s.y * width + s.x) * 4;
            return [-4, 4, -width * 4, width * 4].every(
              (off) => Math.abs(before[i + k] - before[i + k + off]) < 24,
            );
          })
          .map((s) => [s.a[k], s.b[k]]),
      ),
    );
    correction.curves = curves;
    correction.sourceSha256 = e.detail.sha256;
    correction.beforeMAE = error(e.heldout, (a, k) => a[k]);
    correction.afterMAE = error(e.heldout, (a, k) =>
      channelValue(a[k], curves[k]),
    );
    if (correction.afterMAE > correction.beforeMAE) {
      delete correction.curves;
      correction.unchanged = "Color fit did not improve held-out interiors";
      corrections.push(correction);
      continue;
    }
    const pixels = transferPixels(e.data, curves);
    const png = await sharp(pixels, { raw: e.info }).png().toBuffer();
    renderedTag = e.tag.replace(
      e.attrs.href,
      `data:image/png;base64,${png.toString("base64")}`,
    );
  } else if (e.attrs.fill?.startsWith("url(#") && samples.length >= 24) {
    const curves = [0, 1, 2].map((k) =>
      fitChannel(samples.map((s) => [s.a[k], s.b[k]])),
    );
    const id = e.attrs.fill.slice(5, -1);
    const gradient = [
      ...source.matchAll(/<linearGradient\s[^>]*>[\s\S]*?<\/linearGradient>/g),
    ].find((m) => attr(m[0]).id === id)?.[0];
    assert.ok(gradient, "Gradient not found");
    const next = gradient.replace(
      /stop-color="(#\w{6})"/g,
      (_, hex) =>
        `stop-color="#${[5]
          .map((n, k) =>
            channelValue(parseInt(hex.slice(n, n + 2), 16), curves[k])
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")}"`,
    );
    correction.gradient = { id, before: gradient, after: next };
    correction.beforeMAE = error(e.heldout, (a, k) => a[k]);
    correction.afterMAE = error(e.heldout, (a, k) =>
      channelValue(a[k], curves[k]),
    );
    output = output.replace(gradient, next);
    rendered = rendered.replace(gradient, next);
  } else if (/^#[\da-f]{6}$/i.test(e.attrs.fill) && samples.length >= 8) {
    const rgb = [0, 1, 2].map((k) => median(samples.map((s) => s.b[k])));
    correction.fill =
      "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
    correction.beforeMAE = error(e.heldout, (a, k) => a[k]);
    correction.afterMAE = error(e.heldout, (a, k) => rgb[k]);
    changed = e.tag.replaceAll(e.attrs.fill, correction.fill);
  } else
    correction.unchanged =
      "Insufficient opaque interior samples or authored gradient";
  if (e.type === "image") {
    // The expanded source contains PNG data, so replace by element ordinal.
    if (renderedTag) {
      let ordinal = 0;
      rendered = rendered.replace(/<(path|polygon|image)\s[^>]*\/>/g, (tag) =>
        ++ordinal === e.index ? renderedTag : tag,
      );
    }
  } else {
    output = output.replace(e.tag, changed);
    rendered = rendered.replace(e.tag, changed);
  }
  corrections.push(correction);
}
// Small faces can have no eroded interior. Reuse a measured correction for
// the same original pigment on this same owner, without sampling neighbors.
for (const c of corrections.filter((c) => c.unchanged && c.type !== "image")) {
  const e = elements[c.index - 1];
  const sibling = corrections
    .filter(
      (s) =>
        s.owner === c.owner &&
        s.fill &&
        elements[s.index - 1].attrs.fill === e.attrs.fill,
    )
    .sort((a, b) => b.samples - a.samples)[0];
  if (!sibling) continue;
  c.fill = sibling.fill;
  c.inheritedFrom = sibling.index;
  delete c.unchanged;
  const changed = e.tag.replaceAll(e.attrs.fill, c.fill);
  output = output.replace(e.tag, changed);
  rendered = rendered.replace(e.tag, changed);
}
const geometry = (svg) =>
  svg
    .replace(/(?:fill|stroke|stop-color)="[^"]+"/g, "")
    .replace(/href="[^"]+"/g, "");
// Score the actual encoded-scale artwork. Applying a curve before resampling
// differs from transforming a screenshot, especially around small lettering.
const actual = await decode(Buffer.from(viewport(rendered)));
const replaceElement = (text, index, next) => {
  let ordinal = 0;
  return text.replace(/<(path|polygon|image)\s[^>]*\/>/g, (tag) =>
    ++ordinal === index ? next : tag,
  );
};
const reject = (c) => {
  const e = elements[c.index - 1];
  if (c.gradient)
    rendered = rendered.replace(c.gradient.after, c.gradient.before);
  if (c.fill || c.curves)
    rendered = replaceElement(rendered, c.index, e.originalTag ?? e.tag);
  delete c.fill;
  delete c.curves;
  delete c.gradient;
  c.unchanged = "Rejected color fit that increased error on held-out pixels";
  c.afterMAE = c.beforeMAE;
};
for (const c of corrections) {
  if (c.beforeMAE == null || !(c.fill || c.curves || c.gradient)) continue;
  const samples = elements[c.index - 1].heldout;
  if (!samples.length) continue;
  const mae =
    samples.reduce((sum, s) => {
      const i = (s.y * width + s.x) * 4;
      return (
        sum + s.b.reduce((v, b, k) => v + Math.abs(b - actual[i + k]), 0) / 3
      );
    }, 0) / samples.length;
  c.afterMAE = mae;
  if (mae > c.beforeMAE + 0.5) {
    c.rejectedMAE = mae;
    reject(c);
  }
}
for (const c of corrections)
  if (c.inheritedFrom && !corrections[c.inheritedFrom - 1].fill) reject(c);
const calibration = {
  version: 1,
  unit,
  label,
  sourceSvgSha256: hash(source),
  geometrySha256: hash(geometry(source)),
  contractSha256: entry.captureSha256,
  reference:
    "Finished mounted EffectComposer at the immutable rest camera; balanced quality, shipped grade, full viewport and environment",
  corrections,
};
await mkdir(`${root}/display-colors/${unit}`, { recursive: true });
await sharp(Buffer.from(viewport(rendered)))
  .png()
  .toFile(`${folder}/after.png`);
await sharp(Buffer.from(viewport(original)))
  .png()
  .toFile(`${folder}/before.png`);
const crop = {
  left: contract.viewBox[0],
  top: contract.viewBox[1],
  width: contract.viewBox[2],
  height: contract.viewBox[3],
};
const evidence = `display-colors/${unit}/${label}`;
await mkdir(`${root}/${evidence}`, { recursive: true });
const sampleMask = Buffer.alloc(width * height * 4);
for (const e of elements)
  for (const s of e.heldout) {
    const i = (s.y * width + s.x) * 4,
      c = labelColor(e.index);
    sampleMask[i] = (c >> 16) & 255;
    sampleMask[i + 1] = (c >> 8) & 255;
    sampleMask[i + 2] = c & 255;
    sampleMask[i + 3] = 255;
  }
const reference = await sharp(`${folder}/live.png`)
  .extract(crop)
  .png()
  .toBuffer();
const sampling = await sharp(sampleMask, {
  raw: { width, height, channels: 4 },
})
  .extract(crop)
  .png()
  .toBuffer();
const provenance = Buffer.from(JSON.stringify(capture, null, 2) + "\n");
calibration.evidence = { crop, files: {} };
for (const [name, bytes] of [
  ["reference.png", reference],
  ["heldout.png", sampling],
  ["provenance.json", provenance],
]) {
  const file = `${evidence}/${name}`;
  await writeFile(`${root}/${file}`, bytes);
  calibration.evidence.files[file] = hash(bytes);
}
await writeFile(
  `${root}/display-colors/${unit}/${label}.json`,
  JSON.stringify(calibration, null, 2) + "\n",
);
const tiles = await Promise.all(
  ["before", "after", "live"].map((name) =>
    sharp(`${folder}/${name}.png`)
      .extract(crop)
      .flatten({ background: label.startsWith("dark") ? "#292824" : "#e9e1cf" })
      .png()
      .toBuffer(),
  ),
);
await sharp({
  create: {
    width: crop.width * 3,
    height: crop.height,
    channels: 3,
    background: "#e9e1cf",
  },
})
  .composite(tiles.map((input, i) => ({ input, left: i * crop.width, top: 0 })))
  .png()
  .toFile(`${folder}/comparison.png`);
console.log(
  "CALIBRATED",
  unit,
  label,
  JSON.stringify(
    corrections
      .filter((c) => c.type === "image")
      .map((c) => ({
        owner: c.owner,
        before: c.beforeMAE,
        after: c.afterMAE,
        unchanged: c.unchanged,
      })),
  ),
);
