import type { Metadata } from "next";

import { SITE_ICON_SIZES } from "./siteIconSizes";

/**
 * The `icons` metadata for a section that ships its own icon routes: an
 * SVG favicon that recolours itself for the browser's colour scheme, and
 * the PNG touch icon for home screens (Safari, which ignores SVG icons,
 * falls back to it for its tab too).
 *
 * Config icons are needed at all because Next drops every file-based icon
 * the moment any layout in the chain declares `icons`, and the root layout
 * cannot: the subdomain proxy rewrites a bare `/tab-icon` on
 * books.chappyasel.com into `/books/tab-icon`, so each section links its
 * own. `base` is the section's origin (a subdomain site, absolute because
 * Next writes icons verbatim) or its path prefix on the main host.
 */
export function siteIconMetadata(base: string): NonNullable<Metadata["icons"]> {
  const prefix = base.replace(/\/$/, "");
  return {
    icon: [{ url: `${prefix}/tab-icon`, type: "image/svg+xml", sizes: "any" }],
    apple: [
      {
        url: `${prefix}/icon/app`,
        sizes: `${SITE_ICON_SIZES.app}x${SITE_ICON_SIZES.app}`,
        type: "image/png",
      },
    ],
  };
}
