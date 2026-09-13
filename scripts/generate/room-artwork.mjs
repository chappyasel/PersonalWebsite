import { verifyQualityInputs } from "../room-artwork-quality/verify-inputs.mjs";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import sharp from "sharp";
import { Matrix4, Vector3 } from "three";

import { verifyCapturedBooksIdentity } from "./room-artwork-books.mjs";
import { verifyCapturedClockRotation } from "./room-artwork-clock.mjs";
import { extractShelfArtwork } from "./room-artwork-shelf.mjs";

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const INPUT = "scripts/generate/room-artwork-inputs";
const OUTPUT = "public/images/stacks/boot";
/** @param {string | Uint8Array} bytes */
export const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
/** @param {unknown} value */
const serialized = (value) => JSON.stringify(value) + "\n";

/**
 * @param {string} root
 * @param {{dependencies: {path:string, sha256:string}[], sourceFingerprint:string}} manifest
 */
export async function verifyDependencies(root, manifest) {
  const changed = [];
  for (const dependency of manifest.dependencies) {
    const bytes = await fs
      .readFile(path.join(root, dependency.path))
      .catch(() => null);
    if (!bytes || sha256(bytes) !== dependency.sha256)
      changed.push(dependency.path);
  }
  if (changed.length)
    throw new Error(
      `Room artwork source fingerprint is stale:\n${changed.join("\n")}\nReconcile changed geometry with the approved snapshot before updating its dependency lock. Packaging is not a fresh capture.`,
    );
  const digest = sha256(
    JSON.stringify(
      manifest.dependencies.map(({ path, sha256 }) => ({ path, sha256 })),
    ),
  );
  if (digest !== manifest.sourceFingerprint)
    throw new Error("Room artwork dependency lock digest mismatch");
}

/**
 * @param {string} svg
 * @param {{href:string,file:string,sha256:string,bytes:number,mime:string}[]} details
 * @param {(file:string) => Promise<Buffer>} read
 */
