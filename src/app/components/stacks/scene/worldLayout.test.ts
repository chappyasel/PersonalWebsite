import { describe, expect, it } from "vitest";

import { SHELF_GEOMETRY } from "./shelfGeometry";
import {
  CAMERA,
  CAMERA_DEPTH_MAX_EYE_HEIGHT,
  CAMERA_DEPTH_MAX_PITCH_DEGREES,
  DEPTH_OF_FIELD_SHELF_Z,
  DOCK_SHELF_MARGIN_PX,
  PARALLAX_SWING,
  RAIL_SHELF_MARGIN_PX,
  SHELF_OVERVIEW_MAX_DISTANCE,
  STOP_LATERAL_MAX,
  TRAVEL_LEAD_IN,
  aboutStopShift,
  apparentHeightScale,
  cameraCompositionForViewport,
  cameraDepthOffsetsForViewport,
  cameraDepthScaleForViewport,
  cameraForAspect,
  cameraXForScrollOffset,
  captureCameraYFromSearch,
  captureFovFromSearch,
  captureHeadOnFromSearch,
  captureLookYFromSearch,
  depthOfFieldTargetForUnit,
  desktopDockLeftPx,
  desktopStopFraming,
  golfDollyForViewport,
  golfLookYOffsetForViewport,
  ogCaptureFromSearch,
  parallaxLookOffset,
  portraitShelfOverviewDistance,
  scrollOffsetForUnit,
  stopLateralOffset,
  unitPose,
  unitPoseForCapture,
} from "./worldLayout";

