export type FreeRoamDiagnosticsState = Readonly<{
  enabled: boolean;
  fogEnabled: boolean;
  startFromCurrentPose: boolean;
}>;

export type FreeRoamPose = Readonly<{
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
}>;

type FreeRoamStorage = Pick<Storage, "getItem" | "setItem">;

export const FREE_ROAM_POSE_STORAGE_KEY = "stacks-free-roam-pose:v1";

function isFiniteTriplet(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) =>
      typeof component === "number" ? Number.isFinite(component) : false,
    )
  );
}

export function readFreeRoamPose(
  storage: FreeRoamStorage | null,
): FreeRoamPose | null {
  try {
    const raw = storage?.getItem(FREE_ROAM_POSE_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const pose = value as Record<string, unknown>;
    if (!isFiniteTriplet(pose.position) || !isFiniteTriplet(pose.rotation))
      return null;
    return { position: pose.position, rotation: pose.rotation };
  } catch {
    return null;
  }
}

export function writeFreeRoamPose(
  storage: FreeRoamStorage | null,
  pose: FreeRoamPose,
) {
  try {
    storage?.setItem(FREE_ROAM_POSE_STORAGE_KEY, JSON.stringify(pose));
  } catch {
    // Pose persistence is optional in private or hardened browser contexts.
  }
}

const INITIAL_FREE_ROAM_DIAGNOSTICS_STATE: FreeRoamDiagnosticsState =
  Object.freeze({
    enabled: false,
    fogEnabled: false,
    startFromCurrentPose: false,
  });

export function createFreeRoamDiagnosticsController() {
  let snapshot = INITIAL_FREE_ROAM_DIAGNOSTICS_STATE;
  const listeners = new Set<() => void>();

  const publish = (next: FreeRoamDiagnosticsState) => {
    if (
      snapshot.enabled === next.enabled &&
      snapshot.fogEnabled === next.fogEnabled &&
      snapshot.startFromCurrentPose === next.startFromCurrentPose
    )
      return snapshot;
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

    setEnabled: (enabled: boolean) =>
      publish({
        enabled,
        fogEnabled: enabled ? snapshot.fogEnabled : false,
        startFromCurrentPose: false,
      }),

    toggle: () =>
      publish({
        enabled: !snapshot.enabled,
        fogEnabled: snapshot.enabled ? false : snapshot.fogEnabled,
        startFromCurrentPose: false,
      }),

    startFromCurrentPose: () =>
      snapshot.enabled
        ? snapshot
        : publish({
            enabled: true,
            fogEnabled: false,
            startFromCurrentPose: true,
          }),

    setFogEnabled: (fogEnabled: boolean) =>
      publish({ ...snapshot, fogEnabled: snapshot.enabled && fogEnabled }),

    toggleFog: () =>
      snapshot.enabled
        ? publish({ ...snapshot, fogEnabled: !snapshot.fogEnabled })
        : snapshot,

    reset: () => publish(INITIAL_FREE_ROAM_DIAGNOSTICS_STATE),
  };
}

export const freeRoamDiagnosticsController =
  createFreeRoamDiagnosticsController();
