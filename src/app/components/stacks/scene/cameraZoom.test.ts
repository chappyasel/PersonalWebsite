import { describe, expect, it } from "vitest";

import {
  MIN_CAMERA_TARGET_DISTANCE,
  TAP_FOCUS_ZOOM_MULTIPLIER,
  clampCameraZoom,
  interactionZoomTarget,
  isGolfControlInteraction,
  shouldResetCameraZoomForTravel,
} from "./cameraZoom";

const state = {
  distance: 10,
  focused: false,
  pressed: false,
  hovered: false,
  dragging: false,
  traveling: false,
  blocked: false,
  touchInteraction: true,
};

describe("interaction camera zoom", () => {
  it("uses progressively stronger hover, drag, and focus zoom", () => {
    const hover = interactionZoomTarget({ ...state, hovered: true });
    const drag = interactionZoomTarget({ ...state, dragging: true });
    const focus = interactionZoomTarget({ ...state, focused: true });

    expect(hover).toBeGreaterThan(0);
    expect(drag).toBeGreaterThan(hover);
    expect(focus).toBeGreaterThan(drag);
    expect(focus).toBeCloseTo(4.4 * TAP_FOCUS_ZOOM_MULTIPLIER);
  });

  it("returns to the overview when travel starts", () => {
    expect(
      interactionZoomTarget({ ...state, focused: true, traveling: true }),
    ).toBe(0);
    expect(shouldResetCameraZoomForTravel(false, true)).toBe(true);
    expect(shouldResetCameraZoomForTravel(true, true)).toBe(false);
  });

  it("does not apply automatic object zoom to mouse or pen input", () => {
    expect(
      interactionZoomTarget({
        ...state,
        focused: true,
        touchInteraction: false,
      }),
    ).toBe(0);
  });

  it("identifies Golf controls that use the authored Golf camera", () => {
    expect(isGolfControlInteraction("golf-club:strike")).toBe(true);
    expect(isGolfControlInteraction("golf-ball:one")).toBe(true);
    expect(isGolfControlInteraction("grab:barbell")).toBe(false);
  });

  it("allows broad manual zoom without crossing the shelf", () => {
    expect(clampCameraZoom(-20, 10)).toBe(-0.75);
    expect(clampCameraZoom(20, 10)).toBe(10 - MIN_CAMERA_TARGET_DISTANCE);
  });
});
