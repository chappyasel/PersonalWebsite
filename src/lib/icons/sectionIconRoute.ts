import { loadPublicImage } from "./publicImage";
import { SECTION_ICONS, type SectionIconKey } from "./sectionIcons";
import { siteIconSvg, siteImageIconSvg } from "./siteIconSvg";

/**
 * The response every section's `tab-icon/route.ts` returns. A day in the
 * cache is plenty: the file only changes with a deploy, and browsers hold
 * favicons far longer than that on their own.
 */
export async function sectionIconSvgResponse(
  key: SectionIconKey,
): Promise<Response> {
  const spec = SECTION_ICONS[key];
  const svg =
    spec.kind === "image"
      ? siteImageIconSvg(spec, key, {
          light: await loadPublicImage(spec.light.svg),
          dark: await loadPublicImage(spec.dark),
        })
      : siteIconSvg(spec, key);
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
