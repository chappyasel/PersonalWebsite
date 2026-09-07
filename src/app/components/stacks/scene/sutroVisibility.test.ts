import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CAMERA,
  CAMERA_LOOK_X_MAX_LAG,
  CAMERA_LOOK_Z_OFFSET,
} from "./worldLayout";

const sceneEnvironment = readFileSync(
  fileURLToPath(new URL("./SceneEnvironment.tsx", import.meta.url)),
  "utf8",
);

function shaderDefine(name: string): number {
  const match = new RegExp(`#define\\s+${name}\\s+(-?[\\d.]+)`).exec(
    sceneEnvironment,
  );
  if (!match?.[1]) throw new Error(`Missing shader define ${name}`);
  return Number(match[1]);
}

function sourceConstant(name: string): number {
  const match = new RegExp(`const\\s+${name}\\s*=\\s*(-?[\\d.]+)`).exec(
    sceneEnvironment,
  );
  if (!match?.[1]) throw new Error(`Missing source constant ${name}`);
  return Number(match[1]);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function cityEnvelope(azimuth: number) {
  const west = shaderDefine("SF_CITY_WEST");
  const east = shaderDefine("SF_CITY_EAST");
  const feather = shaderDefine("SF_CITY_FEATHER");
  return (
    smoothstep(west - feather, west, azimuth) *
    (1 - smoothstep(east, east + feather, azimuth))
  );
}

describe("Sutro Tower visibility", () => {
  it("plants the tower near its hill crest and west of the Golden Gate", () => {
    expect(sceneEnvironment).toContain("#define SUTRO_AZ -2.260");
    expect(sceneEnvironment).toContain("#define SUTRO_HILL_AZ -2.250");
    expect(sceneEnvironment).toContain("float dSut = a - SUTRO_AZ");
    expect(sceneEnvironment).toContain(
      "float hillA = 0.050 * hump(a, SUTRO_HILL_AZ, sutroHillW)",
    );
  });

  it("scales the tower around the crest and lets the hill hide its lower legs", () => {
    const scale = shaderDefine("SUTRO_SCALE");
    const ground = shaderDefine("SUTRO_GROUND_E");
    const centerTip = shaderDefine("SUTRO_CENTER_TIP_E");
    const scaledTip = ground + (centerTip - ground) * scale;

    expect(scale).toBeGreaterThanOrEqual(0.75);
    expect(scale).toBeLessThanOrEqual(0.85);
    expect(scaledTip).toBeLessThanOrEqual(0.107);
    expect(sceneEnvironment).toContain("float sutroA = dSut / SUTRO_SCALE");
    expect(sceneEnvironment).toContain(
      "float sutroE = SUTRO_GROUND_E + (e - SUTRO_GROUND_E) / SUTRO_SCALE",
    );
    expect(sceneEnvironment).toContain(
      "sutro *= (1.0 - hillMask) * uSutroVisible",
    );
  });

  it("uses Sutro's splayed frame, crossbeams, platform, and taller center mast", () => {
    expect(sceneEnvironment).toContain("float outerLegs");
    expect(sceneEnvironment).toContain("float centerMast");
    expect(sceneEnvironment).toContain("float lowerBeam");
    expect(sceneEnvironment).toContain("float midBeam");
    expect(sceneEnvironment).toContain("float upperPlatform");
    expect(sceneEnvironment).toContain("float sideMasts");
    expect(sceneEnvironment).toContain("SUTRO_CENTER_TIP_E");
    expect(sceneEnvironment).toContain("SUTRO_SIDE_TIP_E");
  });

  it("gives the daylight tower muted red and off-white paint bands", () => {
    expect(sceneEnvironment).toContain("vec3 sutroRed");
    expect(sceneEnvironment).toContain("vec3 sutroWhite");
    expect(sceneEnvironment).toContain("float sutroWhiteBand");
    expect(sceneEnvironment).toContain("mix(sutroRed, sutroWhite, sutroWhiteBand)");
  });

  it("keeps bespoke hillside buildings out of the landmark composition", () => {
    expect(sceneEnvironment).not.toContain("float sfHouse(");
    expect(sceneEnvironment).not.toContain("float westHomes");
  });

  it("fades the generic roofline before a fast travel yaw exposes new columns", () => {
    const aspect = 2000 / 1250;
    const halfHorizontalFov = Math.atan(
      Math.tan(((CAMERA.fov * Math.PI) / 180) * 0.5) * aspect,
    );
    const distance = CAMERA.z - CAMERA_LOOK_Z_OFFSET;
    const maxYaw = Math.atan2(distance, CAMERA_LOOK_X_MAX_LAG);
    const panBias = sourceConstant("PAN_BIAS");
    const panStart = -panBias;
    const panEnd = sourceConstant("PAN_SPAN") - panBias;
    const fastWestEdge = -Math.PI + maxYaw + panStart - halfHorizontalFov;
    const fastEastEdge = -maxYaw + panEnd + halfHorizontalFov;

    expect(cityEnvelope(fastWestEdge)).toBe(0);
    expect(cityEnvelope(fastEastEdge)).toBe(0);
    expect(cityEnvelope(shaderDefine("SUTRO_AZ"))).toBe(1);
    expect(cityEnvelope(-1.35)).toBe(1);
    expect(sceneEnvironment).toContain("float cityEnvelope =");
    expect(sceneEnvironment).toContain("* cityEnvelope;");
  });

  it("hides the silhouette and warning lights in screenshot mode", () => {
    expect(sceneEnvironment).toContain(
      "const screenshot = useScreenshotMode()",
    );
    expect(sceneEnvironment).toContain(
      "u.uSutroVisible!.value = screenshot.enabled ? 0 : 1",
    );
    expect(sceneEnvironment).toContain(
      "sutro *= (1.0 - hillMask) * uSutroVisible",
    );
    expect(sceneEnvironment).toContain(
      "float sutroNight = night * uSutroVisible * (1.0 - hillMask)",
    );
  });
});
