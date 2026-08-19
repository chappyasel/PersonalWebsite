import { describe, expect, it, vi } from "vitest";

import {
  type MeadowDiagnosticsSettings,
  type MeadowDiagnosticsUpdate,
  createMeadowDiagnosticsController,
} from "./meadowDiagnostics";
import { MEADOW_WIND } from "./meadowMotion";

describe("meadow diagnostics controls", () => {
  it("reflects live driver values and sends edits back to the renderer", () => {
    const controller = createMeadowDiagnosticsController();
    const listener = vi.fn();
    controller.subscribe(listener);
    let settings: MeadowDiagnosticsSettings = {
      wind: MEADOW_WIND.amplitude,
      speed: MEADOW_WIND.speed,
      density: null,
    };
    const driver = vi.fn((update: MeadowDiagnosticsUpdate = {}) => {
      settings = { ...settings, ...update };
      return settings;
    });

    controller.connect(driver);
    expect(controller.getSnapshot()).toEqual({
      available: true,
      liveWind: 0,
      ...settings,
    });

    controller.update({ speed: 1.25, wind: 0.2 });
    expect(driver).toHaveBeenLastCalledWith({ speed: 1.25, wind: 0.2 });
    expect(controller.getSnapshot()).toMatchObject({
      available: true,
      speed: 1.25,
      wind: 0.2,
    });
    expect(listener).toHaveBeenCalledTimes(2);

    controller.publishLiveWind(0.187);
    expect(controller.getSnapshot().liveWind).toBe(0.187);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("resets authored wind values and disables controls when disconnected", () => {
    const controller = createMeadowDiagnosticsController();
    let settings: MeadowDiagnosticsSettings = {
      wind: 0.2,
      speed: 1.4,
      density: 0.8,
    };
    const driver = (update: MeadowDiagnosticsUpdate = {}) => {
      settings = { ...settings, ...update };
      return settings;
    };

    controller.connect(driver);
    controller.reset();
    expect(controller.getSnapshot()).toMatchObject({
      wind: MEADOW_WIND.amplitude,
      speed: MEADOW_WIND.speed,
    });

    controller.disconnect(driver);
    expect(controller.getSnapshot().available).toBe(false);
    controller.update({ speed: 2 });
    expect(controller.getSnapshot().speed).toBe(MEADOW_WIND.speed);
  });
});
