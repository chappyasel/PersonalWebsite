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

export type SceneDiagnosticsQueryMode =
  | "none"
  | "hud"
  | "debug"
  | "harness";

/** Resolve the URL's diagnostics surface once so the chrome and canvas cannot
 * disagree about whether a visit requested cheap hooks or expensive probes. */
export function sceneDiagnosticsQueryMode(
  search: string | URLSearchParams,
): SceneDiagnosticsQueryMode {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  if (params.has("harness")) return "harness";
  if (params.get("debug") === "1") return "debug";
  if (params.get("hud") === "1") return "hud";
  return "none";
}

/** The compact production HUD needs the read-only window hooks, but no scene
 * probes. Full debug and the performance harness need both. */
export function sceneDevHooksRequestedBySearch(
  search: string | URLSearchParams,
) {
  return sceneDiagnosticsQueryMode(search) !== "none";
}

export function sceneInstrumentationRequestedBySearch(
  search: string | URLSearchParams,
) {
  const mode = sceneDiagnosticsQueryMode(search);
  return mode === "debug" || mode === "harness";
}

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
