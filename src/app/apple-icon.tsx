import { brandImageResponse } from "~/lib/icons/brandImage";

export const runtime = "nodejs";

export const contentType = "image/png";

/**
 * Home-screen tiles, full bleed so the OS can apply its own mask: 180 is the
 * apple-touch-icon, 192 and 512 are what the web manifest lists.
 */
export const APP_ICON_SIZES = [180, 192, 512] as const;

export function generateImageMetadata() {
  return APP_ICON_SIZES.map((px) => ({
    id: String(px),
    size: { width: px, height: px },
    contentType: "image/png",
  }));
}

export default async function AppleIcon({ id }: { id: Promise<string> }) {
  const px = Number(await id);
  const frame: (typeof APP_ICON_SIZES)[number] = APP_ICON_SIZES.includes(
    px as (typeof APP_ICON_SIZES)[number],
  )
    ? (px as (typeof APP_ICON_SIZES)[number])
    : APP_ICON_SIZES[0];
  return brandImageResponse(`apple-icon-${frame}.png`);
}
