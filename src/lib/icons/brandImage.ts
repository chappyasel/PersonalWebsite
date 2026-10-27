import { readFile } from "fs/promises";
import { join } from "path";

const PROD_URL = "https://www.chappyasel.com";

/**
 * Companion's marks, committed as PNGs so they match coordination.sh byte
 * for byte: the orange block cursor on the dark tile (`icon.png`, and the
 * full-bleed home-screen tiles `apple-icon-<px>.png`), and the share card
 * with the handle typed beside it (`home-og.png`, rendered with SF Mono,
 * which Vercel's image renderer does not have).
 */
export type BrandImage =
  | "icon.png"
  | "apple-icon-180.png"
  | "apple-icon-192.png"
  | "apple-icon-512.png"
  | "home-og.png";

export async function brandImageResponse(file: BrandImage): Promise<Response> {
  const path = `images/brand/${file}`;
  let body: ArrayBuffer;
  try {
    const buffer = await readFile(join(process.cwd(), "public", path));
    body = new Uint8Array(buffer).buffer;
  } catch {
    const response = await fetch(`${PROD_URL}/${path}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: ${response.status}`);
    }
    body = await response.arrayBuffer();
  }
  return new Response(body, { headers: { "content-type": "image/png" } });
}
