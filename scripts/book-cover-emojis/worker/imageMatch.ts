/**
 * Confirm a reused emoji is actually this book's cover.
 *
 * Matching by name alone is not enough. If a name ever collides with an emoji
 * somebody else made, reusing it would put the wrong picture on a book and
 * nothing downstream would notice. So the stored image is fetched and compared
 * against the asset we meant to upload.
 *
 * The comparison is tolerant because Notion re-encodes what it stores: a byte
 * or hash comparison would fail on every single emoji. Both images are reduced
 * to a small ignore-alpha thumbnail and compared channel by channel, which
 * survives re-encoding while still telling two different jackets apart.
 */
import sharp from "sharp";

export const COMPARE_SIZE = 32;
/** Mean per-channel difference, 0-255. Re-encoding moves this by a few points. */
export const DEFAULT_TOLERANCE = 12;

export type MatchResult = { matches: boolean; difference: number };

async function fingerprint(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes, { failOn: "none" })
    // Flatten onto a fixed ground so transparent padding cannot differ.
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(COMPARE_SIZE, COMPARE_SIZE, { fit: "fill", kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer();
}

export function meanDifference(a: Buffer, b: Buffer): number {
  if (a.length !== b.length || a.length === 0) return 255;
  let total = 0;
  for (let index = 0; index < a.length; index++) {
    total += Math.abs(a[index]! - b[index]!);
  }
  return total / a.length;
}

export async function imagesMatch(
  expected: Buffer,
  actual: Buffer,
  tolerance = DEFAULT_TOLERANCE,
): Promise<MatchResult> {
  const [left, right] = await Promise.all([fingerprint(expected), fingerprint(actual)]);
  const difference = meanDifference(left, right);
  return { matches: difference <= tolerance, difference };
}

export type FetchImage = (url: string) => Promise<Buffer>;

export const fetchImage: FetchImage = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`could not read the emoji image: http ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};
