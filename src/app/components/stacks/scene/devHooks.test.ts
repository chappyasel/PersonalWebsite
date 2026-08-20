import { describe, expect, it, vi } from "vitest";

import {
  onDevHooksRequested,
  requestDevHooks,
  sceneDevHooksRequestedBySearch,
  sceneDiagnosticsQueryMode,
  sceneInstrumentationRequestedBySearch,
} from "./devHooks";

describe("development hook requests", () => {
  it("replays an existing request to late subscribers and allows reinstalls", () => {
    requestDevHooks();

    const firstInstall = vi.fn();
    const unsubscribeFirst = onDevHooksRequested(firstInstall);

    expect(firstInstall).toHaveBeenCalledTimes(1);
    unsubscribeFirst();

    const remountedInstall = vi.fn();
    const unsubscribeRemounted = onDevHooksRequested(remountedInstall);

    expect(remountedInstall).toHaveBeenCalledTimes(1);

    requestDevHooks();
    expect(firstInstall).toHaveBeenCalledTimes(1);
    expect(remountedInstall).toHaveBeenCalledTimes(2);

    unsubscribeRemounted();
    requestDevHooks();
    expect(remountedInstall).toHaveBeenCalledTimes(2);
  });
});

describe("scene diagnostics query modes", () => {
  it("loads the compact production HUD without expensive instrumentation", () => {
    expect(sceneDiagnosticsQueryMode("?hud=1")).toBe("hud");
    expect(sceneDevHooksRequestedBySearch("?hud=1")).toBe(true);
    expect(sceneInstrumentationRequestedBySearch("?hud=1")).toBe(false);
  });

  it("keeps full debug and the performance harness instrumented", () => {
    expect(sceneDiagnosticsQueryMode("?debug=1")).toBe("debug");
    expect(sceneInstrumentationRequestedBySearch("?debug=1")).toBe(true);
    expect(sceneDiagnosticsQueryMode("?harness=1")).toBe("harness");
    expect(sceneInstrumentationRequestedBySearch("?harness=1")).toBe(true);
  });

  it("does not treat disabled or unrelated parameters as an opt-in", () => {
    for (const search of ["", "?hud=0", "?debug=0", "?debug", "?foo=1"]) {
      expect(sceneDiagnosticsQueryMode(search)).toBe("none");
      expect(sceneDevHooksRequestedBySearch(search)).toBe(false);
      expect(sceneInstrumentationRequestedBySearch(search)).toBe(false);
    }
  });

  it("gives harness and debug precedence over the lightweight HUD", () => {
    expect(sceneDiagnosticsQueryMode("?hud=1&debug=1")).toBe("debug");
    expect(sceneDiagnosticsQueryMode("?hud=1&harness=1")).toBe("harness");
  });
});
