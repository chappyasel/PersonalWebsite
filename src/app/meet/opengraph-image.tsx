import { DEFAULT_SLUG } from "~/lib/booking/page";

import { OG_ALT, OG_SIZE } from "./ogCard";
import { meetOgImage } from "./ogImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return meetOgImage(DEFAULT_SLUG);
}
