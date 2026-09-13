import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

import { verifyQualityCapture } from "./capture-contract.mjs";
import { traceContour } from "./contour.mjs";

const [unit = "projects", label = "light-desktop"] = process.argv.slice(2);
const root = "scripts/generate/room-artwork-inputs";
const args = process.argv.slice(2);
const at = args.indexOf("--input");
const folder = `${at < 0 ? root + "/quality" : args[at + 1]}/${unit}/${label}`;
const manifest = JSON.parse(await readFile(`${root}/manifest.json`, "utf8"));
const entry = manifest.cases.find((c) => c.unit === unit && c.label === label);
const source = await readFile(
  `scripts/room-artwork-quality/approved/${unit}-${label}.svg`,
  "utf8",
);
const captureBytes = await readFile(`${folder}/capture.json`);
const captured = JSON.parse(captureBytes);
if (!captured.readback)
  throw Error("Capture lacks straight-alpha readback provenance");
const hash = (b) => createHash("sha256").update(b).digest("hex");
const specs = JSON.parse(
  await readFile("scripts/room-artwork-quality/capture-specs.json", "utf8"),
).cases[`${unit}/${label}`];
verifyQualityCapture(
  captured,
  specs,
  await readFile(`${root}/${entry.inputCapture}`),
);
if (at < 0 && hash(captureBytes) !== specs.qualityInput?.sha256)
  throw Error("Frozen quality capture changed");
if (specs.approvedSvg && hash(source) !== specs.approvedSvg.sha256)
  throw Error("Approved template changed");
if (captured.files)
  for (const [file, sha] of Object.entries(captured.files))
    if (hash(await readFile(`${folder}/${file}`)) !== sha)
      throw Error("Quality input changed " + file);
