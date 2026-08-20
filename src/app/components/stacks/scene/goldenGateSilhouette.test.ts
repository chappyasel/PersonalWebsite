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
    expect(sceneEnvironment).toContain("towerLegs + portalBeams");
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
    expect(sceneEnvironment).toContain("hps * ggbCable * 0.055 * night");
    expect(sceneEnvironment).not.toContain("sin(gx * 116.0) * ggbCable");
  });
});
