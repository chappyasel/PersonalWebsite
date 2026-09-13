export function createPlantWindDiagnosticsController() {
  let enabled = true;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => enabled,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setEnabled(next: boolean) {
      if (enabled === next) return;
      enabled = next;
      for (const listener of listeners) listener();
    },
  };
}
/** Session-only pause control. No URL/storage seed or quality policy mutation. */
export const plantWindDiagnosticsController =
  createPlantWindDiagnosticsController();
