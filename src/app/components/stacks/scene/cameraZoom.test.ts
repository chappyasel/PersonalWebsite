import { describe, expect, it } from "vitest";

import {
  MIN_CAMERA_TARGET_DISTANCE,
  TAP_FOCUS_ZOOM_MULTIPLIER,
  cameraTravelState,
  cameraTravelTransition,
  clampCameraZoom,
  interactionZoomTarget,
  isGolfControlInteraction,
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

  it("adds twenty percent to the previous phone tap-focus zoom", () => {
    expect(TAP_FOCUS_ZOOM_MULTIPLIER).toBeCloseTo(1.2 * 1.2);
  });

  it("returns to the overview when travel starts", () => {
    expect(
      interactionZoomTarget({ ...state, focused: true, traveling: true }),
    ).toBe(0);
    const travel = cameraTravelState({
      scenePosition: 1.2,
      previousScenePosition: 1.1,
      alternateStop: 1.52,
    });
    expect(cameraTravelTransition(false, travel).resetFocus).toBe(true);
    expect(cameraTravelTransition(true, travel).resetFocus).toBe(false);
  });

  it.each([1, 2, 3, 4, 5, 6])(
    "allows object focus during the damping tail at shelf %i",
    (shelf) => {
      const travel = cameraTravelState({
        scenePosition: shelf + 0.009,
        previousScenePosition: shelf + 0.011,
        alternateStop: 3.65,
      });

      expect(travel.traveling).toBe(true);
      expect(travel.focusBlockedByTravel).toBe(false);
    },
  );

  it("does not clear focus for the captured end-of-settle motion", () => {
    const arrival = cameraTravelState({
      scenePosition: 2.9994,
      previousScenePosition: 3.0001,
      alternateStop: 1.52,
    });

    expect(arrival.traveling).toBe(true);
    expect(arrival.focusBlockedByTravel).toBe(false);
    expect(cameraTravelTransition(false, arrival)).toEqual({
      resetFocus: false,
      blockingTravel: false,
    });
  });

  it("keeps touch focus zoom after pointer classification becomes stale", () => {
    expect(
      interactionZoomTarget({
        ...state,
        focused: true,
        touchInteraction: false,
      }),
    ).toBeGreaterThan(0);
    expect(
      interactionZoomTarget({
        ...state,
        hovered: true,
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
