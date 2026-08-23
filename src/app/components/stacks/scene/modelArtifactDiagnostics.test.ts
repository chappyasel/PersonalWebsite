import { describe, expect, it, vi } from "vitest";

import { createModelArtifactDiagnosticsController } from "./modelArtifactDiagnostics";

describe("model artifact diagnostics", () => {
  it("ships enabled and keeps its override session-only", () => {
    const controller = createModelArtifactDiagnosticsController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    expect(controller.getSnapshot()).toEqual({ rendererEnabled: true });
    controller.setRendererEnabled(false);
    expect(controller.getSnapshot()).toEqual({ rendererEnabled: false });
    expect(listener).toHaveBeenCalledTimes(1);

    controller.reset();
    expect(controller.getSnapshot()).toEqual({ rendererEnabled: true });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
