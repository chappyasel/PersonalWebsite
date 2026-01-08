/**
 * Georgia Pro font loading for book OG images
 *
 * Tries filesystem first (works during build/dev),
 * falls back to fetching from public URL (works at Vercel runtime)
 */
import { readFile } from "fs/promises";
import { join } from "path";

const PROD_URL = "https://chappyasel.com";

async function loadFont(filename: string): Promise<ArrayBuffer> {
  // Try filesystem first (works during build and local dev)
  try {
    const fontPath = join(process.cwd(), "public", "fonts", filename);
    const buffer = await readFile(fontPath);
    return new Uint8Array(buffer).buffer;
  } catch {
    // Filesystem not available (Vercel runtime), fetch from public URL
    const response = await fetch(`${PROD_URL}/fonts/${filename}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch font: ${response.status}`);
    }
    return response.arrayBuffer();
  }
}

export async function loadGeorgiaProBold(): Promise<ArrayBuffer> {
  return loadFont("GeorgiaPro-Bold.ttf");
}

export async function loadGeorgiaProRegular(): Promise<ArrayBuffer> {
  return loadFont("GeorgiaPro-Regular.ttf");
}
