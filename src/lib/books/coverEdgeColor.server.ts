import sharp from "sharp";

import {
  type ReadingBookEdgeColor,
  fallbackCoverEdgeColor,
} from "./coverEdgeColor";

const SAMPLE_WIDTH = 48;
const SAMPLE_HEIGHT = 64;
const EDGE_BAND = 6;
const MAX_CACHE_ENTRIES = 96;
const COVER_FETCH_TIMEOUT_MS = 650;
const MAX_COVER_BYTES = 6 * 1024 * 1024;

type CoverBytes = ArrayBuffer | Uint8Array | Buffer;
type CoverLoader = (url: string) => Promise<CoverBytes | null>;

type Bucket = {
  count: number;
  r: number;
  g: number;
  b: number;
  score: number;
  chromatic: boolean;
};

function saturation(r: number, g: number, b: number) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}

function bucketHex(bucket: Bucket) {
  // Stable 4-bit/channel quantization stops tiny JPEG/optimizer differences
  // from repainting a physical book after a cache refresh.
  const channel = (sum: number) => Math.floor(sum / bucket.count / 16) * 16;
  return `#${[channel(bucket.r), channel(bucket.g), channel(bucket.b)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

export async function extractCoverEdgeColor(
  bytes: CoverBytes,
): Promise<string | null> {
  try {
    const { data, info } = await sharp(bytes)
      .rotate()
      .resize(SAMPLE_WIDTH, SAMPLE_HEIGHT, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const buckets = new Map<string, Bucket>();
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (
          x >= EDGE_BAND &&
          x < info.width - EDGE_BAND &&
          y >= EDGE_BAND &&
          y < info.height - EDGE_BAND
        )
          continue;
        const offset = (y * info.width + x) * info.channels;
        const r = data[offset] ?? 0;
        const g = data[offset + 1] ?? 0;
        const b = data[offset + 2] ?? 0;
        const a = data[offset + 3] ?? 255;
        if (a < 96) continue;
        const key = `${r >> 4}:${g >> 4}:${b >> 4}`;
        const entry = buckets.get(key) ?? {
          count: 0,
          r: 0,
          g: 0,
          b: 0,
          score: 0,
          chromatic: false,
        };
        entry.count += 1;
        entry.r += r;
        entry.g += g;
        entry.b += b;
        buckets.set(key, entry);
      }
    }
    let chromaticPixels = 0;
    for (const entry of buckets.values()) {
      const r = entry.r / entry.count;
      const g = entry.g / entry.count;
      const b = entry.b / entry.count;
      const chroma = saturation(r, g, b);
      const brightness = (r + g + b) / (3 * 255);
      entry.chromatic =
        chroma >= 0.18 && brightness >= 0.09 && brightness <= 0.93;
      if (entry.chromatic) chromaticPixels += entry.count;
      const neutralHighlight = brightness > 0.91 && chroma < 0.1 ? 0.16 : 1;
      const crushedShadow = brightness < 0.055 ? 0.32 : 1;
      entry.score =
        entry.count * (0.62 + chroma * 2.6) * neutralHighlight * crushedShadow;
    }
    // Amazon jacket scans commonly include a white cover ground all the way
    // to the crop. A literal modal perimeter bucket then paints every physical
    // book the same white, even when teal/orange/red cover ink reaches that
    // perimeter. Keep the sample edge-first, but once real jacket ink accounts
    // for at least 0.5% of the band, select among that ink rather than treating
    // the scanner/cover paper as cloth color.
    const preferChromatic = chromaticPixels >= 6;
    let best: Bucket | null = null;
    for (const entry of buckets.values()) {
      if (preferChromatic && !entry.chromatic) continue;
      if (!best || entry.score > best.score) best = entry;
    }
    return best ? bucketHex(best) : null;
  } catch {
    return null;
  }
}

export function createCoverEdgeColorResolver(
  load: CoverLoader,
  maxEntries = MAX_CACHE_ENTRIES,
) {
  const colors = new Map<string, string>();
  const pending = new Map<string, Promise<string | null>>();
  return async (
    url: string,
    fallbackSeed: string,
  ): Promise<ReadingBookEdgeColor> => {
    const cached = colors.get(url);
    if (cached) return { edge: cached, source: "edge" };
    let work = pending.get(url);
    if (!work) {
      work = load(url)
        .then((bytes) => (bytes ? extractCoverEdgeColor(bytes) : null))
        .catch(() => null)
        .finally(() => pending.delete(url));
      pending.set(url, work);
    }
    const edge = await work;
    if (edge) {
      colors.set(url, edge);
      while (colors.size > maxEntries) {
        const oldest = colors.keys().next().value;
        if (!oldest) break;
        colors.delete(oldest);
      }
      return { edge, source: "edge" };
    }
    return { edge: fallbackCoverEdgeColor(fallbackSeed), source: "fallback" };
  };
}

async function loadRemoteCover(url: string): Promise<CoverBytes | null> {
  try {
    const response = await fetch(url, {
      next: { revalidate: 60 * 60 * 24 * 30 },
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

const resolveCoverEdgeColor = createCoverEdgeColorResolver(loadRemoteCover);

export async function readingBookEdgeColors(
  books: Array<{ id: string; coverUrl: string | null }>,
): Promise<Record<string, ReadingBookEdgeColor>> {
  const entries = await Promise.all(
    books.map(
      async (book) =>
        [
          book.id,
          book.coverUrl
            ? await resolveCoverEdgeColor(book.coverUrl, book.id)
            : {
                edge: fallbackCoverEdgeColor(book.id),
                source: "fallback" as const,
              },
        ] as const,
    ),
  );
  return Object.fromEntries(entries);
}
