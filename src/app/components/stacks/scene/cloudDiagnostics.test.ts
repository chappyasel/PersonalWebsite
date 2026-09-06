import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  CLOUD_REFRESH_TIME_STEP,
  createCloudDiagnosticsController,
} from "./cloudDiagnostics";

const environment = fs.readFileSync(
  new URL("./SceneEnvironment.tsx", import.meta.url),
  "utf8",
);
const diagnostics = fs.readFileSync(
  new URL("../dom/SceneDiagnostics.tsx", import.meta.url),
  "utf8",
);

describe("cloud diagnostics", () => {
  it("selects a new cloud-time slice for every refresh", () => {
    const controller = createCloudDiagnosticsController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    expect(controller.getSnapshot().refreshRevision).toBe(0);
    expect(controller.refresh().refreshRevision).toBe(1);
    expect(controller.refresh().refreshRevision).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(CLOUD_REFRESH_TIME_STEP).toBeGreaterThan(0);

    unsubscribe();
    controller.refresh();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps the refresh action with live weather simulation", () => {
    const simulatePanel = diagnostics.indexOf(
      'id="stacks-diagnostics-panel-simulate"',
    );
    const refreshAction = diagnostics.indexOf("Refresh clouds");
    const renderPanel = diagnostics.indexOf(
      'id="stacks-diagnostics-panel-render"',
    );

    expect(simulatePanel).toBeGreaterThanOrEqual(0);
    expect(refreshAction).toBeGreaterThan(simulatePanel);
    expect(refreshAction).toBeLessThan(renderPanel);
    expect(diagnostics.slice(simulatePanel, refreshAction)).toContain(
      "<legend>Weather</legend>",
    );
  });

  it("advances only the cloud clock in the sky shader", () => {
    expect(environment).toContain("uniform float uCloudTime;");
    expect(environment).toContain("u.uTime!.value = clock.elapsedTime;");
    expect(environment).toContain(
      "cloudDiagnosticsController.getSnapshot().refreshRevision",
    );
    expect(environment).toContain(
      "uCloudTime * ${SKY_LIGHTING.atmosphere.cloudDrift.toFixed(3)}",
    );
    expect(environment).toContain("vec3 dcCloudField(float az, float el)");
  });
});
