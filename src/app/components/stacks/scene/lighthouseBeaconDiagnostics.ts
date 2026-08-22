export type LighthouseBeaconDiagnosticsSnapshot = Readonly<{
  effectEnabled: boolean;
}>;

const INITIAL: LighthouseBeaconDiagnosticsSnapshot = Object.freeze({
  effectEnabled: true,
});

export function createLighthouseBeaconDiagnosticsController() {
  let snapshot = INITIAL;
  const listeners = new Set<() => void>();
  const publish = (next: LighthouseBeaconDiagnosticsSnapshot) => {
    if (next.effectEnabled === snapshot.effectEnabled) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setEffectEnabled: (effectEnabled: boolean) => publish({ effectEnabled }),
  };
}

/** Session memory only. Reloading restores the production beacon policy. */
export const lighthouseBeaconDiagnosticsController =
  createLighthouseBeaconDiagnosticsController();
