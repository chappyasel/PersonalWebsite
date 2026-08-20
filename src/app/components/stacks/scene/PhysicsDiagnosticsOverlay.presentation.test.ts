import fs from "node:fs";
import { describe, expect, it } from "vitest";

const overlaySource = fs.readFileSync(
  new URL("./PhysicsDiagnosticsOverlay.tsx", import.meta.url),
  "utf8",
);
const diagnosticsSource = fs.readFileSync(
  new URL("../dom/SceneDiagnostics.tsx", import.meta.url),
  "utf8",
);

describe("physics bounds debug mode", () => {
  it("draws granular collider parts for the complete interaction inventory", () => {
    expect(overlaySource).toContain("sceneInteractionInventory");
    expect(overlaySource).toContain("extractDynamicColliderBoxes");
    expect(overlaySource).toContain("physics-prop-collider:");
    expect(overlaySource).toContain("DYNAMIC_COLLIDER_HORIZONTAL_INSET");
  });

  it("exposes a separate all-prop-bounds toggle in the diagnostics console", () => {
    expect(diagnosticsSource).toContain("showAllBounds");
    expect(diagnosticsSource).toContain("Show granular prop collider boxes");
  });

  it("offers independent physics isolation controls and timing readouts", () => {
    expect(diagnosticsSource).toContain("Step free-body simulation");
    expect(diagnosticsSource).toContain("Probe held collisions");
    expect(diagnosticsSource).toContain("Use generated scene statics");
    expect(diagnosticsSource).toContain("Run off-screen resets");
    expect(diagnosticsSource).toContain("frameMs");
    expect(diagnosticsSource).toContain("stepMs");
  });
});
