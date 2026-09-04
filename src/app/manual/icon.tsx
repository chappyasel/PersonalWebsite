import { SECTION_ICONS } from "~/lib/icons/sectionIcons";
import { siteIconImage } from "~/lib/icons/siteIcon";
import { siteIconImageMetadata } from "~/lib/icons/siteIconSizes";

export const runtime = "nodejs";
export const contentType = "image/png";

export function generateImageMetadata() {
  return siteIconImageMetadata();
}

/** The PNG tab and touch icons; the SVG favicon lives in ./tab-icon. */
export default function Icon({ id }: { id: Promise<string> }) {
  return siteIconImage(id, SECTION_ICONS.manual);
}
