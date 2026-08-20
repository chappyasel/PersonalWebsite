import { describe, expect, it } from "vitest";

import {
  CAMERA,
  DEPTH_OF_FIELD_SHELF_Z,
  SHELF_OVERVIEW_MAX_DISTANCE,
  TRAVEL_LEAD_IN,
  aboutStopShift,
  apparentHeightScale,
  cameraCompositionForViewport,
  cameraForAspect,
  cameraXForScrollOffset,
  captureCameraYFromSearch,
  captureFovFromSearch,
  captureHeadOnFromSearch,
  captureLookYFromSearch,
  depthOfFieldTargetForUnit,
  golfDollyForViewport,
  golfLookYOffsetForViewport,
  portraitShelfOverviewDistance,
  scrollOffsetForUnit,
  unitPose,
  unitPoseForCapture,
} from "./worldLayout";

function projectionScale(pose: { z: number; fov: number }) {
  return 1 / (pose.z * Math.tan((pose.fov * Math.PI) / 360));
}

describe("mobile camera framing", () => {
  it("uses proportional Golf dollies across mobile and desktop", () => {
    expect(golfDollyForViewport(390, true)).toBe(1.4);
    expect(golfDollyForViewport(1199, true)).toBe(1.4);
    expect(golfDollyForViewport(1200, true)).toBe(0.45);
    expect(golfDollyForViewport(1440, true)).toBe(0.45);
    expect(golfDollyForViewport(390, false)).toBe(0);
    expect(golfLookYOffsetForViewport(390, true)).toBe(-0.18);
    expect(golfLookYOffsetForViewport(1200, true)).toBe(0);
  });

  it("frames every portrait shelf at one shelf-relative overview distance", () => {
    const overview = portraitShelfOverviewDistance(390, 844);
    expect(cameraCompositionForViewport(390, 844, 0)).toMatchObject({
      y: 0.25,
      z: overview,
      fov: 33,
      lookXOffset: 0,
      lookY: -0.08,
      lookZ: -0.2,
    });
    expect(cameraCompositionForViewport(390, 844, 1)).toMatchObject({
      y: 0.25,
      z: overview - 0.55,
      fov: 33,
      lookXOffset: 0,
      lookY: -0.08,
      lookZ: -0.75,
    });
    expect(cameraCompositionForViewport(390, 844, 0.5).z).toBeCloseTo(
      overview - 0.275,
    );

    for (let unit = 0; unit < 7; unit += 1) {
      const composition = cameraCompositionForViewport(390, 844, unit);
      expect(composition.z - unitPose(unit).position[2]).toBeCloseTo(overview);
    }
  });

  it("leaves the shelf barely inside the phone's horizontal frame", () => {
    const width = 390;
    const height = 844;
    const distance = portraitShelfOverviewDistance(width, height);
    const visibleWidth =
      2 * distance * Math.tan((33 * Math.PI) / 360) * (width / height);

    expect(visibleWidth).toBeGreaterThan(2.64);
    expect(visibleWidth).toBeLessThan(2.9);
    expect(apparentHeightScale(distance, 33)).toBeGreaterThan(0);
  });

  it("does not shrink the world in pathological tall portrait windows", () => {
    expect(portraitShelfOverviewDistance(606, 2048)).toBe(
      SHELF_OVERVIEW_MAX_DISTANCE,
    );
    expect(cameraCompositionForViewport(606, 2048, 0).z).toBe(
      SHELF_OVERVIEW_MAX_DISTANCE,
    );
  });
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
    expect(cameraXForScrollOffset(scrollOffsetForUnit(0, shift))).toBeCloseTo(
      shift,
      10,
    );
    expect(cameraXForScrollOffset(scrollOffsetForUnit(3, shift))).toBeCloseTo(
      13.2,
      10,
    );
  });
});

describe("alternating unit poses", () => {
  it("places the depth-of-field target near the shelf's physical back edge", () => {
    expect(DEPTH_OF_FIELD_SHELF_Z).toBeCloseTo(-0.375, 10);
    for (let unit = 0; unit < 7; unit += 1) {
      const composition = cameraCompositionForViewport(1200, 630, unit);
      expect(depthOfFieldTargetForUnit(unit)).toEqual([
        unitPose(unit).position[0],
        composition.lookY,
        unitPose(unit).position[2] + DEPTH_OF_FIELD_SHELF_Z,
      ]);
    }
  });

  it("accepts a bounded FOV override only for OG capture", () => {
    expect(captureFovFromSearch("?og-capture=1&og-fov=30.5")).toBe(30.5);
    expect(captureFovFromSearch("?og-fov=30.5")).toBeNull();
    expect(captureFovFromSearch("?og-capture=1&og-fov=10")).toBeNull();
    expect(captureFovFromSearch("?og-capture=1&og-fov=nope")).toBeNull();
  });

  it("accepts a small downward look override only for OG capture", () => {
    expect(captureLookYFromSearch("?og-capture=1&og-look-y=-0.105")).toBe(
      -0.105,
    );
    expect(captureLookYFromSearch("?og-look-y=-0.105")).toBeNull();
    expect(captureLookYFromSearch("?og-capture=1&og-look-y=-1")).toBeNull();
    expect(captureLookYFromSearch("?og-capture=1&og-look-y=nope")).toBeNull();
  });

  it("accepts a higher camera eye only for OG capture", () => {
    expect(captureCameraYFromSearch("?og-capture=1&og-camera-y=0.4")).toBe(0.4);
    expect(captureCameraYFromSearch("?og-camera-y=0.4")).toBeNull();
    expect(captureCameraYFromSearch("?og-capture=1&og-camera-y=2")).toBeNull();
    expect(
      captureCameraYFromSearch("?og-capture=1&og-camera-y=nope"),
    ).toBeNull();
  });

  it("removes unit yaw only for an explicit head-on OG capture", () => {
    expect(captureHeadOnFromSearch("?og-capture=1&og-head-on=1")).toBe(true);
    expect(captureHeadOnFromSearch("?og-head-on=1")).toBe(false);
    expect(unitPoseForCapture(0, true)).toEqual({
      position: unitPose(0).position,
      rotation: [0, 0, 0],
    });
    expect(unitPoseForCapture(0, false)).toEqual(unitPose(0));
  });

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
