export type SectionSharePage = "systems" | "manual" | "routine";

export function isSectionSharePage(value: string): value is SectionSharePage {
  return value === "systems" || value === "manual" || value === "routine";
}

/** Only the document pages have section preview metadata. */
export function sectionSharePage(url: URL): SectionSharePage | null {
  const path = url.pathname.replace(/\/+$/, "");
  const page = path.slice(1);
  if (isSectionSharePage(page)) return page;
  if (path !== "") return null;
  const subdomain = url.hostname.split(".")[0] ?? "";
  return subdomain === "manual" || subdomain === "routine" ? subdomain : null;
}

export function sectionShareUrl(base: string, id: string): string {
  const url = new URL(base);
  // A copied section link starts fresh, without filters or a previous section.
  url.search = "";
  if (sectionSharePage(url)) url.searchParams.set("section", id);
  url.hash = id;
  return url.href;
}
