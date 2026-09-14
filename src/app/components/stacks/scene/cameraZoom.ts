import { WORLD_ZOOM_MIN } from "../mobile/travel";

import { createPointerCameraTiltController } from "./pointerCameraTilt";

export const SELECTION_CAMERA_PITCH_DEGREES = 3;
export const selectionCameraPitchController =
  createPointerCameraTiltController();

export const MIN_CAMERA_TARGET_DISTANCE = 3.8;
export const TAP_FOCUS_ZOOM_MULTIPLIER = 1.44;
/** Portrait Composition can focus either shelf, so its target needs enough
 * vertical travel to reach the lower shelf before the stronger tap dolly
 * magnifies the remaining error. Wide layouts retain the restrained pan. */
export const PORTRAIT_TOUCH_FOCUS_Y_LIMIT = 0.52;
const WIDE_FOCUS_Y_LIMIT = 0.12;

export function interactionFocusYOffset({
  centerY,
  baselineLookY,
  portrait,
}: {
  centerY: number;
  baselineLookY: number;
  portrait: boolean;
}) {
  const limit = portrait ? PORTRAIT_TOUCH_FOCUS_Y_LIMIT : WIDE_FOCUS_Y_LIMIT;
  return Math.max(-limit, Math.min(limit, centerY - baselineLookY));
}

export function isGolfControlInteraction(id: string | null) {
  return ["golf-club:", "golf-ball:"].some(
    (prefix) => id?.startsWith(prefix) === true,
  );
}

export function cameraTravelState({
  scenePosition,
  previousScenePosition,
  alternateStop,
  touchInteraction = false,
}: {
  scenePosition: number;
  previousScenePosition: number;
  alternateStop: number;
  touchInteraction?: boolean;
}) {
  const distanceFromAuthoredStop = Math.min(
    Math.abs(scenePosition - Math.round(scenePosition)),
    Math.abs(scenePosition - alternateStop),
  );
  const moving = Math.abs(scenePosition - previousScenePosition) > 0.000_02;
  const awayFromStop = distanceFromAuthoredStop > 0.015;
  const traveling = moving || (touchInteraction && awayFromStop);

  return {
    traveling,
    // Touch snaps to authored stops. A desktop wheel can stop anywhere, so
    // being between shelves must not block selection once motion settles.
    // Near a stop, allow focus during the small remaining damping tail.
    focusBlockedByTravel: awayFromStop && (touchInteraction || moving),
  };
}

export function cameraTravelTransition(
  wasBlockingTravel: boolean,
  travel: ReturnType<typeof cameraTravelState>,
) {
  // Only entering blocked travel dismisses focus. Small damping tails near
  // a stop, and stationary desktop positions between stops, remain selectable.
  const blockingTravel = travel.focusBlockedByTravel;
  return {
    resetFocus: blockingTravel && !wasBlockingTravel,
    blockingTravel,
  };
}

export function interactionZoomTarget({
  distance,
  focused,
  pressed,
  hovered,
  dragging,
  traveling,
  blocked,
  touchInteraction,
}: {
  distance: number;
  focused: boolean;
  pressed: boolean;
  hovered: boolean;
  dragging: boolean;
  traveling: boolean;
  blocked: boolean;
  touchInteraction: boolean;
}) {
  if (traveling || blocked) return 0;

  const focusZoom = Math.min(4.5, Math.max(0.7, distance - 5.6));
  // Selection zoom is shared by mouse and touch. Hover and carrying retain
  // their input-specific camera behavior below.
  if (focused) return focusZoom * TAP_FOCUS_ZOOM_MULTIPLIER;
  if (!touchInteraction) return 0;
  if (dragging) return Math.min(3.2, focusZoom * 0.8);
  if (pressed) return 0.3;
  if (hovered) return Math.min(0.8, Math.max(0.45, distance * 0.075));
  return 0;
}

export function clampCameraZoom(zoom: number, distance: number) {
  return Math.min(
    Math.max(0, distance - MIN_CAMERA_TARGET_DISTANCE),
    Math.max(WORLD_ZOOM_MIN, zoom),
  );
}
