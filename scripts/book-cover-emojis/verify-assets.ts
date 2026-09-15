#!/usr/bin/env tsx
/**
 * Audit a generated emoji directory against the spec, by reading the pixels
 * rather than trusting the manifest.
 *
 *   tsx scripts/book-cover-emojis/verify-assets.ts [outDir]
 *
 * For every PNG it checks the canvas is 512x512 RGBA, that the art fills one
 * axis of the square, that it is centered, and that the pixels agree with the
 * geometry the manifest claims for that asset. The transparency check is made
 * against that claimed box and demands alpha exactly 0: measuring the art box
 * from the pixels and then asking whether anything opaque lies outside it can
 * only ever answer no, because that box is defined as the extent of what is
 * opaque. A stray mark in the padding moves the measured box instead of
 * showing up as a fault, so the claim has to come from somewhere else.
 */
import { type Manifest } from "./manifest";
import { EMOJI_SIZE } from "./render";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import sharp from "sharp";

/** Below this a pixel is too faint to count as part of the art. */
const ALPHA_FLOOR = 8;

export type Box = { width: number; height: number; left: number; top: number };

export type Measured = {
  width: number;
  height: number;
  channels: number;
  /** Extent of the art, measured from the pixels. */
  art: Box;
  /**
   * Pixels carrying any alpha at all outside the box the caller claimed.
   * Null when no claim was supplied, since there is nothing to check against.
   */
  paddingAlphaPixels: number | null;
  /** Strongest alpha found in that padding, for the fault message. */
  maxPaddingAlpha: number;
};

export async function measure(png: Buffer, claimed?: Box): Promise<Measured> {
  const image = sharp(png);
  const metadata = await image.metadata();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let maxX = -1;
  let minY = info.height;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * info.channels + 3]!;
      if (alpha <= ALPHA_FLOOR) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const art = {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  let paddingAlphaPixels = claimed ? 0 : null;
  let maxPaddingAlpha = 0;
  if (claimed) {
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const inside =
          x >= claimed.left &&
          x < claimed.left + claimed.width &&
          y >= claimed.top &&
          y < claimed.top + claimed.height;
        if (inside) continue;
        const alpha = data[(y * info.width + x) * info.channels + 3]!;
        if (alpha === 0) continue;
        paddingAlphaPixels = (paddingAlphaPixels ?? 0) + 1;
        if (alpha > maxPaddingAlpha) maxPaddingAlpha = alpha;
      }
    }
  }
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    channels: metadata.channels ?? 0,
    art,
    paddingAlphaPixels,
    maxPaddingAlpha,
  };
}

/**
 * Everything wrong with one asset, as plain sentences. Pass the geometry the
 * manifest claims to get the transparency and agreement checks; without it
 * only the shape of the canvas can be judged.
 */
export function faultsFor(
  name: string,
  measured: Measured,
  claimed?: Box,
): string[] {
  const faults: string[] = [];
  if (measured.width !== EMOJI_SIZE || measured.height !== EMOJI_SIZE) {
    faults.push(`${name}: canvas is ${measured.width}x${measured.height}`);
  }
  if (measured.channels !== 4) {
    faults.push(`${name}: ${measured.channels} channels, expected RGBA`);
  }
  if (measured.art.width !== EMOJI_SIZE && measured.art.height !== EMOJI_SIZE) {
    faults.push(
      `${name}: art is ${measured.art.width}x${measured.art.height}, neither axis fills ${EMOJI_SIZE}`,
    );
  }
  const leftGap = measured.art.left;
  const rightGap = EMOJI_SIZE - (measured.art.left + measured.art.width);
  const topGap = measured.art.top;
  const bottomGap = EMOJI_SIZE - (measured.art.top + measured.art.height);
  if (Math.abs(leftGap - rightGap) > 1 || Math.abs(topGap - bottomGap) > 1) {
    faults.push(
      `${name}: off-center (gaps l${leftGap} r${rightGap} t${topGap} b${bottomGap})`,
    );
  }
  if (!claimed) return faults;

  if (
    measured.art.width !== claimed.width ||
    measured.art.height !== claimed.height ||
    measured.art.left !== claimed.left ||
    measured.art.top !== claimed.top
  ) {
    faults.push(
      `${name}: claimed art ${claimed.width}x${claimed.height} at ${claimed.left},${claimed.top} but the pixels say ${measured.art.width}x${measured.art.height} at ${measured.art.left},${measured.art.top}`,
    );
  }
  if ((measured.paddingAlphaPixels ?? 0) > 0) {
    faults.push(
      `${name}: ${measured.paddingAlphaPixels} pixels outside the claimed art box are not fully transparent (strongest alpha ${measured.maxPaddingAlpha})`,
    );
  }
  return faults;
}

async function main() {
  const out =
    process.argv[2] ??
    join(homedir(), "Desktop", "Agents", "research", "book-cover-emojis");
  const emojiDir = join(out, "emoji");
  const files = readdirSync(emojiDir).filter((file) => file.endsWith(".png"));
  const manifest = JSON.parse(
    readFileSync(join(out, "manifest.json"), "utf8"),
  ) as Manifest;

  const faults: string[] = [];
  const aspects = new Map<string, number>();
  for (const file of files) {
    const png = readFileSync(join(emojiDir, file));
    const entry = manifest.assets.find((asset) => asset.file === `emoji/${file}`);
    if (!entry?.png) {
      faults.push(`${file}: no successful manifest entry`);
      continue;
    }
    // The manifest's art box is the independent claim the pixels are judged
    // against; it was computed from the source dimensions, not from this file.
    const measured = await measure(png, entry.png.art);
    faults.push(...faultsFor(file, measured, entry.png.art));
    const ratio = (measured.art.width / measured.art.height).toFixed(2);
    aspects.set(ratio, (aspects.get(ratio) ?? 0) + 1);

    const digest = createHash("sha256").update(png).digest("hex");
    if (digest !== entry.png.sha256) {
      faults.push(`${file}: sha256 does not match the manifest`);
    }
  }

  const expected = manifest.assets.filter((asset) => asset.status === "success").length;
  if (files.length !== expected) {
    faults.push(`${files.length} PNGs on disk but ${expected} successes in the manifest`);
  }

  console.log(`${files.length} assets checked in ${emojiDir}`);
  console.log(
    `aspect ratios: ${[...aspects]
      .sort((a, b) => b[1] - a[1])
      .map(([ratio, count]) => `${ratio} x${count}`)
      .join(", ")}`,
  );
  if (faults.length === 0) {
    console.log("no faults");
    return;
  }
  for (const fault of faults.slice(0, 40)) console.log(`  ! ${fault}`);
  console.log(`${faults.length} fault(s)`);
  process.exitCode = 1;
}

if (process.argv[1]?.endsWith("verify-assets.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
