import sharp from "sharp";

import {
  type Oklab,
  type Rgb,
  colorFamilyFromHsl,
  oklabInGamut,
  oklabToRgb,
  rgbToHex,
  rgbToHsl,
  rgbToOklab,
} from "./coverColor";
import { enhanceCoverUrl } from "./coverUtils";

/**
 * Pick one color for a whole jacket so the shelf can sort by it.
 *
 * `coverEdgeColor.server.ts` answers a different question (what cloth the
 * physical book on the homepage shelf should wear) by sampling only the
 * perimeter band. This samples the whole cover. When at least a third of
 * the jacket carries real color, the dominant hue bin supplies hue and
 * chroma, and the whole cover's average OKLab lightness supplies lightness:
 * a white jacket with a blue block reads as a pale blue from across the room,
 * and that is where it belongs in the rainbow. Otherwise the dominant
 * lightness band of the ground (white paper, black ink) wins, so a black
 * jacket with white type stays black, but it is tinted faintly toward the
 * accent hue so the shelf can still run the whites and blacks by accent.
 */

const SAMPLE_WIDTH = 40;
const SAMPLE_HEIGHT = 60;
const HUE_BINS = 24;
const CHROMATIC_SATURATION = 0.2;
const CHROMATIC_MIN_LIGHTNESS = 0.1;
const CHROMATIC_MAX_LIGHTNESS = 0.92;
/** Share of the jacket that must carry color before the book counts as that
 * color rather than as its paper or ink ground. */
const CHROMATIC_SHARE = 0.34;
/** Largest OKLab chroma a neutral cover borrows from its accent. Small enough
 * that white stays white and gray stays gray on the shelf. */
const ACCENT_TINT_CHROMA = 0.03;
/** Accent share at which the tint reaches full strength. */
const ACCENT_TINT_FULL_SHARE = 0.15;
const COVER_FETCH_TIMEOUT_MS = 8_000;
const MAX_COVER_BYTES = 8 * 1024 * 1024;

type CoverBytes = ArrayBuffer | Uint8Array | Buffer;

type Accumulator = { count: number; weight: number; r: number; g: number; b: number };

function accumulator(): Accumulator {
  return { count: 0, weight: 0, r: 0, g: 0, b: 0 };
}

function meanRgb(acc: Accumulator) {
  return { r: acc.r / acc.count, g: acc.g / acc.count, b: acc.b / acc.count };
}

function stableHex(rgb: { r: number; g: number; b: number }): string {
  // Round each channel to a multiple of 4 so a re-encoded scan keeps the same
  // stored hex instead of drifting by a JPEG artifact.
  const channel = (value: number) => Math.min(252, Math.round(value / 4) * 4);
  return rgbToHex({ r: channel(rgb.r), g: channel(rgb.g), b: channel(rgb.b) });
}

/** Index of the hue bin with the most weight, counting half of each
 * neighbour so a hue split across two bins still wins. -1 when empty. */
function peakHueBin(hueBins: Accumulator[]): number {
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < hueBins.length; i++) {
    if (hueBins[i]!.count === 0) continue;
    const prev = hueBins[(i + hueBins.length - 1) % hueBins.length]!.weight;
    const next = hueBins[(i + 1) % hueBins.length]!.weight;
    const score = hueBins[i]!.weight + 0.5 * (prev + next);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Nudge a neutral ground toward its accent hue without leaving its family:
 * enough for the shelf to run whites by accent, never enough to read as a
 * colored jacket. Falls back to the plain ground when no tint fits. */
function tintToward(ground: Rgb, accent: Rgb, share: number): Rgb {
  const base = rgbToOklab(ground);
  const target = rgbToOklab(accent);
  const chroma = Math.hypot(target.a, target.b);
  if (chroma < 1e-6) return ground;
  const family = colorFamilyFromHsl(rgbToHsl(ground));
  let strength =
    ACCENT_TINT_CHROMA * Math.min(1, share / ACCENT_TINT_FULL_SHARE);
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate: Oklab = {
      L: base.L,
      a: base.a + (target.a / chroma) * strength,
      b: base.b + (target.b / chroma) * strength,
    };
    if (oklabInGamut(candidate)) {
      const rgb = oklabToRgb(candidate);
      if (colorFamilyFromHsl(rgbToHsl(rgb)) === family) return rgb;
    }
    strength /= 2;
  }
  return ground;
}

