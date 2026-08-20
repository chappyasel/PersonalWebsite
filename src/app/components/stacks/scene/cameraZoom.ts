import { WORLD_ZOOM_MIN } from "../mobile/travel";

export const MIN_CAMERA_TARGET_DISTANCE = 3.8;
export const TAP_FOCUS_ZOOM_MULTIPLIER = 1.2;

export function isGolfControlInteraction(id: string | null) {
  return ["golf-club:", "golf-ball:"].some(
    (prefix) => id?.startsWith(prefix) === true,
  );
}

export function shouldResetCameraZoomForTravel(
  wasTraveling: boolean,
  traveling: boolean,
) {
  return traveling && !wasTraveling;
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
  if (traveling || blocked || !touchInteraction) return 0;

  const focusZoom = Math.min(4.5, Math.max(0.7, distance - 5.6));
  if (dragging) return Math.min(3.2, focusZoom * 0.8);
  if (focused) return focusZoom * TAP_FOCUS_ZOOM_MULTIPLIER;
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
