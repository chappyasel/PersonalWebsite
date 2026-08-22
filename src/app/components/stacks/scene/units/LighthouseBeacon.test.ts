import fs from "node:fs";
import { describe, expect, it } from "vitest";

import {
  LIGHTHOUSE_BEACON_PERIOD_SECONDS,
  advanceLighthouseBeaconAngle,
  lighthouseFlashWeights,
  lighthouseUprightPower,
} from "./LighthouseBeacon";

const beaconSource = fs.readFileSync(
  new URL("./LighthouseBeacon.tsx", import.meta.url),
  "utf8",
);

describe("lighthouse beacon motion", () => {
  it("turns one full revolution over the authored period", () => {
    const quarterTurn = advanceLighthouseBeaconAngle(
      0,
      LIGHTHOUSE_BEACON_PERIOD_SECONDS / 4,
    );
    expect(quarterTurn).toBeCloseTo(Math.PI / 2);
    const fullTurn = advanceLighthouseBeaconAngle(
      0,
      LIGHTHOUSE_BEACON_PERIOD_SECONDS,
    );
    expect(Math.cos(fullTurn)).toBeCloseTo(1);
    expect(Math.sin(fullTurn)).toBeCloseTo(0);
  });

  it("flashes only the beam that faces the viewer", () => {
    expect(lighthouseFlashWeights(1)).toEqual({ white: 1, red: 0 });
    expect(lighthouseFlashWeights(-1)).toEqual({ white: 0, red: 1 });
    expect(lighthouseFlashWeights(0)).toEqual({ white: 0, red: 0 });
  });

  it("keeps the flash narrow around the optical axis", () => {
    expect(lighthouseFlashWeights(0.8).white).toBeLessThan(0.04);
  });

  it("powers down when tilted and returns when upright", () => {
    expect(lighthouseUprightPower(1)).toBe(1);
    expect(lighthouseUprightPower(0.7)).toBe(0);
    expect(lighthouseUprightPower(0.86)).toBeGreaterThan(0);
    expect(lighthouseUprightPower(0.86)).toBeLessThan(1);
  });

  it("layers a diffuse haze around the optical core", () => {
    expect(beaconSource).toContain("outerBeamWidth");
    expect(beaconSource).toContain("innerBeamWidth");
    expect(beaconSource).toContain("uEdgeSoftness");
    expect(beaconSource).toContain("particulate");
    expect(beaconSource).toContain("uPower");
  });

  it("feeds an HDR source to bloom and keeps a direct-render fallback", () => {
    expect(beaconSource).toContain("state.bloomActive");
    expect(beaconSource).toContain("multiplyScalar(sourceGain)");
    expect(beaconSource).toContain("const haloBase = bloomActive");
    expect(beaconSource).toContain("const POV_BLOOM_BOOST = 2");
    expect(beaconSource).toContain("povFlashPeak * povLevel");
    expect(beaconSource).toContain("multiplyScalar(povFlashGain)");
  });
});
