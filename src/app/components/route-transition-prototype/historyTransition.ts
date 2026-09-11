/** Delay Next's popstate restore until the browser has captured the old page.
 * The URL has already changed. Replay the original state once, without pushing
 * an entry or calling history.go. Ordinary modal/hash traversal passes through.
 */
export function installHistoryTransition({
  accepts,
  transition,
  cancel,
}: {
  accepts: (url: URL) => boolean;
  transition: (url: URL, state: unknown, restore: () => void) => Promise<void>;
  cancel: () => void;
}) {
  let release: (() => void) | null = null;
  let replaying = false;
  let sequence = 0;
  const pop = (event: PopStateEvent) => {
    if (replaying) return;
    // A newer traversal owns the URL. Never replay the superseded state.
    sequence++;
    release = null;
    cancel();
    const url = new URL(location.href);
    const state: unknown = event.state;
    if (
      !state ||
      typeof state !== "object" ||
      !("__NA" in state) ||
      state.__NA !== true ||
      !accepts(url)
    )
      return;
    event.stopImmediatePropagation();
    const token = sequence;
    let restored = false;
    const restore = () => {
      if (restored || token !== sequence) return;
      restored = true;
      release = null;
      replaying = true;
      try {
        window.dispatchEvent(new PopStateEvent("popstate", { state }));
      } finally {
        replaying = false;
      }
    };
    release = restore;
    void transition(url, state, restore)
      .catch(() => undefined)
      .finally(restore);
  };
  const hash = (event: HashChangeEvent) => {
    if (release) event.stopImmediatePropagation();
  };
  const bridge = window.__booksRouteHistory;
  if (bridge) bridge.pop = pop;
  else window.addEventListener("popstate", pop, true);
  window.addEventListener("hashchange", hash, true);
  return () => {
    if (bridge?.pop === pop) bridge.pop = null;
    else window.removeEventListener("popstate", pop, true);
    window.removeEventListener("hashchange", hash, true);
    release?.();
  };
}
