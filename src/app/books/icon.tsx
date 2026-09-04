import { SECTION_ICONS } from "~/lib/icons/sectionIcons";
import { siteIconImage } from "~/lib/icons/siteIcon";
import { siteIconImageMetadata } from "~/lib/icons/siteIconSizes";

export const runtime = "nodejs";
export const contentType = "image/png";

export function generateImageMetadata() {
  return siteIconImageMetadata();
}

/**
 * The library root's PNG tab and touch icons; the SVG favicon lives in
 * ./tab-icon. A book's own page draws its cover instead ([bookId]/icon.tsx).
 */
export default function Icon({ id }: { id: Promise<string> }) {
  return siteIconImage(id, SECTION_ICONS.books);
}
