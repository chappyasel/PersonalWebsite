import type { MeadowDeformationDiagnostics } from "./meadowDeformation";
import { MEADOW_WIND } from "./meadowMotion";

export type MeadowDiagnosticsSettings = Readonly<{
  wind: number;
  speed: number;
  density: number | null;
  deformationEnabled: boolean;
}>;

export type MeadowDiagnosticsUpdate = Partial<MeadowDiagnosticsSettings>;

export type MeadowDiagnosticsSnapshot = MeadowDiagnosticsSettings &
  Readonly<{
    available: boolean;
    liveWind: number;
    deformation: MeadowDeformationDiagnostics;
  }>;

type MeadowDiagnosticsDriver = (
  update?: MeadowDiagnosticsUpdate,
) => MeadowDiagnosticsSettings;

const INITIAL: MeadowDiagnosticsSnapshot = Object.freeze({
  available: false,
  wind: MEADOW_WIND.amplitude,
  speed: MEADOW_WIND.speed,
  density: null,
  deformationEnabled: false,
  liveWind: 0,
  deformation: Object.freeze({
    textureCount: 0,
    acceptedStamps: 0,
    droppedStamps: 0,
    outOfBoundsStamps: 0,
    active: false,
    recoveryDraws: 0,
    resetRevision: 0,
    cpuSubmissionMs: 0,
  }),
});

function settingsFromSnapshot(
  snapshot: MeadowDiagnosticsSnapshot,
): MeadowDiagnosticsSettings {
  return {
    wind: snapshot.wind,
    speed: snapshot.speed,
    density: snapshot.density,
    deformationEnabled: snapshot.deformationEnabled,
  };
}

export function createMeadowDiagnosticsController() {
  let snapshot = INITIAL;
  let driver: MeadowDiagnosticsDriver | null = null;
  let pendingSeed: MeadowDiagnosticsUpdate | null = null;
  const listeners = new Set<() => void>();

  const publish = (settings: MeadowDiagnosticsSettings, available: boolean) => {
    const next = Object.freeze({
      available,
      ...settings,
      liveWind: snapshot.liveWind,
      deformation: snapshot.deformation,
    });
    if (
      next.available === snapshot.available &&
      next.wind === snapshot.wind &&
      next.speed === snapshot.speed &&
      next.density === snapshot.density &&
      next.deformationEnabled === snapshot.deformationEnabled &&
      next.liveWind === snapshot.liveWind
    )
      return snapshot;
    snapshot = next;
    for (const listener of listeners) listener();
    return snapshot;
  };

  const update = (patch?: MeadowDiagnosticsUpdate) => {
    if (!driver) return settingsFromSnapshot(snapshot);
    const settings = driver(patch);
    publish(settings, true);
    return settings;
  };

  return {
    getSnapshot: () => snapshot,

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    connect: (nextDriver: MeadowDiagnosticsDriver) => {
      driver = nextDriver;
      const seed = pendingSeed;
      pendingSeed = null;
      publish(nextDriver(seed ?? undefined), true);
    },

    disconnect: (previousDriver: MeadowDiagnosticsDriver) => {
      if (driver !== previousDriver) return;
      driver = null;
      publish(settingsFromSnapshot(snapshot), false);
    },

    update,

    seed: (patch: MeadowDiagnosticsUpdate) => {
      if (driver) return update(patch);
      pendingSeed = { ...pendingSeed, ...patch };
      publish({ ...settingsFromSnapshot(snapshot), ...patch }, false);
      return settingsFromSnapshot(snapshot);
    },

    publishLiveWind: (liveWind: number) => {
      if (!driver || Math.abs(liveWind - snapshot.liveWind) < 0.001) return;
      snapshot = Object.freeze({ ...snapshot, liveWind });
      for (const listener of listeners) listener();
    },

    publishDeformation: (deformation: MeadowDeformationDiagnostics) => {
      if (!driver) return;
      const previous = snapshot.deformation;
      if (
        previous.textureCount === deformation.textureCount &&
        previous.acceptedStamps === deformation.acceptedStamps &&
        previous.droppedStamps === deformation.droppedStamps &&
        previous.outOfBoundsStamps === deformation.outOfBoundsStamps &&
        previous.active === deformation.active &&
        previous.recoveryDraws === deformation.recoveryDraws &&
        previous.resetRevision === deformation.resetRevision &&
        previous.cpuSubmissionMs === deformation.cpuSubmissionMs
      )
        return;
      snapshot = Object.freeze({ ...snapshot, deformation });
      for (const listener of listeners) listener();
    },

    reset: () =>
      update({
        wind: MEADOW_WIND.amplitude,
        speed: MEADOW_WIND.speed,
      }),
  };
}

export const meadowDiagnosticsController = createMeadowDiagnosticsController();
