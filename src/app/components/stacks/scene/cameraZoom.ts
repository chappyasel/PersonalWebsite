import { WORLD_ZOOM_MIN } from "../mobile/travel";

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
}: {
  scenePosition: number;
  previousScenePosition: number;
  alternateStop: number;
}) {
  const distanceFromAuthoredStop = Math.min(
    Math.abs(scenePosition - Math.round(scenePosition)),
    Math.abs(scenePosition - alternateStop),
  );
  const traveling =
    distanceFromAuthoredStop > 0.015 ||
    Math.abs(scenePosition - previousScenePosition) > 0.000_02;

  return {
    traveling,
    // Drei's damping keeps changing the position for roughly half a second
    // after the shelf looks settled. Keep travel cleanup active during that
    // tail, but let an intentional object tap focus once the camera is within
    // the authored stop's visual tolerance.
    focusBlockedByTravel: distanceFromAuthoredStop > 0.015,
  };
}

export function cameraTravelTransition(
  wasBlockingTravel: boolean,
  travel: ReturnType<typeof cameraTravelState>,
) {
  // Residual damping can briefly speed up again as the native scroll element
  // and Drei converge on the same stop. Only leaving the authored stop's
  // visual tolerance should dismiss an intentional object focus.
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
  // `focused` is persistent state created only by the coarse-touch arbiter.
  // Treat it as stronger evidence than the last observed pointer type, which
  // Safari can replace after the tap while the Focus Lean remains active.
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
