import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { labelColor, pixelColor, transferPixels } from "./color-transfer.mjs";

const root = process.cwd(),
  input = path.join(root, "scripts/generate/room-artwork-inputs");
const hash = (b) => createHash("sha256").update(b).digest("hex");
const baseline = process.argv.includes("--baseline");
const manifest = JSON.parse(await readFile(`${input}/manifest.json`));
const display = JSON.parse(
  await readFile(`${input}/display-colors/manifest.json`),
);
assert.equal(
  manifest.sourceFingerprint,
  display.geometrySourceFingerprint,
  "Geometry source receipt changed since display capture",
);
for (const d of display.dependencies)
  assert.equal(
    hash(await readFile(path.join(root, d.path))),
    d.sha256,
    `Display colors are stale: ${d.path}`,
  );
const reports = [];
let images = 0;
for (const entry of manifest.cases) {
  const receipt = entry.displayColorCalibration;
  assert.ok(receipt, `Missing color calibration: ${entry.unit}/${entry.label}`);
  const bytes = await readFile(`${input}/${receipt.file}`);
  assert.equal(hash(bytes), receipt.sha256, "Color calibration changed");
  const c = JSON.parse(bytes);
  assert.equal(c.contractSha256, entry.captureSha256);
  for (const [file, sha] of Object.entries(c.evidence.files))
    assert.equal(
      hash(await readFile(`${input}/${file}`)),
      sha,
      `Reference changed: ${file}`,
    );
  let svg = await readFile(`${input}/${entry.inputSvg}`, "utf8");
  const geometry = (s) =>
    s
      .replace(/(?:fill|stroke|stop-color)="[^"]+"/g, "")
      .replace(/href="[^"]+"/g, "");
  assert.equal(
    hash(geometry(svg)),
    c.geometrySha256,
    "Color correction changed SVG geometry or paint order",
  );
  let index = 0;
  let before = svg.replace(/<(path|polygon|image)\s[^>]*\/>/g, (tag) => {
    const correction = c.corrections[index++];
    assert.equal(correction.index, index);
    if (!correction.fill) return tag;
    assert.equal(tag.match(/fill="([^"]+)"/)[1], correction.fill);
    return tag.replaceAll(correction.fill, correction.sourceFill);
  });
  for (const p of c.corrections.filter((p) => p.gradient))
    before = before.replace(p.gradient.after, p.gradient.before);
  assert.equal(
    hash(before),
    c.sourceSvgSha256,
    "Cannot reconstruct the unchanged pre-calibration SVG",
  );
  if (baseline) svg = before;
  for (const detail of entry.details) {
    const correction = c.corrections.find(
      (p) =>
        p.sourceSha256 &&
        [...before.matchAll(/<(path|polygon|image)\s[^>]*\/>/g)][
          p.index - 1
        ][0].includes(`href="${detail.href}"`),
    );
    let bytes = await readFile(`${input}/${detail.file}`);
    if (correction?.curves) {
      const source = await readFile(
        `${input}/details/${correction.sourceSha256}.webp`,
      );
      assert.equal(
        hash(source),
        correction.sourceSha256,
        "Pre-calibration detail changed",
      );
      const old = await sharp(source)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const next = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(next.info.width, old.info.width);
      assert.equal(next.info.height, old.info.height);
      const expected = transferPixels(old.data, correction.curves);
      for (let i = 0; i < next.data.length; i += 4) {
        assert.equal(
          next.data[i + 3],
          old.data[i + 3],
          "Color correction changed alpha",
        );
        if (next.data[i + 3])
          for (let k = 0; k < 3; k++)
            assert.equal(
              next.data[i + k],
              expected[i + k],
              "Corrected detail was resampled or quantized",
            );
      }
      images++;
      if (baseline) bytes = source;
    }
    const png = await sharp(bytes).png().toBuffer();
    svg = svg.replaceAll(
      `href="${detail.href}"`,
      `href="data:image/png;base64,${png.toString("base64")}"`,
    );
  }
  const { crop } = c.evidence;
  const folder = `${input}/display-colors/${entry.unit}/${entry.label}`;
  const [rendered, reference, samples] = await Promise.all([
    sharp(Buffer.from(svg))
      .resize(crop.width, crop.height)
      .ensureAlpha()
      .raw()
      .toBuffer(),
    sharp(`${folder}/reference.png`).ensureAlpha().raw().toBuffer(),
    sharp(`${folder}/heldout.png`).ensureAlpha().raw().toBuffer(),
  ]);
  assert.equal(rendered.length, reference.length);
  assert.equal(samples.length, reference.length);
  const byId = new Map(
    c.corrections.map((p) => [labelColor(p.index), { ...p, errors: [] }]),
  );
  for (let i = 0; i < samples.length; i += 4) {
    if (!samples[i + 3]) continue;
    const p = byId.get(pixelColor(samples, i));
    assert.ok(p);
    if (!(p.curves || p.fill || p.gradient) || !p.heldout) continue;
    p.errors.push(
      (Math.abs(rendered[i] - reference[i]) +
        Math.abs(rendered[i + 1] - reference[i + 1]) +
        Math.abs(rendered[i + 2] - reference[i + 2])) /
        3,
    );
  }
  let total = 0,
    beforeTotal = 0,
    afterTotal = 0;
  const owners = [];
  for (const p of byId.values()) {
    if (!p.errors.length || p.beforeMAE == null) continue;
    const mae = p.errors.reduce((a, b) => a + b, 0) / p.errors.length;
    assert.ok(
      mae <= p.beforeMAE + 1,
      `Object color regression ${entry.unit}/${entry.label}/${p.owner}/${p.index}: ${p.beforeMAE.toFixed(2)} -> ${mae.toFixed(2)}`,
    );
    p.errors.sort((a, b) => a - b);
    owners.push({
      owner: p.owner,
      index: p.index,
      samples: p.errors.length,
      beforeMAE: p.beforeMAE,
      afterMAE: mae,
      p95: p.errors[Math.floor(p.errors.length * 0.95)],
    });
    total += p.errors.length;
    beforeTotal += p.beforeMAE * p.errors.length;
    afterTotal += mae * p.errors.length;
  }
  const result = {
    unit: entry.unit,
    label: entry.label,
    samples: total,
    beforeMAE: beforeTotal / total,
    afterMAE: afterTotal / total,
    owners,
  };
  assert.ok(
    total > 500,
    `Too few visible reference samples: ${entry.unit}/${entry.label}`,
  );
  assert.ok(
    result.afterMAE < result.beforeMAE * (entry.unit === "books" ? 0.5 : 0.8),
    `Display color regression ${entry.unit}/${entry.label}: ${result.beforeMAE.toFixed(2)} -> ${result.afterMAE.toFixed(2)}`,
  );
  reports.push(result);
}
const result = {
  cases: reports.length,
  losslessDetails: images,
  geometryAndAlphaUnchanged: true,
  reports,
};
const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
if (out) await writeFile(out, JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      ...result,
      reports: reports.map((r) => ({
        unit: r.unit,
        label: r.label,
        samples: r.samples,
        beforeMAE: r.beforeMAE,
        afterMAE: r.afterMAE,
      })),
    },
    null,
    2,
  ),
);
