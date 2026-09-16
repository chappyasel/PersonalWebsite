import { COMMAND_ENTRIES } from "./registry";
import type { CommandDestinationTarget, SiteTarget } from "./types";

export type SearchLocation = Pick<Location, "hostname" | "port" | "protocol">;

const CANONICAL_DOMAIN = "chappyasel.com";
const SECTION_SITES = ["books", "manual", "routine", "weightlifting"] as const;
const SUBDOMAIN_SITES = ["books", "weightlifting"] as const;

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

function isCanonicalHost(hostname: string) {
  return (
    hostname === CANONICAL_DOMAIN || hostname.endsWith(`.${CANONICAL_DOMAIN}`)
  );
}

function siteBase(site: SiteTarget, location: SearchLocation) {
  const path = site === "home" ? "/" : `/${site}/`;
  const subdomain = SUBDOMAIN_SITES.some((section) => section === site);
  if (isCanonicalHost(location.hostname)) {
    return subdomain
      ? new URL(`https://${site}.${CANONICAL_DOMAIN}/`)
      : new URL(path, "https://www.chappyasel.com");
  }

  const port = location.port ? `:${location.port}` : "";
  if (isLocalhost(location.hostname)) {
    return subdomain
      ? new URL(`${location.protocol}//${site}.localhost${port}/`)
      : new URL(path, `${location.protocol}//localhost${port}`);
  }

  return new URL(path, `${location.protocol}//${location.hostname}${port}`);
}

export function resolveDestinationTarget(
  target: CommandDestinationTarget,
  location: SearchLocation,
) {
  const relativePath = (target.path ?? "/").replace(/^\/+/, "");
  const url = new URL(relativePath, siteBase(target.site, location));
  if (!relativePath && url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/$/, "");
  }
  if (target.hash) url.hash = target.hash;
  return url.toString();
}

/** Keep saved and indexed links aligned with each section's URL style. */
export function resolveSearchResultHref(
  href: string,
  location: SearchLocation,
) {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return href;
  const subdomainSite = SECTION_SITES.find(
    (section) =>
      url.hostname === `${section}.localhost` ||
      url.hostname === `${section}.${CANONICAL_DOMAIN}`,
  );
  const mainHost = siteBase("home", location).hostname;
  const onMainHost =
    url.hostname === mainHost ||
    url.hostname === CANONICAL_DOMAIN ||
    url.hostname === `www.${CANONICAL_DOMAIN}` ||
    url.hostname === "localhost";
  const site =
    subdomainSite ??
    (onMainHost
      ? SUBDOMAIN_SITES.find(
          (section) =>
            url.pathname === `/${section}` ||
            url.pathname.startsWith(`/${section}/`),
        )
      : undefined);
  if (!site) return href;
  const prefix = `/${site}`;
  const path =
    url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)
      ? url.pathname.slice(prefix.length)
      : url.pathname;
  const resolved = new URL(
    resolveDestinationTarget({ kind: "site", site, path }, location),
  );
  resolved.search = url.search;
  resolved.hash = url.hash;
  return resolved.toString();
}

export function resolveRegistryDestination(
  entryId: string,
  location: SearchLocation,
) {
  const entry = COMMAND_ENTRIES.find((candidate) => candidate.id === entryId);
  if (!entry) throw new Error(`Unknown Command registry entry: ${entryId}`);
  if (entry.kind !== "destination") {
    throw new Error(`Command registry entry is not a destination: ${entryId}`);
  }
  return resolveDestinationTarget(entry.target, location);
}
