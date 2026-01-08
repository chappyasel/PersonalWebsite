/**
 * Georgia Pro font loading for book OG images
 * Fonts are loaded from file system for build-time compatibility
 */
import { readFile } from "fs/promises";
import { join } from "path";

export async function loadGeorgiaProBold(): Promise<ArrayBuffer> {
  const fontPath = join(
    process.cwd(),
    "src/app/books/[bookId]/fonts/GeorgiaPro-Bold.ttf",
  );
  const buffer = await readFile(fontPath);
  return new Uint8Array(buffer).buffer;
}

export async function loadGeorgiaProRegular(): Promise<ArrayBuffer> {
  const fontPath = join(
    process.cwd(),
    "src/app/books/[bookId]/fonts/GeorgiaPro-Regular.ttf",
  );
  const buffer = await readFile(fontPath);
  return new Uint8Array(buffer).buffer;
}
