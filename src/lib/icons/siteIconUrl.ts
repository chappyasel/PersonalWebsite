/** Bump when shared favicon artwork changes, including Command-K page tiles. */
const SITE_ICON_VERSION = "9";

/** Use the same cache revision for page metadata and in-page icons. */
export function siteIconUrl(base: string, kind: "tab" | "app" = "tab") {
  const prefix = base.replace(/\/$/, "");
  const path = kind === "app" ? "icon/app" : "tab-icon";
  return `${prefix}/${path}?v=${SITE_ICON_VERSION}`;
}
