import { afterEach, describe, expect, it } from "vitest";

import {
  VISION_RIDE_TOUCH,
  visionRideTouchAxes,
  visionRideTouchRuntime,
} from "./visionRideTouch";

afterEach(() => visionRideTouchRuntime.reset());

describe("Vision ride touch steering", () => {
  it("keeps a tap neutral and crosses into a drag at the authored threshold", () => {
    const tap = visionRideTouchAxes({
      startX: 100,
      startY: 200,
      clientX: 106,
      clientY: 204,
      width: 400,
      height: 800,
    });
    expect(tap).toEqual({ dragged: false, x: 0, y: 0 });

    const drag = visionRideTouchAxes({
      startX: 100,
      startY: 200,
      clientX: 110,
      clientY: 200,
      width: 400,
      height: 800,
    });
    expect(drag.dragged).toBe(true);
    expect(drag.x).toBeGreaterThan(0);
    expect(drag.y).toBe(0);
  });

  it("maps a viewport-relative drag to bounded camera axes", () => {
    const fraction = VISION_RIDE_TOUCH.fullTravelViewportFraction;
    expect(
      visionRideTouchAxes({
        startX: 20,
        startY: 700,
        clientX: 20 + 400 * fraction,
        clientY: 700 - 800 * fraction,
        width: 400,
        height: 800,
      }),
    ).toEqual({ dragged: true, x: 1, y: 1 });
    expect(
      visionRideTouchAxes({
        startX: 200,
        startY: 400,
        clientX: -500,
        clientY: 2_000,
        width: 400,
        height: 800,
      }),
    ).toEqual({ dragged: true, x: -1, y: -1 });
  });

  it("hands live axes to the scene and springs the target home on release", () => {
    visionRideTouchRuntime.begin(100, 200);
    expect(visionRideTouchRuntime.getSnapshot()).toMatchObject({
      engaged: true,
      active: true,
      dragged: false,
    });
    visionRideTouchRuntime.move(164, 136, 400, 800);
    expect(visionRideTouchRuntime.getSnapshot()).toMatchObject({
      active: true,
      dragged: true,
      x: 0.5,
      y: 0.25,
    });
    expect(visionRideTouchRuntime.end()).toBe(true);
    expect(visionRideTouchRuntime.getSnapshot()).toEqual({
      engaged: true,
      active: false,
      dragged: false,
      x: 0,
      y: 0,
    });
    visionRideTouchRuntime.abandon();
    expect(visionRideTouchRuntime.getSnapshot().engaged).toBe(false);
  });
});
