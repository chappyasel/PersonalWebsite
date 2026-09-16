/**
 * Turn a fetched jacket into a 512x512 RGBA PNG emoji.
 *
 * The rules, in the order they matter:
 *   - the art is the real cover, never a drawn stand-in;
 *   - aspect ratio is preserved, so nothing is cropped and nothing is stretched;
 *   - the longer side fills all 512 px, so a 2:3 jacket is 341x512, not smaller;
 *   - the rest of the square is fully transparent, so the emoji sits on any
 *     background the way a platform emoji does.
 */
import sharp from "sharp";

export const EMOJI_SIZE = 512;

export type ArtBox = {
  width: number;
  height: number;
  left: number;
  top: number;
};

/**
 * Where the art lands inside the square. The longer source side is pinned to
 * the full size rather than rounded to it, so a 1000x1499 scan still reports
 * a 512 px height instead of 511.
 */
export function containBox(
  sourceWidth: number,
  sourceHeight: number,
  size: number = EMOJI_SIZE,
): ArtBox {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error(
      `cover has no usable dimensions (${sourceWidth}x${sourceHeight})`,
    );
  }
  const scale = Math.min(size / sourceWidth, size / sourceHeight);
  let width = Math.min(size, Math.max(1, Math.round(sourceWidth * scale)));
  let height = Math.min(size, Math.max(1, Math.round(sourceHeight * scale)));
  if (sourceWidth >= sourceHeight) width = size;
  if (sourceHeight >= sourceWidth) height = size;
  // Floor, not round, because that is where sharp's "contain" actually puts
  // the art when the leftover padding is an odd number of pixels. Rounding
  // put the reported box one pixel right of the real one whenever that
  // padding is odd, which includes the common 2:3 jacket.
  return {
    width,
    height,
    left: Math.floor((size - width) / 2),
    top: Math.floor((size - height) / 2),
  };
}

export type RenderedEmoji = {
  png: Buffer;
  /** Source pixels after EXIF orientation is applied. */
  source: { width: number; height: number; format: string };
  art: ArtBox;
};

/** EXIF orientations 5-8 mean the stored pixels are rotated a quarter turn. */
function orientedSize(
  width: number,
  height: number,
  orientation: number | undefined,
): { width: number; height: number } {
  if (orientation && orientation >= 5 && orientation <= 8) {
    return { width: height, height: width };
  }
  return { width, height };
}

export async function renderCoverEmoji(
  input: Buffer,
  size: number = EMOJI_SIZE,
): Promise<RenderedEmoji> {
  // failOn "none" so a jacket with a truncated trailing byte still renders;
  // these are third-party scans, not assets we control.
  const probe = sharp(input, { failOn: "none" });
  const metadata = await probe.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("cover has no readable dimensions");
  }
  const source = {
    ...orientedSize(metadata.width, metadata.height, metadata.orientation),
    format: metadata.format ?? "unknown",
  };
  const art = containBox(source.width, source.height, size);

  const png = await sharp(input, { failOn: "none" })
    .rotate() // honor EXIF before measuring anything against the square
    .resize(size, size, {
      fit: "contain",
      position: "centre",
      kernel: "lanczos3",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toColourspace("srgb")
    .ensureAlpha()
    .png({ compressionLevel: 9, palette: false, force: true })
    .toBuffer();

  return { png, source, art };
}
