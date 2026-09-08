// The routes with a `(.)` interceptor under an @sheet slot — the manual, the
// routine and the systems documents on the homepage host, an exercise or a
// workout on the weightlifting host — present two ways. A soft navigation
// mounts them as a sheet over the page that launched them; a hard one loads
// them as their own page. On a phone the sheet is the worse of the two: a
// card inside 12px margins, its bottom under Safari's toolbar (the page
// beneath cannot scroll, so the toolbar never collapses), the 3D world still
// live underneath. So every launcher decides here, once, which navigation to
// make. Tune the query, not the launchers.

/**
 * Where the sheet is skipped for the full page: phone portrait (under
 * Tailwind's `sm`, where the sheet's own layout already drops to its cramped
 * padding) and phone landscape, too short for a full-height card under the
 * browser chrome. Range syntax so fractional CSS pixels at odd zoom levels
 * match one side or the other.
 */
export const FULL_PAGE_QUERY = "(width < 640px), (height < 500px)";

/** True when the viewport is too small for a sheet, so a sheet route should
 * load as its own page instead. False on the server. */
export function prefersFullPage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(FULL_PAGE_QUERY).matches
  );
}

/**
 * Open a sheet route from code (a 3D prop, a calendar cell, an instance
 * row): the soft push the interceptor claims on a roomy viewport, a full
 * document load on a small one. Links use `SheetLink`, which makes the same
 * call from `onNavigate`.
 */
export function openSheetRoute(
  href: string,
  router: { push: (href: string) => void },
) {
  if (prefersFullPage()) {
    window.location.assign(href);
    return;
  }
  router.push(href);
}
