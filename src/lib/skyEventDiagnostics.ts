export type SkyEventDiagnosticsSnapshot = Readonly<{
  batRevision: number;
  birdRevision: number;
  shootingStarRevision: number;
}>;

const INITIAL: SkyEventDiagnosticsSnapshot = Object.freeze({
  batRevision: 0,
  birdRevision: 0,
  shootingStarRevision: 0,
});

export function createSkyEventDiagnosticsController() {
  let snapshot = INITIAL;
  const listeners = new Set<() => void>();

  const publish = (key: keyof SkyEventDiagnosticsSnapshot) => {
    snapshot = Object.freeze({
      ...snapshot,
      [key]: snapshot[key] + 1,
    });
    for (const listener of listeners) listener();
    return snapshot;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    triggerBat: () => publish("batRevision"),
    triggerBirds: () => publish("birdRevision"),
    triggerShootingStar: () => publish("shootingStarRevision"),
  };
}

/** Session-only trigger revisions. Reload restores each authored clock. */
export const skyEventDiagnosticsController =
  createSkyEventDiagnosticsController();
