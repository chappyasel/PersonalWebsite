import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { createSkyEventDiagnosticsController } from "./skyEventDiagnostics";

const diagnostics = fs.readFileSync(
  new URL("../app/components/stacks/dom/SceneDiagnostics.tsx", import.meta.url),
  "utf8",
);
const environment = fs.readFileSync(
  new URL(
    "../app/components/stacks/scene/SceneEnvironment.tsx",
    import.meta.url,
  ),
  "utf8",
);
const wildlife = fs.readFileSync(
  new URL("../app/components/stacks/scene/Wildlife.tsx", import.meta.url),
  "utf8",
);
const shootingStar = fs.readFileSync(
  new URL("../components/daylight/ShootingStar.tsx", import.meta.url),
  "utf8",
);

describe("sky event diagnostics", () => {
  it("increments only the requested event and publishes each trigger", () => {
    const controller = createSkyEventDiagnosticsController();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.triggerBat();
    expect(controller.getSnapshot()).toEqual({
      batRevision: 1,
      birdRevision: 0,
      shootingStarRevision: 0,
    });
    controller.triggerBirds();
    controller.triggerShootingStar();

    expect(controller.getSnapshot()).toEqual({
      batRevision: 1,
      birdRevision: 1,
      shootingStarRevision: 1,
    });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("places all three one-shot actions in the Simulate panel", () => {
    const simulatePanel = diagnostics.indexOf(
      'id="stacks-diagnostics-panel-simulate"',
    );
    const renderPanel = diagnostics.indexOf(
      'id="stacks-diagnostics-panel-render"',
    );

    for (const label of [
      "Trigger bat",
      "Trigger birds",
      "Trigger shooting star",
    ]) {
      const action = diagnostics.indexOf(label);
      expect(action).toBeGreaterThan(simulatePanel);
      expect(action).toBeLessThan(renderPanel);
    }
  });

  it("restarts each event's own clock", () => {
    expect(wildlife).toContain("skyEventSnapshot.batRevision");
    expect(wildlife).toContain(
      "BAT_FLIGHT.firstRevealSeconds + triggeredBatAge",
    );
    expect(environment).toContain("uniform float uBirdTime;");
    expect(environment).toContain("skyEventSnapshot.birdRevision");
    expect(environment).toContain("triggeredBirdAge - 72.5");
    expect(shootingStar).toContain("shootingStarRevision");
    expect(shootingStar).toContain("key={revision}");
  });
});
