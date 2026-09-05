import { profileIconImage } from "~/lib/icons/profileIcon";

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
  const frame = APP_ICON_SIZES.includes(px as (typeof APP_ICON_SIZES)[number])
    ? px
    : APP_ICON_SIZES[0];
  return profileIconImage(frame, "square");
}
