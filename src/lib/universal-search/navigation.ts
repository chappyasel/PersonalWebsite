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

export function navigateUniversalSearchResult(
  href: string,
  host: {
    location: NavigationLocation;
    notifySameDocument: () => void;
  } = {
    location: window.location,
    notifySameDocument: () =>
      window.dispatchEvent(new PopStateEvent("popstate")),
  },
) {
  const sameDocument = isSameDocumentNavigation(host.location.href, href);
  host.location.assign(href);
  if (sameDocument) host.notifySameDocument();
}
