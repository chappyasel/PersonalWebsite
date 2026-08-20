export type CameraDepthDiagnosticsState = Readonly<{
  enabled: boolean;
}>;

const INITIAL_CAMERA_DEPTH_DIAGNOSTICS_STATE: CameraDepthDiagnosticsState =
  Object.freeze({ enabled: false });

export function createCameraDepthDiagnosticsController() {
  let snapshot = INITIAL_CAMERA_DEPTH_DIAGNOSTICS_STATE;
  const listeners = new Set<() => void>();

  const publish = (enabled: boolean) => {
    if (snapshot.enabled === enabled) return snapshot;
    snapshot = Object.freeze({ enabled });
    for (const listener of listeners) listener();
    return snapshot;
  };

  return {
    getSnapshot: () => snapshot,

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setEnabled: (enabled: boolean) => publish(enabled),

    toggle: () => publish(!snapshot.enabled),

    reset: () => publish(INITIAL_CAMERA_DEPTH_DIAGNOSTICS_STATE.enabled),
  };
}

export function cameraDepthEffectEnabled(
  diagnosticsEnabled: boolean,
  reducedMotion: boolean,
  ogCapture: boolean,
) {
  return diagnosticsEnabled && !reducedMotion && !ogCapture;
}

export const cameraDepthDiagnosticsController =
  createCameraDepthDiagnosticsController();
