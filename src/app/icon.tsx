import { brandImageResponse } from "~/lib/icons/brandImage";

export const runtime = "nodejs";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** The main site's tab icon: Companion's orange block cursor on a rounded
 * dark tile, the same file coordination.sh ships. */
export default function Icon() {
  return brandImageResponse("icon.png");
}
