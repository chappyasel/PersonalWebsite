import { describe, expect, it, vi } from "vitest";

import {
  FREE_ROAM_STORAGE_KEY,
  createFreeRoamDiagnosticsController,
  readFreeRoamEnabled,
  readFreeRoamPose,
  writeFreeRoamEnabled,
  writeFreeRoamPose,
} from "./freeRoamDiagnostics";

describe("free-roam diagnostics", () => {
  it("reads and writes the persisted free-roam preference", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(readFreeRoamEnabled(storage)).toBe(false);
    writeFreeRoamEnabled(storage, true);
    expect(values.get(FREE_ROAM_STORAGE_KEY)).toBe("true");
    expect(readFreeRoamEnabled(storage)).toBe(true);
    writeFreeRoamEnabled(storage, false);
    expect(readFreeRoamEnabled(storage)).toBe(false);
  });

  it("treats blocked storage as an unavailable preference", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readFreeRoamEnabled(storage)).toBe(false);
    expect(() => writeFreeRoamEnabled(storage, true)).not.toThrow();
  });

  it("round-trips the free-roam camera pose across reloads", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const pose = {
      position: [12.5, 3.25, -8] as const,
      rotation: [-0.2, 1.1, 0] as const,
    };

    expect(readFreeRoamPose(storage)).toBeNull();
    writeFreeRoamPose(storage, pose);
    expect(readFreeRoamPose(storage)).toEqual(pose);
  });

  it("ignores malformed or non-finite persisted poses", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          position: [0, Number.POSITIVE_INFINITY, 2],
          rotation: [0, 0, 0],
        }),
      setItem: () => undefined,
    };

    expect(readFreeRoamPose(storage)).toBeNull();
  });

  it("publishes changes once and resets to the authored camera", () => {
    const controller = createFreeRoamDiagnosticsController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.toggle();
    expect(controller.getSnapshot()).toEqual({
      enabled: true,
      fogEnabled: false,
      startFromCurrentPose: false,
    });
    expect(listener).toHaveBeenCalledTimes(1);

    controller.setEnabled(true);
    expect(listener).toHaveBeenCalledTimes(1);

    controller.reset();
    expect(controller.getSnapshot()).toEqual({
      enabled: false,
      fogEnabled: false,
      startFromCurrentPose: false,
    });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    controller.toggle();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh free-roam camera from the current authored pose", () => {
    const controller = createFreeRoamDiagnosticsController();

    controller.startFromCurrentPose();
    expect(controller.getSnapshot()).toEqual({
      enabled: true,
      fogEnabled: false,
      startFromCurrentPose: true,
    });

    controller.setEnabled(false);
    controller.setEnabled(true);
    expect(controller.getSnapshot().startFromCurrentPose).toBe(false);
  });

  it("toggles fog only while free roam owns the camera", () => {
    const controller = createFreeRoamDiagnosticsController();

    controller.toggleFog();
    expect(controller.getSnapshot().fogEnabled).toBe(false);

    controller.setEnabled(true);
    controller.toggleFog();
    expect(controller.getSnapshot().fogEnabled).toBe(true);

    controller.setFogEnabled(false);
    expect(controller.getSnapshot().fogEnabled).toBe(false);

    controller.setEnabled(false);
    expect(controller.getSnapshot()).toEqual({
      enabled: false,
      fogEnabled: false,
      startFromCurrentPose: false,
    });
  });
});
