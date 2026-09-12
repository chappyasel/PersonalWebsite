// Shared entry for DOM links and scene actions. The request is cancelable:
// callers keep their existing behavior unless a mounted controller accepts it.
import { isRoomPathname } from "~/lib/site/roomRoutes";

export const PROTOTYPE_NAVIGATION_EVENT = "route-prototype:navigate";
export function requestPrototypeNavigation(
  href: string,
  sourceId?: string,
): boolean {
  if (typeof window === "undefined") return false;
  return !window.dispatchEvent(
    new CustomEvent(PROTOTYPE_NAVIGATION_EVENT, {
      detail: { href, sourceId },
      cancelable: true,
    }),
  );
}

const SECTIONS = [
  "books",
  "weightlifting",
  "manual",
  "routine",
  "systems",
  "liarsdice",
  "weight-log",
];
const SUBDOMAINS = ["books", "weightlifting", "manual", "routine"];
const ROOT_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "chappyasel.com",
  "www.chappyasel.com",
];

export function prototypeDestination(
  href: string,
  currentHref: string,
): URL | null {
  const current = new URL(currentHref);
  const url = new URL(href, current);
  if (!["http:", "https:"].includes(url.protocol)) return null;
  const onSubdomain = SUBDOMAINS.some((site) =>
    current.hostname.startsWith(`${site}.`),
  );
  // The controller stays mounted on the main local origin, including when a
  // development link spells it localhost and the tab uses 127.0.0.1 or a LAN IP.
  if (!onSubdomain) {
    const production = process.env.NODE_ENV === "production";
    const portal = SUBDOMAINS.find((site) =>
      (production
        ? [`${site}.chappyasel.com`]
        : [`${site}.localhost`, `${site}.chappyasel.com`]
      ).includes(url.hostname),
    );
    if (portal && url.pathname === "/")
      return new URL(`/${portal}${url.search}${url.hash}`, current.origin);
    if (
      (production
        ? ["chappyasel.com", "www.chappyasel.com"]
        : ROOT_HOSTS
      ).includes(url.hostname) &&
      (isRoomPathname(url.pathname) ||
        SECTIONS.includes(url.pathname.split("/")[1] ?? ""))
    ) {
      return new URL(url.pathname + url.search + url.hash, current.origin);
    }
  }
  if (url.origin !== current.origin) return null;
  if (
    !isRoomPathname(url.pathname) &&
    !SECTIONS.includes(url.pathname.split("/")[1] ?? "")
  )
    return null;
  return url;
}
