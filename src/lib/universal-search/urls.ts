import { COMMAND_ENTRIES } from "./registry";
import type { CommandDestinationTarget, SiteTarget } from "./types";

export type SearchLocation = Pick<Location, "hostname" | "port" | "protocol">;

const PRODUCTION_HOSTS: Record<SiteTarget, string> = {
  home: "www.chappyasel.com",
  books: "books.chappyasel.com",
  manual: "manual.chappyasel.com",
  routine: "routine.chappyasel.com",
  weightlifting: "weightlifting.chappyasel.com",
};

const CANONICAL_DOMAIN = "chappyasel.com";

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

function isCanonicalHost(hostname: string) {
  return (
    hostname === CANONICAL_DOMAIN || hostname.endsWith(`.${CANONICAL_DOMAIN}`)
  );
}

function siteBase(site: SiteTarget, location: SearchLocation) {
  if (isCanonicalHost(location.hostname)) {
    return new URL(`https://${PRODUCTION_HOSTS[site]}/`);
  }

  const port = location.port ? `:${location.port}` : "";
  if (isLocalhost(location.hostname)) {
    const host = site === "home" ? "localhost" : `${site}.localhost`;
    return new URL(`${location.protocol}//${host}${port}/`);
  }

  const path = site === "home" ? "/" : `/${site}/`;
  return new URL(path, `${location.protocol}//${location.hostname}${port}`);
}

export function resolveDestinationTarget(
  target: CommandDestinationTarget,
  location: SearchLocation,
) {
  const relativePath = (target.path ?? "/").replace(/^\/+/, "");
  const url = new URL(relativePath, siteBase(target.site, location));
  if (target.hash) url.hash = target.hash;
  return url.toString();
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
