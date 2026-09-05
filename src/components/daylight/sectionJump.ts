/**
 * Same-page section navigation for the daylight documents (routine, manual).
 *
 * A section reference used to be a `next/link` to `#id`. That is a router
 * navigation to the page's own path, and the root-level `(.)routine` and
 * `(.)manual` interceptors match a navigation from ANY path — including the
 * page itself — so on the full page a TL;DR link mounted the document a
 * second time inside a sheet over the document. Inside a sheet the same
 * link pushed a history entry, so the first Escape only dropped the hash
 * and the sheet needed a second close.
 *
 * So a section jump never touches the router: scroll the target into view
 * (its `scroll-margin-top` clears the sticky TOC, and scrollIntoView works
 * the same inside a sheet's scroller as on the window) and reflect the
 * section in the address bar by REPLACING the entry, the way the section
 * header's copy-link button already does.
 */

/** Fired on `window` after a jump, for sections that need to open
 * themselves (the routine's collapsibles) — a replaced hash fires no
 * `hashchange`. */
export const SECTION_JUMP_EVENT = "daylight:section-jump";

const NEXT_HISTORY_KEYS = new Set(["__NA", "__PRIVATE_NEXTJS_INTERNALS_TREE"]);

export function jumpToSection(id: string): boolean {
  const target = document.getElementById(id);
  if (!target) return false;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({
    behavior: reduce ? "auto" : "smooth",
    block: "start",
  });
  // Next patches replaceState to fold its own keys into whatever is passed
  // and to sync its URL when they are absent. Hand it the entry's other
  // keys (the 3D home stamps its own) without Next's, so the URL syncs and
  // nothing foreign is lost.
  const foreign = Object.fromEntries(
    Object.entries(
      (window.history.state ?? {}) as Record<string, unknown>,
    ).filter(([key]) => !NEXT_HISTORY_KEYS.has(key)),
  );
  window.history.replaceState(foreign, "", `#${id}`);
  window.dispatchEvent(new CustomEvent(SECTION_JUMP_EVENT, { detail: { id } }));
  return true;
}
