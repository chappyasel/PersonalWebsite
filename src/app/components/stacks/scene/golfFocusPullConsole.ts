import {
  type GolfFocusPullVariant,
  golfFocusPullVariant,
  setGolfFocusPullVariant,
} from "./shelfDepthOfField";

/**
 * The Scene console's handle on the golf focus rack's before/after seam.
 * shelfDepthOfField keeps the variant as a plain module value read at call
 * time; the console needs a store it can subscribe to, so this wraps the
 * getter and setter with listeners and nothing else. Diagnostics only: the
 * site ships "current", and a reload forgets the switch.
 */
export type GolfFocusPullConsoleState = Readonly<{
  variant: GolfFocusPullVariant;
}>;

export const GOLF_FOCUS_PULL_CONSOLE_DEFAULT: GolfFocusPullConsoleState =
  Object.freeze({ variant: "current" });

export function createGolfFocusPullConsoleController(
  read: () => GolfFocusPullVariant = golfFocusPullVariant,
  write: (next: GolfFocusPullVariant) => void = setGolfFocusPullVariant,
) {
  let snapshot: GolfFocusPullConsoleState = Object.freeze({ variant: read() });
  const listeners = new Set<() => void>();

  const publish = (variant: GolfFocusPullVariant) => {
    if (snapshot.variant === variant) return snapshot;
    write(variant);
    snapshot = Object.freeze({ variant });
    for (const listener of listeners) listener();
    return snapshot;
  };

  return {
    getSnapshot: () => snapshot,

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setVariant: (variant: GolfFocusPullVariant) => publish(variant),

    reset: () => publish(GOLF_FOCUS_PULL_CONSOLE_DEFAULT.variant),
  };
}

export const golfFocusPullConsoleController =
  createGolfFocusPullConsoleController();