/** The bin's hue and chroma at the whole cover's lightness. Chroma shrinks
 * only as far as sRGB needs at that lightness. */
function atLightness(binRgb: { r: number; g: number; b: number }, L: number) {
  const lab = rgbToOklab(binRgb);
  for (let scale = 1; scale >= 0; scale -= 0.04) {
    const candidate: Oklab = { L, a: lab.a * scale, b: lab.b * scale };
    if (oklabInGamut(candidate)) return oklabToRgb(candidate);
  }
  return oklabToRgb({ L, a: 0, b: 0 });
}

export async function extractCoverColor(
  bytes: CoverBytes,
): Promise<string | null> {
  try {
    const { data, info } = await sharp(bytes)
      .rotate()
      .resize(SAMPLE_WIDTH, SAMPLE_HEIGHT, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const hueBins = Array.from({ length: HUE_BINS }, accumulator);
    // Neutral pixels split into dark, mid, and light so a white cover with
    // black type stays white and a black cover with white type stays black.
    const neutralBands = [accumulator(), accumulator(), accumulator()];
    let total = 0;
    let chromatic = 0;
    let lightness = 0;

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * info.channels;
        const a = data[offset + 3] ?? 255;
        if (a < 96) continue;
        const r = data[offset] ?? 0;
        const g = data[offset + 1] ?? 0;
        const b = data[offset + 2] ?? 0;
        total += 1;
        lightness += rgbToOklab({ r, g, b }).L;
        const { h, s, l } = rgbToHsl({ r, g, b });
        const isChromatic =
          s >= CHROMATIC_SATURATION &&
          l >= CHROMATIC_MIN_LIGHTNESS &&
          l <= CHROMATIC_MAX_LIGHTNESS;
        let target: Accumulator;
        let weight = 1;
        if (isChromatic) {
          chromatic += 1;
          target = hueBins[Math.floor(h / (360 / HUE_BINS)) % HUE_BINS]!;
          weight = 0.5 + s;
        } else {
          target = neutralBands[l < 0.25 ? 0 : l < 0.75 ? 1 : 2]!;
        }
        target.count += 1;
        target.weight += weight;
        target.r += r;
        target.g += g;
        target.b += b;
      }
    }

    if (total === 0) return null;

    const share = chromatic / total;
    const peak = peakHueBin(hueBins);
    if (share >= CHROMATIC_SHARE && peak >= 0) {
      return stableHex(atLightness(meanRgb(hueBins[peak]!), lightness / total));
    }

    const band = neutralBands.reduce((winner, candidate) =>
      candidate.count > winner.count ? candidate : winner,
    );
    if (band.count === 0) return null;
    const ground = meanRgb(band);
    return stableHex(
      peak >= 0 ? tintToward(ground, meanRgb(hueBins[peak]!), share) : ground,
    );
  } catch {
    return null;
  }
}

export async function loadCoverBytes(url: string): Promise<CoverBytes | null> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(COVER_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const advertised = Number(response.headers.get("content-length") ?? 0);
    if (advertised > MAX_COVER_BYTES) return null;
    const bytes = await response.arrayBuffer();
    return bytes.byteLength <= MAX_COVER_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

/** Fetch a cover and extract its color; null on any failure so the sync
 * never blocks on a cover host. */
export async function resolveCoverColor(
  coverUrl: string | null,
): Promise<string | null> {
  // Sample the same art the shelf renders (Google Books at its clean zoom)
  const url = enhanceCoverUrl(coverUrl);
  if (!url) return null;
  const bytes = await loadCoverBytes(url);
  return bytes ? extractCoverColor(bytes) : null;
}
