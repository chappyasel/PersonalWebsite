import fs from "node:fs";
import { describe, expect, it } from "vitest";

import {
  MIN_CAMERA_TARGET_DISTANCE,
  PORTRAIT_TOUCH_FOCUS_Y_LIMIT,
  SELECTION_CAMERA_PITCH_DEGREES,
  TAP_FOCUS_ZOOM_MULTIPLIER,
  cameraTravelState,
  cameraTravelTransition,
  clampCameraZoom,
  interactionFocusYOffset,
  interactionZoomTarget,
  isGolfControlInteraction,
} from "./cameraZoom";
import { eyeYForTiltAroundTarget } from "./pointerCameraTilt";
import { SHELF_SURFACE } from "./shelfGeometry";

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
const cameraRigSource = fs.readFileSync(
  new URL("./CameraRig.tsx", import.meta.url),
  "utf8",
);

describe("interaction camera zoom", () => {
  it("pitches selection down three degrees around an unchanged target", () => {
    const eyeY = 0.25;
    const lookY = -0.08;
    const distance = 6;
    const pitch = (SELECTION_CAMERA_PITCH_DEGREES * Math.PI) / 180;
    const raisedEye = eyeYForTiltAroundTarget({
      eyeY,
      lookY,
      horizontalDistance: distance,
      tiltRadians: pitch,
    });
    expect(Math.atan2(lookY - raisedEye, distance)).toBeCloseTo(
      Math.atan2(lookY - eyeY, distance) - Math.PI / 60,
    );
    expect(cameraRigSource).toContain(
      "focusAmount.current * SELECTION_CAMERA_PITCH_DEGREES",
    );
    expect(cameraRigSource).toContain(
      "selectionCameraPitchController.getSnapshot().enabled",
    );
  });
  it("aims a portrait Touch Focus far enough down to keep a lower-shelf globe in frame", () => {
    const baselineLookY = -0.08;
    const coordinationScale = 1.386;
    const globeLocalCenterY = ((0.147 + 0.105) * coordinationScale) / 2;
    const globeWorldCenterY = SHELF_SURFACE.lower + globeLocalCenterY;
    const offset = interactionFocusYOffset({
      centerY: globeWorldCenterY,
      baselineLookY,
      portrait: true,
    });

    expect(offset).toBeCloseTo(-PORTRAIT_TOUCH_FOCUS_Y_LIMIT);
    expect(baselineLookY + offset).toBeLessThan(globeWorldCenterY + 0.1);
    expect(
      interactionFocusYOffset({
        centerY: globeWorldCenterY,
        baselineLookY,
        portrait: false,
      }),
    ).toBe(-0.12);
  });

  it("uses authored interaction bounds in the live camera focus path", () => {
    expect(cameraRigSource).toContain("focusSpec.projectedLocalBounds");
    expect(cameraRigSource).toContain("interactionFocusYOffset({");
    expect(cameraRigSource).toContain("presentationProfileForViewport(");
  });

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

  it("zooms a newly selected object after scrolling stops between shelves", () => {
    const scrolling = cameraTravelState({
      scenePosition: 2.2,
      previousScenePosition: 2.1,
      alternateStop: 1.52,
    });
    expect(cameraTravelTransition(false, scrolling).resetFocus).toBe(true);
    const stopped = cameraTravelState({
      scenePosition: 2.2,
      previousScenePosition: 2.2,
      alternateStop: 1.52,
    });
    expect(
      interactionZoomTarget({
        ...state,
        focused: true,
        touchInteraction: false,
        traveling: stopped.focusBlockedByTravel,
      }),
    ).toBeGreaterThan(0);
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

  it("gives desktop selection the same zoom as touch while keeping hover quiet", () => {
    expect(
      interactionZoomTarget({
        ...state,
        focused: true,
        touchInteraction: false,
      }),
    ).toBe(interactionZoomTarget({ ...state, focused: true }));
    expect(
      interactionZoomTarget({
        ...state,
        hovered: true,
        touchInteraction: false,
      }),
    ).toBe(0);
    const focusGate = cameraRigSource.slice(
      cameraRigSource.indexOf("const focusEnabled ="),
      cameraRigSource.indexOf("let desiredFocusX ="),
    );
    expect(focusGate).not.toContain("interactionPointerType");
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
