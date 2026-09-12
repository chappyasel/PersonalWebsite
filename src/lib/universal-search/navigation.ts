import { isRoomPathname } from "~/lib/site/roomRoutes";

type NavigationLocation = Pick<Location, "assign" | "href">;

/** Hosts whose app is a reading section, where `/golf` could be a slug. */
const SECTION_SUBDOMAINS = [
  "books.",
  "weightlifting.",
  "manual.",
  "routine.",
  "dad.",
];

function servesRoom(hostname: string) {
  return !SECTION_SUBDOMAINS.some((prefix) => hostname.startsWith(prefix));
}

/** Whether two URLs are the same live document. Fragment-only moves are; so
 * are moves between the room's own paths (`/`, `/golf`, `/projects`), which
 * one mounted room serves without a page load. */
export function isSameDocumentNavigation(
  currentHref: string,
  nextHref: string,
) {
  const current = new URL(currentHref);
  const next = new URL(nextHref, current);
  if (current.origin !== next.origin || current.search !== next.search)
    return false;
  if (current.pathname === next.pathname) return true;
  return (
    servesRoom(current.hostname) &&
    isRoomPathname(current.pathname) &&
    isRoomPathname(next.pathname)
  );
}

/** Whether a same-origin result may soft-navigate through the app router
 * instead of a full page load. Only on hosts whose apps run no intercepted
 * routes — a router.push on the home or weightlifting app can be claimed by
 * a `(.)` interceptor and open the destination as a sheet over the current
 * page, which is wrong for a search jump. The books and dad apps have no
 * interceptors, so their in-app jumps keep the document alive. */
export function canSoftNavigate(currentHref: string, nextHref: string) {
  const current = new URL(currentHref);
  const next = new URL(nextHref, current);
  if (current.origin !== next.origin) return false;
  return (
    current.hostname.startsWith("books.") || current.hostname.startsWith("dad.")
  );
}

export function navigateUniversalSearchResult(
  href: string,
  host: {
    location: NavigationLocation;
    notifySameDocument: () => void;
    /** Writes a same-document entry the browser would not: a move between
     * room paths, or a jump to the stop already shown. */
    pushSameDocument?: (path: string) => void;
    /** Tells the room it has an explicit destination even though no
     * fragment changed. The room treats it like a hashchange. */
    notifyExplicitDestination?: () => void;
    softNavigate?: (path: string) => void;
  } = {
    location: window.location,
    notifySameDocument: () =>
      window.dispatchEvent(new PopStateEvent("popstate")),
    pushSameDocument: (path) => window.history.pushState(null, "", path),
    notifyExplicitDestination: () =>
      window.dispatchEvent(new HashChangeEvent("hashchange")),
  },
) {
  if (isSameDocumentNavigation(host.location.href, href)) {
    const current = new URL(host.location.href);
    const next = new URL(href, current);
    if (next.hash && current.pathname === next.pathname) {
      // A fragment move: the browser writes the entry and fires hashchange.
      host.location.assign(href);
    } else {
      host.pushSameDocument?.(`${next.pathname}${next.search}${next.hash}`);
      host.notifyExplicitDestination?.();
    }
    host.notifySameDocument();
    return;
  }
  if (host.softNavigate && canSoftNavigate(host.location.href, href)) {
    const next = new URL(href, host.location.href);
    host.softNavigate(`${next.pathname}${next.search}${next.hash}`);
    return;
  }
  host.location.assign(href);
}
