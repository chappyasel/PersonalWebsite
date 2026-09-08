import {
  GOLF_MODE_DEFAULT,
  GOLF_MODE_LIMITS,
  type GolfModeSource,
  type GolfModeTuning,
} from "./golfMode";

/**
 * The Scene console's handle on golf mode's tuning (golfMode.ts). The rig
 * reads the snapshot every frame; the console subscribes. Session only: a
 * reload forgets it and the site ships the defaults.
 */
export type GolfModeNumberKey = keyof typeof GOLF_MODE_LIMITS;

const clamp = (value: number, limits: Readonly<{ min: number; max: number }>) =>
  Number.isFinite(value)
    ? Math.min(limits.max, Math.max(limits.min, value))
    : limits.min;

export function createGolfModeConsoleController(
  initial: GolfModeTuning = GOLF_MODE_DEFAULT,
) {
  let snapshot: GolfModeTuning = Object.freeze({ ...initial });
  const listeners = new Set<() => void>();

  const publish = (next: GolfModeTuning) => {
    const changed = (Object.keys(next) as (keyof GolfModeTuning)[]).some(
      (key) => next[key] !== snapshot[key],
    );
    if (!changed) return snapshot;
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
    return snapshot;
  };

  return {
    getSnapshot: () => snapshot,

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setSource: (source: GolfModeSource) => publish({ ...snapshot, source }),

    setOccluders: (occluders: boolean) => publish({ ...snapshot, occluders }),

    setValue: (key: GolfModeNumberKey, value: number) =>
      publish({ ...snapshot, [key]: clamp(value, GOLF_MODE_LIMITS[key]) }),

    reset: () => publish({ ...GOLF_MODE_DEFAULT }),
  };
}

export const golfModeConsoleController = createGolfModeConsoleController();
