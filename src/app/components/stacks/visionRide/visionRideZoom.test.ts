import { describe, expect, it } from "vitest";

import {
  VISION_RIDE_ZOOM,
  VISION_RIDE_ZOOM_LOG_BOUND,
  advanceZoom,
  clampZoomLog,
  wheelZoomDelta,
  zoomDistanceScale,
} from "./visionRideZoom";

describe("Vision Ride wheel zoom", () => {
  it("zooms in on wheel forward and out on wheel back, a few percent a notch", () => {
    const notch = wheelZoomDelta({ deltaY: 100, deltaMode: 0 }, 900);
    expect(notch).toBeGreaterThan(0);
    expect(wheelZoomDelta({ deltaY: -100, deltaMode: 0 }, 900)).toBe(-notch);
    // One mouse notch moves the distance by roughly four percent; the
    // whole range is about two dozen notches, so a flick never jumps the
    // camera.
    expect(zoomDistanceScale(notch)).toBeGreaterThan(1.03);
    expect(zoomDistanceScale(notch)).toBeLessThan(1.05);
    expect((2 * VISION_RIDE_ZOOM_LOG_BOUND) / notch).toBeGreaterThan(20);
    expect((2 * VISION_RIDE_ZOOM_LOG_BOUND) / notch).toBeLessThan(28);
  });

  it("normalises line and page wheel units and ignores junk", () => {
    const pixels = wheelZoomDelta({ deltaY: 33, deltaMode: 0 }, 900);
    expect(wheelZoomDelta({ deltaY: 1, deltaMode: 1 }, 900)).toBeCloseTo(
      pixels,
      12,
    );
    expect(wheelZoomDelta({ deltaY: 1, deltaMode: 2 }, 900)).toBeCloseTo(
      wheelZoomDelta({ deltaY: 900, deltaMode: 0 }, 900),
      12,
    );
    expect(wheelZoomDelta({ deltaY: Number.NaN, deltaMode: 0 }, 900)).toBe(0);
    expect(clampZoomLog(Number.NaN)).toBe(0);
  });

  it("holds a symmetric bound so a notch in and a notch out cancel exactly", () => {
    expect(zoomDistanceScale(VISION_RIDE_ZOOM_LOG_BOUND)).toBeCloseTo(
      VISION_RIDE_ZOOM.reach,
      12,
    );
    expect(zoomDistanceScale(-VISION_RIDE_ZOOM_LOG_BOUND)).toBeCloseTo(
      1 / VISION_RIDE_ZOOM.reach,
      12,
    );
    expect(clampZoomLog(5)).toBe(VISION_RIDE_ZOOM_LOG_BOUND);
    expect(clampZoomLog(-5)).toBe(-VISION_RIDE_ZOOM_LOG_BOUND);
    expect(zoomDistanceScale(0)).toBe(1);
    const notch = wheelZoomDelta({ deltaY: 100, deltaMode: 0 }, 900);
    expect(clampZoomLog(clampZoomLog(0 + notch) - notch)).toBe(0);
    // Sixty notches in a row stop at the bound instead of winding up past
    // it, so the first notch back starts the camera moving again.
    let target = 0;
    for (let i = 0; i < 60; i += 1) target = clampZoomLog(target + notch);
    expect(target).toBe(VISION_RIDE_ZOOM_LOG_BOUND);
    expect(clampZoomLog(target - notch)).toBeLessThan(target);
  });

  it("glides toward the wheel's target the same at 60 and 120 Hz", () => {
    const target = VISION_RIDE_ZOOM_LOG_BOUND;
    let at60 = 0;
    let at120 = 0;
    for (let i = 0; i < 60; i += 1) at60 = advanceZoom(at60, target, 1 / 60);
    for (let i = 0; i < 120; i += 1)
      at120 = advanceZoom(at120, target, 1 / 120);
    expect(at60).toBeCloseTo(at120, 6);
    // Slow: most of a notch lands in the first second, none of it jumps.
    expect(at60 / target).toBeGreaterThan(0.75);
    expect(at60 / target).toBeLessThan(0.9);
    expect(advanceZoom(0, target, 1 / 60) / target).toBeLessThan(0.05);
    // Settles exactly rather than creeping forever.
    let settled = 0;
    for (let i = 0; i < 600; i += 1)
      settled = advanceZoom(settled, target, 1 / 60);
    expect(settled).toBe(target);
    expect(advanceZoom(0, 0, 1 / 60)).toBe(0);
  });
});
