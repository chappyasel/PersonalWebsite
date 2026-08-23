import fs from "node:fs";
import { describe, expect, it } from "vitest";

const canvas = fs.readFileSync(
  new URL("../StacksCanvas.tsx", import.meta.url),
  "utf8",
);
const diagnostics = fs.readFileSync(
  new URL("../dom/SceneDiagnostics.tsx", import.meta.url),
  "utf8",
);
const diagnosticsRegistry = fs.readFileSync(
  new URL("./sceneDiagnosticsRegistry.ts", import.meta.url),
  "utf8",
);
const chrome = fs.readFileSync(
  new URL("../dom/ChromeLayer.tsx", import.meta.url),
  "utf8",
);
const environment = fs.readFileSync(
  new URL("./SceneEnvironment.tsx", import.meta.url),
  "utf8",
);

describe("live scene color grading", () => {
  // The composer's own use of the grade — vignette depth per theme, the
  // Cinematic+ swap, and the absence of a grain pass — is asserted against
  // the rendered chain in Effects.contract.test.tsx.
  it("routes renderer exposure through the reload-reset controller", () => {
    expect(canvas).toContain("useSceneColorGradeSettings");
    expect(canvas).toContain("sceneColorGradeFor");
    expect(canvas).toContain("colorGrade.dark.exposure");
    expect(canvas).toContain("colorGrade.light.exposure");
  });

  it("offers Cinematic+ as a live diagnostics-only quality choice", () => {
    expect(diagnosticsRegistry).toContain(
      '{ value: "cinematic+", label: "Cinematic+"',
    );
    expect(diagnosticsRegistry).toContain('experimentalValues: ["cinematic+"]');
    expect(diagnostics).toContain("qualityControls.cinematicPlus");
    expect(canvas).toContain("qualityControls.cinematicPlus");
  });

  it("keeps color grading out of diagnostics without changing bloom", () => {
    expect(diagnostics).not.toContain("Color grading");
    expect(diagnostics).not.toContain("sceneColorGradeController");
    expect(diagnostics).not.toContain("useSceneColorGradeSettings");
    expect(diagnostics).not.toContain('label: "Grain"');
    expect(chrome).not.toContain("stacks-grain");
    expect(environment).not.toContain("uFrame");
  });
});
