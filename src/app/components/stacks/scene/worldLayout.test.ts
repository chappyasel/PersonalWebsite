import { describe, expect, it } from "vitest";

import { CAMERA, cameraForAspect } from "./worldLayout";

function projectionScale(pose: { z: number; fov: number }) {
  return 1 / (pose.z * Math.tan((pose.fov * Math.PI) / 360));
}

describe("mobile camera framing", () => {
  it("zooms phones modestly more than portrait tablets", () => {
    const phone = cameraForAspect(390 / 844);
    const tablet = cameraForAspect(768 / 1024);

    expect(phone.fov).toBeCloseTo(38.5, 4);
    expect(tablet.fov).toBeCloseTo(40.5, 4);
    expect(projectionScale(phone)).toBeGreaterThan(projectionScale(tablet));
  });

  it("leaves landscape and desktop framing unchanged", () => {
    expect(cameraForAspect(430 / 390)).toBe(CAMERA);
    expect(cameraForAspect(1440 / 900)).toBe(CAMERA);
  });

  it("clamps very tall phones to the intended zoom", () => {
    expect(cameraForAspect(0.35).fov).toBeCloseTo(38.5, 4);
  });
});
