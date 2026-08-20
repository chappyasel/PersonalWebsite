import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sceneEnvironment = readFileSync(
  fileURLToPath(new URL("./SceneEnvironment.tsx", import.meta.url)),
  "utf8",
);

describe("Golden Gate silhouette", () => {
  it("keeps recognizable portal towers through cinematic blur", () => {
    expect(sceneEnvironment).toContain("float towerLegs");
    expect(sceneEnvironment).toContain("float portalBeams");
    expect(sceneEnvironment).toContain("float towerCap");
    expect(sceneEnvironment).toContain("float towerHalfW = 0.00345");
    expect(sceneEnvironment).toContain("float legOffset = 0.00245");
    expect(sceneEnvironment).toContain("towerLegs + portalBeams + towerCap");
  });

  it("continues the suspension system beyond both towers", () => {
    expect(sceneEnvironment.includes("float mainCable")).toBe(true);
    expect(sceneEnvironment.includes("float outsideCable")).toBe(true);
    expect(sceneEnvironment.includes("float outsideCableY")).toBe(true);
    expect(sceneEnvironment.includes("float outerSuspenders")).toBe(true);
    expect(sceneEnvironment.includes("abs(gx) < 1.58")).toBe(true);
  });

  it("uses two aviation beacons on each tower cap", () => {
    expect(sceneEnvironment.includes("float dGaL")).toBe(true);
    expect(sceneEnvironment.includes("float dGaR")).toBe(true);
    expect(sceneEnvironment.includes("float dGbL")).toBe(true);
    expect(sceneEnvironment.includes("float dGbR")).toBe(true);
  });

  it("omits the unreadable Coit Tower silhouette", () => {
    expect(sceneEnvironment.includes("float coit =")).toBe(false);
    expect(sceneEnvironment.includes("city + sutro + coit +")).toBe(false);
  });

  it("separates the lit roadway from a darker lower truss", () => {
    expect(sceneEnvironment).toContain("float deckTruss");
    expect(sceneEnvironment).toContain("ggbDeck + deckTruss");
    expect(sceneEnvironment).not.toContain(
      "ggbTower = tower;\n      ggbDeckY = deckY;\n      ggb = clamp(tower + cable + ggbDeck + sus",
    );
  });

  it("keeps the suspension arch visible at night without beading it", () => {
    expect(sceneEnvironment).toContain("float ggbCable = 0.0");
    expect(sceneEnvironment).toContain("ggbCable = cable");
    expect(sceneEnvironment).toContain(
      "step(abs(e - cableY), 0.00072)",
    );
    expect(sceneEnvironment).toContain("hps * ggbCable * 0.012 * night");
    expect(sceneEnvironment).not.toContain("sin(gx * 116.0) * ggbCable");
  });
});
