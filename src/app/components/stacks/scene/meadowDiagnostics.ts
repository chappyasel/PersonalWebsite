import { MEADOW_WIND } from "./meadowMotion";

export type MeadowDiagnosticsSettings = Readonly<{
  wind: number;
  speed: number;
  density: number | null;
}>;

export type MeadowDiagnosticsUpdate = Partial<MeadowDiagnosticsSettings>;

export type MeadowDiagnosticsSnapshot = MeadowDiagnosticsSettings &
  Readonly<{
    available: boolean;
    liveWind: number;
  }>;

type MeadowDiagnosticsDriver = (
  update?: MeadowDiagnosticsUpdate,
) => MeadowDiagnosticsSettings;

const INITIAL: MeadowDiagnosticsSnapshot = Object.freeze({
  available: false,
  wind: MEADOW_WIND.amplitude,
  speed: MEADOW_WIND.speed,
  density: null,
  liveWind: 0,
});

function settingsFromSnapshot(
  snapshot: MeadowDiagnosticsSnapshot,
): MeadowDiagnosticsSettings {
  return {
    wind: snapshot.wind,
    speed: snapshot.speed,
    density: snapshot.density,
  };
}

export function createMeadowDiagnosticsController() {
  let snapshot = INITIAL;
  let driver: MeadowDiagnosticsDriver | null = null;
  const listeners = new Set<() => void>();

  const publish = (settings: MeadowDiagnosticsSettings, available: boolean) => {
    const next = Object.freeze({
      available,
      ...settings,
      liveWind: snapshot.liveWind,
    });
    if (
      next.available === snapshot.available &&
      next.wind === snapshot.wind &&
      next.speed === snapshot.speed &&
      next.density === snapshot.density &&
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
      publish(nextDriver(), true);
    },

    disconnect: (previousDriver: MeadowDiagnosticsDriver) => {
      if (driver !== previousDriver) return;
      driver = null;
      publish(settingsFromSnapshot(snapshot), false);
    },

    update,

    publishLiveWind: (liveWind: number) => {
      if (!driver || Math.abs(liveWind - snapshot.liveWind) < 0.001) return;
      snapshot = Object.freeze({ ...snapshot, liveWind });
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