export async function inlineDetails(svg, details, read) {
  const replacements = new Map();
  for (const detail of details) {
    const bytes = await read(detail.file);
    if (sha256(bytes) !== detail.sha256 || bytes.length !== detail.bytes)
      throw new Error(`Changed approved detail: ${detail.file}`);
    if (!["image/webp", "image/png"].includes(detail.mime))
      throw new Error(`Unsupported detail MIME: ${detail.mime}`);
    replacements.set(
      detail.href,
      `data:${detail.mime};base64,${bytes.toString("base64")}`,
    );
  }
  const used = new Set();
  const output = svg.replace(
    /((?:xlink:)?href=")([^"]+)(")/g,
    (_, before, href, after) => {
      if (href.startsWith("#")) return before + href + after;
      const embedded = replacements.get(href);
      if (!embedded) throw new Error(`Unaccounted image reference: ${href}`);
      used.add(href);
      return before + embedded + after;
    },
  );
  if (used.size !== replacements.size)
    throw new Error("Unused approved detail entry");
  if (/<(?:script|foreignObject)\b|\bon\w+=|url\((?!["']?#)/i.test(output))
    throw new Error("Unexpected active/external SVG content");
  return output;
}

export async function generate({ root = ROOT, check = false } = {}) {
  /** @param {string} file */
  const read = (file) => fs.readFile(path.join(root, INPUT, file));
  /** @type {typeof import("./room-artwork-inputs/manifest.json")} */
  const manifest = JSON.parse((await read("manifest.json")).toString());
  await verifyDependencies(root, manifest);
  if (check) await verifyQualityInputs(root);
  const expected = new Map();
  /** @type {Record<string, unknown>} */
  const catalog = {};
  const sizes = [];
  const decodedDetails = new Set();
  for (const entry of manifest.cases) {
    for (const detail of entry.details) {
      if (!decodedDetails.has(detail.sha256)) {
        const bytes = await read(detail.file);
        await sharp(bytes).raw().toBuffer();
        decodedDetails.add(detail.sha256);
      }
    }
    const original = await read(entry.inputSvg);
    const captureBytes = await read(entry.inputCapture);
    if (
      sha256(original) !== entry.svgSha256 ||
      sha256(captureBytes) !== entry.captureSha256
    )
      throw new Error(`Changed approved input ${entry.unit}/${entry.label}`);
    const capture = JSON.parse(captureBytes.toString());
    /** @type {import("../../src/app/components/stacks/illustration/artwork/types").RoomArtworkRegistration["probes"]} */
    const layoutProbes = capture.probes;
    await verifyCapturedBooksIdentity(capture, read);
    verifyCapturedClockRotation(capture);
    const svg = await inlineDetails(original.toString(), entry.details, read);
    const svgViewBox = svg
      .match(/viewBox="([^"]+)"/)?.[1]
      ?.split(/\s+/)
      .map(Number);
    if (JSON.stringify(svgViewBox) !== JSON.stringify(entry.viewBox))
      throw new Error("ViewBox changed");
    const partCount = [...svg.matchAll(/data-part=/g)].length;
    if (partCount !== entry.partCount) throw new Error("Owner count changed");
    const stem = `${entry.unit}/${entry.label}`;
    const src = `/images/stacks/boot/${stem}.svg`;
    const shelfSrc = `/images/stacks/boot/${stem}.shelf.svg`;
    const shelfSvg = extractShelfArtwork(svg);
    const registrationSrc = `/images/stacks/boot/${stem}.registration.json`;
    const metadata = {
      unit: entry.unit,
      unitIndex: entry.index,
      theme: entry.label.split("-")[0],
      viewport: entry.label.split("-")[1],
      src,
      shelfSrc,
      viewBox: entry.viewBox,
      drawingWidth: entry.drawingWidth,
      sourceRevision: manifest.sourceRevision,
      sourceFingerprint: manifest.sourceFingerprint,
      raster: capture.raster,
      browserViewport: capture.browserViewport,
      camera: capture.camera,
      unitWorld: capture.unitWorld,
      unitWorldPrecisionDecimals: capture.unitWorldPrecisionDecimals,
      registrationSrc,
      registrationAvailable: capture.registrationAvailable,
      layoutPoints: layoutProbes.map((probe) =>
        new Vector3()
          .fromArray(probe.capturedCoordinates ?? probe.sample.coordinates)
          .applyMatrix4(new Matrix4().fromArray(probe.localMatrix))
          .applyMatrix4(new Matrix4().fromArray(capture.unitWorld))
          .toArray(),
      ),
    };
    catalog[`${entry.index}/${entry.label}`] = metadata;
    const registration = {
      ...capture,
      sourceFingerprint: manifest.sourceFingerprint,
      artworkSha256: sha256(svg),
    };
    expected.set(`${OUTPUT}/${stem}.svg`, svg);
    expected.set(`${OUTPUT}/${stem}.shelf.svg`, shelfSvg);
    expected.set(
      `${OUTPUT}/${stem}.registration.json`,
      serialized(registration),
    );
    sizes.push({
      unit: entry.unit,
      case: entry.label,
      svgBytes: Buffer.byteLength(svg),
      svgGzipBytes: gzipSync(svg, { level: 9 }).length,
      shelfBytes: Buffer.byteLength(shelfSvg),
      shelfGzipBytes: gzipSync(shelfSvg, { level: 9 }).length,
      shelfSha256: sha256(shelfSvg),
      registrationBytes: Buffer.byteLength(serialized(registration)),
      detailImages: entry.details.length,
      parts: partCount,
      sha256: sha256(svg),
    });
  }
  if (Object.keys(catalog).length !== 24)
    throw new Error("Expected six shelves and four cases");
  expected.set(
    "src/app/components/stacks/illustration/artwork/catalog.json",
    serialized(catalog),
  );
  expected.set(
    `${OUTPUT}/manifest.json`,
    serialized({
      version: 1,
      sourceRevision: manifest.sourceRevision,
      sourceFingerprint: manifest.sourceFingerprint,
      captureClaim: manifest.captureClaim,
      qualityCaptureRevision: manifest.qualityCaptureRevision,
      cases: sizes,
    }),
  );
  for (const [file, value] of expected) {
    if (check) {
      const current = await fs
        .readFile(path.join(root, file))
        .catch(() => null);
      if (!current || !current.equals(Buffer.from(value)))
        throw new Error(`Stale generated room artwork: ${file}`);
    } else {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await fs.writeFile(path.join(root, file), value);
    }
  }
  // Reject leftover served cases, rather than silently shipping stale files.
  const files = await fs.readdir(path.join(root, OUTPUT), { recursive: true });
  for (const file of files) {
    const stat = await fs.stat(path.join(root, OUTPUT, file));
    if (stat.isFile() && !expected.has(`${OUTPUT}/${file}`))
      throw new Error(`Unexpected room artwork output: ${file}`);
  }
  return {
    cases: sizes.length,
    sourceDependencies: manifest.dependencies.length,
    decodedDetails: decodedDetails.size,
    svgBytes: sizes.reduce((n, s) => n + s.svgBytes, 0),
    svgGzipBytes: sizes.reduce((n, s) => n + s.svgGzipBytes, 0),
    shelfBytes: sizes.reduce((n, s) => n + s.shelfBytes, 0),
    shelfGzipBytes: sizes.reduce((n, s) => n + s.shelfGzipBytes, 0),
    registrationBytes: sizes.reduce((n, s) => n + s.registrationBytes, 0),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.some((a) => a !== "--check"))
    throw new Error("Usage: node scripts/generate/room-artwork.mjs [--check]");
  console.log(
    JSON.stringify(
      await generate({ check: args.includes("--check") }),
      null,
      2,
    ),
  );
}
