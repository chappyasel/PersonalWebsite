/**
 * The two PNG sizes every section icon ships. `tab` is the 64px raster a
 * browser without SVG favicons (Safari) downsamples for its tab strip;
 * `app` is the apple-touch-icon a home-screen bookmark shows. Chrome and
 * Firefox get the section's SVG instead, which carries both themes.
 */
export const SITE_ICON_SIZES = { tab: 64, app: 180 } as const;

/**
 * Corner radius every tab icon shares, as a fraction of its frame: the
 * photo, the section cards, the app icon, and a book's cover. Home-screen
 * tiles stay square because the OS applies its own mask.
 */
export const TILE_RADIUS = 0.22;

export type SiteIconId = keyof typeof SITE_ICON_SIZES;

export const SITE_ICON_IDS = Object.keys(SITE_ICON_SIZES) as SiteIconId[];

/** Pixel size for a route id; anything unrecognised is the tab. */
export function siteIconFrame(id: string): number {
  return id in SITE_ICON_SIZES
    ? SITE_ICON_SIZES[id as SiteIconId]
    : SITE_ICON_SIZES.tab;
}

/** What each section's icon.tsx returns from `generateImageMetadata`. */
export function siteIconImageMetadata() {
  return SITE_ICON_IDS.map((id) => ({
    id,
    size: { width: SITE_ICON_SIZES[id], height: SITE_ICON_SIZES[id] },
    contentType: "image/png",
  }));
}
