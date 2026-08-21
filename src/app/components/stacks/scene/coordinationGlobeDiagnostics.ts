export type CoordinationGlobeDiagnosticsSnapshot = Readonly<{
  effectEnabled: boolean;
}>;

const INITIAL: CoordinationGlobeDiagnosticsSnapshot = Object.freeze({
  effectEnabled: true,
});

export function createCoordinationGlobeDiagnosticsController() {
  let snapshot = INITIAL;
  const listeners = new Set<() => void>();
  const publish = (next: CoordinationGlobeDiagnosticsSnapshot) => {
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

/** Session memory only. A reload constructs a fresh approved production
 * state instead of carrying a diagnostic override into another visit. */
export const coordinationGlobeDiagnosticsController =
  createCoordinationGlobeDiagnosticsController();
