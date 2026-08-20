// Whether the development hooks on `window.__stacks` should exist.
//
// WHY THIS IS ITS OWN MODULE. The canvas installs the hooks, but the thing
// that needs them is the diagnostics UI, and the two are separate dynamic
// chunks that cannot import each other. The canvas used to decide from the
// URL alone, at creation time. That worked for `?debug=1` and not at all for
// the D key: pressing D after load opened the whole HUD against hooks that
// were never installed, so every field read null and the profile row said
// "Waiting" forever. The request has to be a signal the canvas can hear
// later, not a query parameter read once.

let requested = false;
const listeners = new Set<() => void>();

/** Called by the diagnostics loader, however it was triggered. */
export function requestDevHooks() {
  requested = true;
  for (const listener of listeners) listener();
}

export function devHooksRequested() {
  return requested;
}

/** The canvas subscribes so a request that arrives after creation still
 * installs. Returns an unsubscribe. */
export function onDevHooksRequested(listener: () => void) {
  listeners.add(listener);
  // The chrome can request diagnostics while the dynamically loaded canvas
  // is still mounting. Replay that request when the canvas subscribes. This
  // also reinstalls window.__stacks after Fast Refresh runs effect cleanup
  // without recreating the renderer and calling Canvas.onCreated again.
  if (requested) listener();
  return () => listeners.delete(listener);
}
