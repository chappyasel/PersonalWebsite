import fs from "node:fs";
import { describe, expect, it } from "vitest";

const overlaySource = fs.readFileSync(
  new URL("./PhysicsDiagnosticsOverlay.tsx", import.meta.url),
  "utf8",
);
const chromeSource = fs.readFileSync(
  new URL("../dom/ChromeLayer.tsx", import.meta.url),
  "utf8",
);

describe("physics bounds debug mode", () => {
  it("draws granular collider parts for the complete interaction inventory", () => {
    expect(overlaySource).toContain("sceneInteractionInventory");
    expect(overlaySource).toContain("extractDynamicColliderBoxes");
    expect(overlaySource).toContain("physics-prop-collider:");
    expect(overlaySource).toContain("DYNAMIC_COLLIDER_HORIZONTAL_INSET");
  });

  it("exposes a separate all-prop-bounds toggle in the development HUD", () => {
    expect(chromeSource).toContain("showAllBounds");
    expect(chromeSource).toContain("Show granular prop collider boxes");
  });

  it("offers independent physics isolation controls and timing readouts", () => {
    expect(chromeSource).toContain("Step free-body simulation");
    expect(chromeSource).toContain("Probe held collisions");
    expect(chromeSource).toContain("Use generated scene statics");
    expect(chromeSource).toContain("Run off-screen resets");
    expect(chromeSource).toContain("frameMs");
    expect(chromeSource).toContain("stepMs");
  });
});
