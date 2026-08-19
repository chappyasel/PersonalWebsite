import { describe, expect, it, vi } from "vitest";

import {
  allPhysicsBoundsVisible,
  physicsHelpersVisible,
} from "./PhysicsDiagnosticsOverlay";
import {
  PhysicsDiagnosticsController,
  physicsDiagnosticsEnabled,
} from "./physicsDiagnostics";

describe("physics diagnostics", () => {
  it("is absent only from production", () => {
    expect(physicsDiagnosticsEnabled("development")).toBe(true);
    expect(physicsDiagnosticsEnabled("test")).toBe(true);
    expect(physicsDiagnosticsEnabled("production")).toBe(false);
  });

  it("publishes one immutable snapshot source and bounds recent events", () => {
    const controller = new PhysicsDiagnosticsController();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.update({ moduleState: "ready", plane: "lower" });
    for (let index = 0; index < 30; index++)
      controller.publish({ code: "held-safe", detail: String(index) });
    const snapshot = controller.getSnapshot();
    expect(snapshot.moduleState).toBe("ready");
    expect(snapshot.plane).toBe("lower");
    expect(snapshot.events).toHaveLength(24);
    expect(snapshot.events[0]!.detail).toBe("6");
    expect(listener).toHaveBeenCalled();
  });

  it("keeps scene helpers hidden until the diagnostics drawer enables them", () => {
    const controller = new PhysicsDiagnosticsController();
    expect(physicsHelpersVisible(controller.getSnapshot())).toBe(false);
    controller.update({ showHelpers: true });
    expect(physicsHelpersVisible(controller.getSnapshot())).toBe(true);
  });

  it("toggles all registered prop bounds independently of active helpers", () => {
    const controller = new PhysicsDiagnosticsController();
    expect(allPhysicsBoundsVisible(controller.getSnapshot())).toBe(false);
    controller.update({ showAllBounds: true });
    expect(allPhysicsBoundsVisible(controller.getSnapshot())).toBe(true);
    expect(physicsHelpersVisible(controller.getSnapshot())).toBe(false);
  });

  it("exposes independent runtime switches with safe defaults", () => {
    const controller = new PhysicsDiagnosticsController();
    expect(controller.getSnapshot().runtime).toEqual({
      simulation: true,
      heldCollisionProbes: true,
      generatedStatics: true,
      visibilityResets: true,
    });
    controller.update({
      runtime: {
        ...controller.getSnapshot().runtime,
        simulation: false,
        generatedStatics: false,
      },
    });
    expect(controller.getSnapshot().runtime.simulation).toBe(false);
    expect(controller.getSnapshot().runtime.generatedStatics).toBe(false);
    expect(controller.getSnapshot().runtime.heldCollisionProbes).toBe(true);
  });

  it("does not wake React subscribers for an unchanged diagnostic patch", () => {
    const controller = new PhysicsDiagnosticsController();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.update({ visibilityResetState: "clear" });
    controller.update({ visibilityResetState: "clear" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
