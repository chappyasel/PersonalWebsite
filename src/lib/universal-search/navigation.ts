type NavigationLocation = Pick<Location, "assign" | "href">;

export function isSameDocumentNavigation(
  currentHref: string,
  nextHref: string,
) {
  const current = new URL(currentHref);
  const next = new URL(nextHref, current);
  return (
    current.origin === next.origin &&
    current.pathname === next.pathname &&
    current.search === next.search
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
    softNavigate?: (path: string) => void;
  } = {
    location: window.location,
    notifySameDocument: () =>
      window.dispatchEvent(new PopStateEvent("popstate")),
  },
) {
  if (isSameDocumentNavigation(host.location.href, href)) {
    host.location.assign(href);
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