const attrs = (tag) =>
  Object.fromEntries(
    [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
  );
const decode = async (file) =>
  sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const replacements = new Map(),
  details = [];
for (const owner of captured.owners) {
  const group = [
    ...source.matchAll(/<g data-part="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g),
  ].find((m) => m[1] === owner.id);
  if (!group) throw Error("Group missing " + owner.id);
  const { data, info } = await decode(`${folder}/${owner.images.mask}`);
  const alpha = new Uint8Array(info.width * info.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  const trace = (a) =>
    traceContour({
      alpha: a,
      width: info.width,
      height: info.height,
      scale: captured.scale,
      offset: owner.box.slice(0, 2),
      tolerance: 0.25,
    });
  const outline = trace(alpha);
  const paths = [...group[2].matchAll(/<path\s[^>]*\/>/g)].map((m) =>
    attrs(m[0]),
  );
  const oldImages = [...group[2].matchAll(/<image\s[^>]*\/>/g)].map((m) =>
    attrs(m[0]),
  );
  let body = "";
  if (
    paths.length === 1 &&
    (!owner.images.detail || paths[0].fill?.startsWith("url("))
  ) {
    body =
      (group[2].match(/<defs>[\s\S]*?<\/defs>/)?.[0] ?? "") +
      `<path d="${outline}" fill="${paths[0].fill}" fill-rule="evenodd"/>`;
  } else {
    // Reuse the approved region palette in its original paint order.
    const palette = paths
      .map((p) => p.fill)
      .filter((f) => /^#[\da-f]{6}$/i.test(f));
    const trophy = owner.id === "trophy";
    if (trophy && palette.length)
      body += `<path d="${outline}" fill="${palette.shift()}" fill-rule="evenodd"/>`;
    if (palette.length) {
      const flat = await decode(`${folder}/${owner.images.colour}`);
      const masks = palette.map(() => new Uint8Array(alpha.length));
      const labels = new Int16Array(alpha.length).fill(-1);
      const rgb = palette.map((c) =>
        [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)),
      );
      for (let i = 0; i < alpha.length; i++) {
        if (flat.data[i * 4 + 3] < 128) continue;
        let best = 0,
          distance = Infinity;
        for (let j = 0; j < rgb.length; j++) {
          let d = 0;
          for (let k = 0; k < 3; k++)
            d += (flat.data[i * 4 + k] - rgb[j][k]) ** 2;
          if (d < distance) {
            distance = d;
            best = j;
          }
        }
        labels[i] = best;
      }
      // Remove subpixel quantization islands only inside opaque colour regions.
      // The owner alpha and all transparent holes stay untouched.
      const seen = new Uint8Array(alpha.length);
      for (let seed = 0; seed < labels.length; seed++) {
        if (seen[seed] || labels[seed] < 0) continue;
        const label = labels[seed],
          q = [seed],
          border = new Map();
        seen[seed] = 1;
        for (const i of q) {
          const x = i % info.width;
          for (const n of [
            x ? i - 1 : -1,
            x + 1 < info.width ? i + 1 : -1,
            i - info.width,
            i + info.width,
          ]) {
            if (n < 0 || n >= labels.length || labels[n] < 0) continue;
            if (labels[n] === label) {
              if (!seen[n]) {
                seen[n] = 1;
                q.push(n);
              }
            } else border.set(labels[n], (border.get(labels[n]) ?? 0) + 1);
          }
        }
        if (q.length <= captured.scale * captured.scale * 0.5 && border.size) {
          const next = [...border].sort(
            (a, b) => b[1] - a[1] || a[0] - b[0],
          )[0][0];
          for (const i of q) labels[i] = next;
        }
      }
      for (let i = 0; i < labels.length; i++)
        if (labels[i] >= 0) masks[labels[i]][i] = 1;
      for (let j = 0; j < palette.length; j++) {
        const d = trace(masks[j]);
        if (d)
          body += `<path fill="${palette[j]}" ${trophy ? `stroke="${palette[j]}" stroke-width="0.85" stroke-linejoin="round" ` : ""}fill-rule="evenodd" d="${d}"/>`;
      }
    }
    if (owner.images.detail) {
      if (oldImages.length !== 1)
        throw Error("Expected one detail " + owner.id);
      const old = oldImages[0];
      const [x, y, width, height] = owner.box;
      const density =
        specs.owners.find((s) => s.id === owner.id).detailScale ??
        (label.endsWith("phone") ? 3 : 2);
      let picture = sharp(`${folder}/${owner.images.detail}`);
      if (owner.id === "card")
        picture = picture.modulate({ saturation: 0.5, brightness: 0.83 });
      const bytes = owner.detailPrepared
        ? await readFile(`${folder}/${owner.images.detail}`)
        : await picture
            .resize(width * density, height * density, { kernel: "lanczos3" })
            .webp({ quality: 92, alphaQuality: 100, effort: 6 })
            .toBuffer();
      const sha256 = hash(bytes),
        file = `details/${sha256}.webp`;
      await writeFile(`${root}/${file}`, bytes);
      details.push({
        href: old.href,
        file,
        sha256,
        bytes: bytes.length,
        mime: "image/webp",
      });
      body += `<image x="${x}" y="${y}" width="${width}" height="${height}" href="${old.href}"/>`;
    }
  }
  replacements.set(
    group[0],
    group[0].slice(0, group[0].indexOf(">") + 1) + body + "</g>",
  );
}
let output = source;
for (const [old, next] of replacements) output = output.replace(old, next);
if (
  [...source.matchAll(/data-part="[^"]+"/g)].join() !==
  [...output.matchAll(/data-part="[^"]+"/g)].join()
)
  throw Error("Owner order changed");
await mkdir("docs/reviews/room-artwork-quality-evidence", { recursive: true });
const receipt = {
  version: 1,
  unit,
  label,
  method:
    "Fresh 4x owner mask/colour/detail rendering at immutable saved camera; approved palette and exact shelf polygons retained; corner-preserving contour fit",
  sourceRevision: "27c0155",
  inputArtworkSha256: hash(source),
  outputArtworkSha256: hash(output),
  captureContractSha256: entry.captureSha256,
  scale: captured.scale,
  readback: captured.readback,
  restoredWind: captured.restoredWind,
  owners: captured.owners.map((o) => ({
    id: o.id,
    box: o.box,
    textures: o.textures,
  })),
  details,
};
await writeFile(`${root}/${entry.inputSvg}`, output);
entry.svgSha256 = hash(output);
for (const detail of details) {
  const index = entry.details.findIndex((d) => d.href === detail.href);
  if (index < 0) throw Error("New unknown detail");
  entry.details[index] = detail;
}
entry.qualityReprocessing = {
  method: receipt.method,
  sourceRevision: receipt.sourceRevision,
  previousArtworkSha256: receipt.inputArtworkSha256,
  scale: captured.scale,
};
await writeFile(
  `${root}/manifest.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  `docs/reviews/room-artwork-quality-evidence/${unit}-${label}.json`,
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    unit,
    label,
    svgBytes: Buffer.byteLength(output),
    detailBytes: details.reduce((s, d) => s + d.bytes, 0),
  }),
);
