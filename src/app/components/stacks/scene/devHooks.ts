// Whether the development hooks on `window.__stacks` should exist.
//
// WHY THIS IS ITS OWN MODULE. The canvas installs the hooks, but the thing
// that needs them is the diagnostics UI, and the two are separate dynamic
// chunks that cannot import each other. The canvas used to decide from the
// URL alone, at creation time. That worked for `?debug=1` and not at all for
// the H key: pressing H after load opened the whole HUD against hooks that
// were never installed, so every field read null and the profile row said
// "Waiting" forever. The request has to be a signal the canvas can hear
// later, not a query parameter read once.

let sceneHooksRequestedValue = false;
let requested = false;
const sceneHookListeners = new Set<() => void>();
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

/** Ask the canvas for the cheap read hooks used by the compact HUD. This is a
 * separate signal from full diagnostics so keeping the HUD alive does not
 * mount scene probes or change the workload it measures. */
export function requestSceneHooks() {
  sceneHooksRequestedValue = true;
  for (const listener of sceneHookListeners) listener();
}

export function sceneHooksRequested() {
  return sceneHooksRequestedValue;
}

/** Called when the full diagnostics console is requested. */
export function requestDevHooks() {
  requested = true;
  requestSceneHooks();
  for (const listener of listeners) listener();
}

export function devHooksRequested() {
  return requested;
}

/** The canvas subscribes separately to the cheap HUD request. The immediate
 * replay is what restores window.__stacks after development effect cleanup or
 * Fast Refresh without waiting for Canvas.onCreated to run again. */
export function onSceneHooksRequested(listener: () => void) {
  sceneHookListeners.add(listener);
  if (sceneHooksRequestedValue) listener();
  return () => sceneHookListeners.delete(listener);
}

/** The canvas subscribes so a full instrumentation request that arrives after
 * creation still mounts its probes. Returns an unsubscribe. */
export function onDevHooksRequested(listener: () => void) {
  listeners.add(listener);
  if (requested) listener();
  return () => listeners.delete(listener);
}
