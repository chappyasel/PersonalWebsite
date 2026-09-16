import { describe, expect, it, vi } from "vitest";

import { createCoordinationGlobeDiagnosticsController } from "./coordinationGlobeDiagnostics";

describe("Coordination globe diagnostics", () => {
  it("starts approved-on and resets with a fresh page session", () => {
    const first = createCoordinationGlobeDiagnosticsController();
    first.setEffectEnabled(false);

    expect(first.getSnapshot().effectEnabled).toBe(false);
    expect(
      createCoordinationGlobeDiagnosticsController().getSnapshot()
        .effectEnabled,
    ).toBe(true);
  });

  it("publishes only real switch changes", () => {
    const controller = createCoordinationGlobeDiagnosticsController();
    const listener = vi.fn();
    const release = controller.subscribe(listener);

    controller.setEffectEnabled(true);
    controller.setEffectEnabled(false);
    controller.setEffectEnabled(false);
    release();
    controller.setEffectEnabled(true);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("toggles burst fragments independently and resets them on reload", () => {
    const controller = createCoordinationGlobeDiagnosticsController();
    controller.setBurstDebrisEnabled(false);
    expect(controller.getSnapshot()).toEqual({
      effectEnabled: true,
      burstDebrisEnabled: false,
    });
    controller.setEffectEnabled(false);
    controller.setEffectEnabled(true);
    expect(controller.getSnapshot().burstDebrisEnabled).toBe(false);
    expect(
      createCoordinationGlobeDiagnosticsController().getSnapshot()
        .burstDebrisEnabled,
    ).toBe(true);
  });
});
