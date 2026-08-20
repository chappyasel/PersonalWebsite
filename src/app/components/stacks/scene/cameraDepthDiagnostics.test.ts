import { describe, expect, it, vi } from "vitest";

import {
  cameraDepthEffectEnabled,
  createCameraDepthDiagnosticsController,
} from "./cameraDepthDiagnostics";

describe("camera depth diagnostics", () => {
  it("starts disabled without persisting changes between controller loads", () => {
    const first = createCameraDepthDiagnosticsController();
    expect(first.getSnapshot()).toEqual({ enabled: false });
    first.setEnabled(true);

    const reloaded = createCameraDepthDiagnosticsController();
    expect(reloaded.getSnapshot()).toEqual({ enabled: false });
  });

  it("publishes toggles once and can reset to the authored default", () => {
    const controller = createCameraDepthDiagnosticsController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.toggle();
    expect(controller.getSnapshot()).toEqual({ enabled: true });
    expect(listener).toHaveBeenCalledTimes(1);

    controller.setEnabled(true);
    expect(listener).toHaveBeenCalledTimes(1);

    controller.reset();
    expect(controller.getSnapshot()).toEqual({ enabled: false });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    controller.toggle();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("cedes ownership to reduced motion and OG capture", () => {
    expect(cameraDepthEffectEnabled(true, false, false)).toBe(true);
    expect(cameraDepthEffectEnabled(false, false, false)).toBe(false);
    expect(cameraDepthEffectEnabled(true, true, false)).toBe(false);
    expect(cameraDepthEffectEnabled(true, false, true)).toBe(false);
  });
});
