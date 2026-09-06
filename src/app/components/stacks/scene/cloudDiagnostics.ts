export type CloudDiagnosticsSnapshot = Readonly<{
  refreshRevision: number;
}>;

const INITIAL: CloudDiagnosticsSnapshot = Object.freeze({
  refreshRevision: 0,
});

export function createCloudDiagnosticsController() {
  let snapshot = INITIAL;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    refresh: () => {
      snapshot = Object.freeze({
        refreshRevision: snapshot.refreshRevision + 1,
      });
      for (const listener of listeners) listener();
      return snapshot;
    },
  };
}

/** Session-only. Each revision selects another distant slice of cloud time. */
export const cloudDiagnosticsController = createCloudDiagnosticsController();

/** Large enough that adjacent revisions cannot resemble a normal drift step. */
export const CLOUD_REFRESH_TIME_STEP = 997;
