import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname);
const meadow = fs.readFileSync(path.join(root, "Meadow.tsx"), "utf8");
const canvas = fs.readFileSync(path.join(root, "../StacksCanvas.tsx"), "utf8");
const golf = fs.readFileSync(
  path.join(root, "golf/GolfExperience.tsx"),
  "utf8",
);

describe("persistent meadow deformation presentation contract", () => {
  it("samples deformation in full and FAR_SIMPLE companion materials", () => {
    expect(meadow).toContain("uniform sampler2D uDeformation");
    expect(meadow).toContain("texture2D(uDeformation, deformationUv)");
    expect(meadow).toContain("deformedGrassMaterial");
    expect(meadow).toContain("deformedFarGrassMaterial");
    expect(meadow).toContain("defines: { FAR_SIMPLE: 1 }");
    expect(meadow.match(/meadowGrassVertexShader\(true\)/g)).toHaveLength(2);
  });

  it("builds sampler-free plain companions for off and minimal modes", () => {
    expect(meadow.match(/meadowGrassVertexShader\(false\)/g)).toHaveLength(2);
    expect(meadow).toContain("deformationOverride ?? grassDeformation");
    expect(meadow).toContain(
      "deformation.setQuality(effectiveDeformationQuality)",
    );
    expect(meadow).toContain(
      "deformationEnabled\n                ? built.deformedFarGrassMaterial",
    );
    expect(meadow).toContain('grassDeformation = "off"');
  });

  it("keeps transient pulses live while persistent work is disabled", () => {
    expect(meadow).toContain("stampImpactPulse(");
    expect(meadow).toContain(
      "if (deformationEnabled) deformation.stamp(event, nowSeconds)",
    );
    expect(meadow).toContain(
      "if (deformationEnabled) {\n      deformation.tick",
    );
    expect(canvas).toContain('get("grassDeformation") ===');
    expect(canvas).toContain("plan.environment.grassDeformation");
  });

  it("publishes the golf ball's previous-to-current rolling segment", () => {
    expect(golf).toContain('kind: "trail"');
    expect(golf).toContain("startX: worldStart.x");
    expect(golf).toContain("startZ: worldStart.z");
    expect(golf).toContain("endX: worldPosition.x");
    expect(golf).toContain("endZ: worldPosition.z");
  });
});
