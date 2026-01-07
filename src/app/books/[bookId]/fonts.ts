/**
 * Georgia Pro font loading for book OG images
 */
import { readFileSync } from "fs";
import { join } from "path";

// Font file paths relative to project root
const FONTS_DIR = join(process.cwd(), "src/app/books/[bookId]/fonts");

export function loadGeorgiaProBold(): ArrayBuffer {
  const fontPath = join(FONTS_DIR, "GeorgiaPro-Bold.ttf");
  const buffer = readFileSync(fontPath);
  return new Uint8Array(buffer).buffer;
}

export function loadGeorgiaProRegular(): ArrayBuffer {
  const fontPath = join(FONTS_DIR, "GeorgiaPro-Regular.ttf");
  const buffer = readFileSync(fontPath);
  return new Uint8Array(buffer).buffer;
}