const toDegrees = (radians: number) => (radians * 180) / Math.PI;

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
      lateralOffset: 0,
      lookY: -0.08,
      lookZ: -0.2,
    });
    expect(cameraCompositionForViewport(390, 844, 1)).toMatchObject({
      y: 0.25,
      z: overview - 0.55,
      fov: 33,
      lateralOffset: 0,
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

describe("authored camera depth", () => {
  it("uses the seeded offsets at public stops and clamps outside travel", () => {
    const stops = [
      [0, 0.02, 0.1],
      [1, -0.02, -0.1],
      [2, 0.04, 0.3],
      [3, -0.03, -0.2],
      [4, 0.02, 0.15],
      [5, -0.02, -0.15],
      [6, 0.03, 0.2],
    ] as const;

    for (const [position, eyeHeight, pitchDegrees] of stops) {
      const offsets = cameraDepthOffsetsForViewport(1440, 900, position);
      expect(offsets.eyeHeight).toBeCloseTo(eyeHeight, 10);
      expect(toDegrees(offsets.pitchRadians)).toBeCloseTo(pitchDegrees, 10);
    }

    expect(cameraDepthOffsetsForViewport(1440, 900, -10)).toEqual(
      cameraDepthOffsetsForViewport(1440, 900, 0),
    );
    expect(cameraDepthOffsetsForViewport(1440, 900, 10)).toEqual(
      cameraDepthOffsetsForViewport(1440, 900, 6),
    );
  });

  it("lands on every seeded travel-arc peak", () => {
    const peaks = [
      [0.5, 0.1, 0.65],
      [1.18, -0.05, 0.35],
      [1.89, 0.08, 0.55],
      [3.5, 0.09, -0.55],
      [5.5, 0.07, 0.45],
    ] as const;

    for (const [position, eyeHeight, pitchDegrees] of peaks) {
      const offsets = cameraDepthOffsetsForViewport(1440, 900, position);
      expect(offsets.eyeHeight).toBeCloseTo(eyeHeight, 10);
      expect(toDegrees(offsets.pitchRadians)).toBeCloseTo(pitchDegrees, 10);
    }
  });

  it("uses smootherstep between stops without a travel arc", () => {
    const t = 0.25;
    const blend = t * t * t * (t * (t * 6 - 15) + 10);
    const offsets = cameraDepthOffsetsForViewport(1440, 900, 2 + t);

    expect(offsets.eyeHeight).toBeCloseTo(0.04 + (-0.03 - 0.04) * blend, 10);
    expect(toDegrees(offsets.pitchRadians)).toBeCloseTo(
      0.3 + (-0.2 - 0.3) * blend,
      10,
    );
  });

  it("holds all three Golf knots at exact zero", () => {
    for (const position of [1.36, 1.52, 1.78]) {
      expect(cameraDepthOffsetsForViewport(1440, 900, position)).toEqual({
        eyeHeight: 0,
        pitchRadians: 0,
      });
    }
    expect(cameraDepthOffsetsForViewport(1440, 900, 1.44)).toEqual({
      eyeHeight: 0,
      pitchRadians: 0,
    });
    expect(cameraDepthOffsetsForViewport(1440, 900, 1.65)).toEqual({
      eyeHeight: 0,
      pitchRadians: 0,
    });
  });

  it("scales wide, short-landscape, and portrait viewports", () => {
    expect(cameraDepthScaleForViewport(1440, 900)).toBe(1);
    expect(cameraDepthScaleForViewport(900, 500)).toBe(0.85);
    expect(cameraDepthScaleForViewport(500, 1000)).toBeCloseTo(0.6, 10);
    expect(cameraDepthScaleForViewport(625, 1000)).toBeCloseTo(0.7, 10);
    expect(cameraDepthScaleForViewport(768, 1024)).toBeCloseTo(0.8, 10);
    expect(cameraDepthScaleForViewport(390, 844)).toBeCloseTo(0.6, 10);

    const wide = cameraDepthOffsetsForViewport(1440, 900, 0.5);
    const short = cameraDepthOffsetsForViewport(900, 500, 0.5);
    const portrait = cameraDepthOffsetsForViewport(500, 1000, 0.5);
    expect(short.eyeHeight).toBeCloseTo(wide.eyeHeight * 0.85, 10);
    expect(portrait.eyeHeight).toBeCloseTo(wide.eyeHeight * 0.6, 10);
    expect(short.pitchRadians).toBeCloseTo(wide.pitchRadians * 0.85, 10);
    expect(portrait.pitchRadians).toBeCloseTo(wide.pitchRadians * 0.6, 10);
  });

  it("returns exact zero when disabled and never exceeds authored caps", () => {
    for (let position = -1; position <= 7; position += 0.01) {
      expect(cameraDepthOffsetsForViewport(1440, 900, position, false)).toEqual(
        { eyeHeight: 0, pitchRadians: 0 },
      );
      const offsets = cameraDepthOffsetsForViewport(1440, 900, position);
      expect(Math.abs(offsets.eyeHeight)).toBeLessThanOrEqual(
        CAMERA_DEPTH_MAX_EYE_HEIGHT,
      );
      expect(Math.abs(toDegrees(offsets.pitchRadians))).toBeLessThanOrEqual(
        CAMERA_DEPTH_MAX_PITCH_DEGREES,
      );
    }
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

describe("desktop stop centring", () => {
  // The eye stands `shift` right of the shelf's centre line at distance
  // CAMERA.z with a parallel axis, so the centre projects left of 0.5.
  const pxPerWorld = (vw: number, vh: number) => {
    const tanH = Math.tan((CAMERA.fov * Math.PI) / 360) * (vw / vh);
    return vw / (2 * tanH * CAMERA.z);
  };
  const shelfCentrePx = (vw: number, vh: number, shift: number) =>
    vw / 2 - shift * pxPerWorld(vw, vh);

  it("derives the dock edge from the dock's own two clamps", () => {
    expect(desktopDockLeftPx(1280)).toBeCloseTo(1280 - 496 - 23.68, 6);
    expect(desktopDockLeftPx(2000)).toBeCloseTo(2000 - 640 - 31.6, 6);
    expect(desktopDockLeftPx(3440)).toBe(3440 - 640 - 32);
  });

  it("puts the shelf centre at the midpoint of the rail-to-dock gap", () => {
    // The owner's 2000px-wide screenshot: the shelf ran to 1482px while the
    // dock owned the frame from 1328px.
    const shift = stopLateralOffset(2000, 1254, 198);
    const mid = (198 + RAIL_SHELF_MARGIN_PX + desktopDockLeftPx(2000)) / 2;
    expect(shelfCentrePx(2000, 1254, shift)).toBeCloseTo(mid, 6);
    expect(shift).toBeGreaterThan(0.5);
    expect(shift).toBeLessThan(0.8);
    const half = (SHELF_GEOMETRY.width / 2) * pxPerWorld(2000, 1254);
    expect(mid + half).toBeLessThan(desktopDockLeftPx(2000));
    expect(mid - half).toBeGreaterThan(198 + RAIL_SHELF_MARGIN_PX);
  });

  it("holds the right edge off the dock and runs the left end under the nav where the gap is narrower than the shelf", () => {
    const vw = 1280;
    const vh = 820;
    const shift = stopLateralOffset(vw, vh, 179);
    const half = (SHELF_GEOMETRY.width / 2) * pxPerWorld(vw, vh);
    const right = shelfCentrePx(vw, vh, shift) + half;
    expect(right).toBeCloseTo(desktopDockLeftPx(vw) - DOCK_SHELF_MARGIN_PX, 6);
    // The nav is transparent text, the dock is opaque cards: the left end
    // is the one that may be covered.
    expect(right - 2 * half).toBeLessThan(179 + RAIL_SHELF_MARGIN_PX);
  });

  it("reads the pointer parallax from the gap centre and caps the swing toward the dock", () => {
    const vw = 1920;
    const vh = 1080;
    const framing = desktopStopFraming(vw, vh, 198);
    const composition = cameraCompositionForViewport(vw, vh, 2, 198);
    const gapMid = (198 + RAIL_SHELF_MARGIN_PX + desktopDockLeftPx(vw)) / 2;
    expect(composition.parallaxCentre).toBeCloseTo((2 * gapMid) / vw - 1, 10);
    // A mouse resting over the shelf leaves the composed frame alone.
    expect(parallaxLookOffset(composition.parallaxCentre, composition)).toBe(0);
    // Toward the nav: the full swing, as before.
    expect(parallaxLookOffset(1, composition)).toBeCloseTo(PARALLAX_SWING, 10);
    // Toward the dock: the shelf may touch the glass but not pass it. The
    // look target sits 0.2 behind the shelf plane, so the shelf moves
    // CAMERA.z / (CAMERA.z + 0.2) of the look offset.
    const swing = parallaxLookOffset(-1, composition);
    expect(swing).toBeLessThan(0);
    expect(swing).toBeGreaterThan(-PARALLAX_SWING);
    const half = (SHELF_GEOMETRY.width / 2) * pxPerWorld(vw, vh);
    const landedRight = shelfCentrePx(vw, vh, framing.lateralOffset) + half;
    const shelfShiftPx =
      -swing * (CAMERA.z / (CAMERA.z + 0.2)) * pxPerWorld(vw, vh);
    expect(landedRight + shelfShiftPx).toBeLessThanOrEqual(
      desktopDockLeftPx(vw),
    );
    expect(landedRight + shelfShiftPx).toBeGreaterThan(
      desktopDockLeftPx(vw) - 8,
    );
    // No dead zone: halfway to the edge is half the swing on each side.
    const c = composition.parallaxCentre;
    expect(parallaxLookOffset(c - (1 + c) / 2, composition)).toBeCloseTo(
      swing / 2,
      10,
    );
    expect(parallaxLookOffset(c + (1 - c) / 2, composition)).toBeCloseTo(
      PARALLAX_SWING / 2,
      10,
    );
    // About is pinned to the rail by its own shift and has more room.
    expect(
      cameraCompositionForViewport(vw, vh, 0, 198).parallaxDockSwing,
    ).toBeGreaterThan(composition.parallaxDockSwing);
    // Without a rail (mobile, OG capture) nothing changes: viewport-centred,
    // full swing both ways.
    const bare = cameraCompositionForViewport(390, 844, 2);
    expect(bare.parallaxCentre).toBe(0);
    expect(parallaxLookOffset(-1, bare)).toBeCloseTo(-PARALLAX_SWING, 10);
    expect(parallaxLookOffset(0.5, bare)).toBeCloseTo(PARALLAX_SWING / 2, 10);
  });

  it("lets the mouse bring a shelf out from under the nav in a square desktop window", () => {
    // 2000×1730 (owner screenshot): the shelf projects wider than the gap,
    // rests with its right edge off the dock and its left end under the nav.
    const vw = 2000;
    const vh = 1730;
    const framing = desktopStopFraming(vw, vh, 198);
    const half = (SHELF_GEOMETRY.width / 2) * pxPerWorld(vw, vh);
    const railEdge = 198 + RAIL_SHELF_MARGIN_PX;
    const landedLeft = shelfCentrePx(vw, vh, framing.lateralOffset) - half;
    expect(landedLeft + 2 * half).toBeCloseTo(
      desktopDockLeftPx(vw) - DOCK_SHELF_MARGIN_PX,
      6,
    );
    expect(landedLeft).toBeLessThan(railEdge - 100);
    // Mouse on the left edge: the swing exceeds the normal 0.45 by exactly
    // what it takes to land the left end on the rail margin.
    const composition = cameraCompositionForViewport(vw, vh, 3, 198);
    const swing = parallaxLookOffset(-1, composition);
    expect(-swing).toBeGreaterThan(PARALLAX_SWING);
    const shelfShiftPx =
      -swing * (CAMERA.z / (CAMERA.z + 0.2)) * pxPerWorld(vw, vh);
    expect(landedLeft + shelfShiftPx).toBeCloseTo(railEdge, 4);
    // Mouse on the right edge: the ordinary swing, left end further under
    // the nav, right end still clear of the dock.
    expect(parallaxLookOffset(1, composition)).toBeCloseTo(PARALLAX_SWING, 10);
    // A wide window never asks for more than the ordinary swing.
    expect(desktopStopFraming(1920, 1080, 198).dockSwing).toBeLessThanOrEqual(
      PARALLAX_SWING,
    );
  });

  it("is zero off desktop, bounded, and reaches stops 1..6 only", () => {
    expect(stopLateralOffset(1199, 800, 179)).toBe(0);
    expect(stopLateralOffset(390, 844, 0)).toBe(0);
    for (const vw of [1200, 1440, 1920, 2560, 3440]) {
      const shift = stopLateralOffset(vw, vw / 1.6, 198);
      expect(shift).toBeGreaterThanOrEqual(0);
      expect(shift).toBeLessThanOrEqual(STOP_LATERAL_MAX);
    }
    const shift = stopLateralOffset(2000, 1254, 198);
    expect(cameraCompositionForViewport(2000, 1254, 0, 198).lateralOffset).toBe(
      0,
    );
    expect(
      cameraCompositionForViewport(2000, 1254, 1, 198).lateralOffset,
    ).toBeCloseTo(shift, 10);
    expect(
      cameraCompositionForViewport(2000, 1254, 0.5, 198).lateralOffset,
    ).toBeCloseTo(shift / 2, 10);
    // No rail measurement (OG capture, mobile): the authored centre line.
    expect(cameraCompositionForViewport(2000, 1254, 3).lateralOffset).toBe(0);
  });
});

describe("alternating unit poses", () => {
  it("centers the depth-of-field target inside the shelf's physical depth", () => {
    expect(DEPTH_OF_FIELD_SHELF_Z).toBeCloseTo(
      (SHELF_GEOMETRY.top.centerZ + SHELF_GEOMETRY.lower.centerZ) / 2,
      10,
    );
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
    expect(ogCaptureFromSearch("?og-capture=1")).toBe(true);
    expect(ogCaptureFromSearch("?og-fov=30.5")).toBe(false);
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
