import { describe, expect, it, vi } from "vitest";

import { createLighthouseBeaconDiagnosticsController } from "./lighthouseBeaconDiagnostics";

describe("lighthouse beacon diagnostics", () => {
  it("starts from the approved production setting on every construction", () => {
    expect(
      createLighthouseBeaconDiagnosticsController().getSnapshot().effectEnabled,
    ).toBe(true);
    expect(
      createLighthouseBeaconDiagnosticsController().getSnapshot().effectEnabled,
    ).toBe(true);
  });

  it("publishes live session overrides without waking unchanged listeners", () => {
    const controller = createLighthouseBeaconDiagnosticsController();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.setEffectEnabled(false);
    controller.setEffectEnabled(false);

    expect(controller.getSnapshot().effectEnabled).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
