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
const diagnosticsRegistrySource = fs.readFileSync(
  new URL("./sceneDiagnosticsRegistry.ts", import.meta.url),
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
    expect(diagnosticsRegistrySource).toContain("showAllBounds");
    expect(diagnosticsRegistrySource).toContain("Prop collider boxes");
  });

  it("offers independent physics isolation controls and timing readouts", () => {
    expect(diagnosticsRegistrySource).toContain("Step free-body simulation");
    expect(diagnosticsRegistrySource).toContain("Probe held collisions");
    expect(diagnosticsRegistrySource).toContain("Use generated scene statics");
    expect(diagnosticsRegistrySource).toContain("Run off-screen resets");
    expect(diagnosticsSource).toContain("frameMs");
    expect(diagnosticsSource).toContain("stepMs");
  });
});
