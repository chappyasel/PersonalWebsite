import {
  golfSuspenseEnabled,
  setGolfSuspenseEnabled,
  subscribeGolfSuspenseEnabled,
} from "./golf/golfSuspense";

/**
 * The Scene console's handle on the cup-edge push-in's gate. golfSuspense.ts
 * keeps the flag as a plain module value read each frame; this is the
 * store shape the console wants over it, and nothing else. The flag can
 * also be set by `?suspense=1` and `__stacks.golf.suspense(true)`, and the
 * switch follows those because it subscribes to the flag rather than to
 * itself. Diagnostics only: the site ships it off, and a reload forgets it.
 */
export const GOLF_SUSPENSE_CONSOLE_DEFAULT = false;

export const golfSuspenseConsoleController = {
  getSnapshot: () => golfSuspenseEnabled(),
  subscribe: subscribeGolfSuspenseEnabled,
  setEnabled: (enabled: boolean) => setGolfSuspenseEnabled(enabled),
  reset: () => setGolfSuspenseEnabled(GOLF_SUSPENSE_CONSOLE_DEFAULT),
};
