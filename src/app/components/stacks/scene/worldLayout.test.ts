import { describe, expect, it } from "vitest";

import {
  CAMERA,
  TRAVEL_LEAD_IN,
  aboutStopShift,
  cameraForAspect,
  cameraXForScrollOffset,
  scrollOffsetForUnit,
  unitPose,
} from "./worldLayout";

function projectionScale(pose: { z: number; fov: number }) {
  return 1 / (pose.z * Math.tan((pose.fov * Math.PI) / 360));
}

describe("mobile camera framing", () => {
  it("zooms phones modestly more than portrait tablets", () => {
    const phone = cameraForAspect(390 / 844);
    const tablet = cameraForAspect(768 / 1024);

    expect(phone.fov).toBeCloseTo(32.5, 4);
    expect(tablet.fov).toBeCloseTo(40.5, 4);
    expect(projectionScale(phone)).toBeGreaterThan(projectionScale(tablet));
    expect(
      projectionScale(phone) / projectionScale({ z: phone.z, fov: 38.5 }),
    ).toBeCloseTo(1.2, 2);
  });

  it("leaves landscape and desktop framing unchanged", () => {
    expect(cameraForAspect(430 / 390)).toBe(CAMERA);
    expect(cameraForAspect(1440 / 900)).toBe(CAMERA);
  });

  it("clamps very tall phones to the intended zoom", () => {
    expect(cameraForAspect(0.35).fov).toBeCloseTo(32.5, 4);
  });
});

describe("About lead-in", () => {
  it("limits the far-left stop while preserving About's exact authored stop", () => {
    expect(TRAVEL_LEAD_IN).toBe(1.2);
    expect(cameraXForScrollOffset(0)).toBe(-1.2);
    expect(cameraXForScrollOffset(scrollOffsetForUnit(0))).toBeCloseTo(0, 10);
  });

  it("solves the About REST so the shelf edge clears the rail's widest label", () => {
    // 2000×1250 with the rail's right edge measured at 198px: the camera
    // slides right until the projected shelf left edge sits 24px past the
    // label — about x 0.78. Only unit 0's stop moves.
    const shift = aboutStopShift(2000, 1250, 198);
    expect(shift).toBeGreaterThan(0.7);
    expect(shift).toBeLessThan(0.9);
    // Wider frames ask for more; the cap keeps the rest left of the unit
    // boundary midpoint (2.2) so activeUnit can never round to 1 at rest.
    expect(aboutStopShift(3440, 1440, 198)).toBe(2.0);
    // Square-ish viewports floor at the authored stop (status quo — the
    // gap physically cannot fit the rail there).
    expect(aboutStopShift(1200, 1200, 198)).toBe(0);
    expect(
      cameraXForScrollOffset(scrollOffsetForUnit(0, shift)),
    ).toBeCloseTo(shift, 10);
    expect(
      cameraXForScrollOffset(scrollOffsetForUnit(3, shift)),
    ).toBeCloseTo(13.2, 10);
  });
});

describe("alternating unit poses", () => {
  it("recesses Systems in slot four and brings final Talks forward", () => {
    const systems = unitPose(3);
    const talks = unitPose(6);

    expect(systems.position[0]).toBeCloseTo(13.2, 10);
    expect(systems.position[2]).toBe(-0.55);
    expect(systems.rotation[1]).toBe(-0.12);
    expect(talks.position[0]).toBeCloseTo(26.4, 10);
    expect(talks.position[2]).toBe(0);
    expect(talks.rotation[1]).toBe(0.1);
  });
});
