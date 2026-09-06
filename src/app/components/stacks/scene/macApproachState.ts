import { useSyncExternalStore } from "react";

// The Mac's approach: a tap brings the machine up to the camera so its screen
// is legible, and a second tap, Escape, a drag, or leaving the shelf sends it
// home. The flag lives here rather than in the zustand store because exactly
// one prop in the room does this, and the per-frame progress the screen and
// the depth of field read must never flow through React state anyway.

/** Fraction of the viewport's shorter framing the machine fills when near. */
export const MAC_APPROACH_FILL = 0.62;
/** The machine never comes nearer than this, whatever the viewport. */
export const MAC_APPROACH_MIN_DISTANCE = 1.2;
/** Scene-position travel (in units) that counts as leaving the shelf. */
export const MAC_APPROACH_RELEASE_TRAVEL = 0.1;
/** Exponential ease rate for the flight, per second. */
export const MAC_APPROACH_LAMBDA = 7;
/** How far the near machine follows the pointer, as fractions of the half
 * frame at its distance, and how far it turns toward it, in radians. Enough
 * to feel held rather than pinned, not enough to leave the centre. */
export const MAC_APPROACH_FOLLOW = {
  x: 0.06,
  y: 0.04,
  yaw: 0.06,
  pitch: 0.035,
} as const;
/** A press anywhere puts the machine back. The same press then reaches the
 * Grabbable as a tap on the Mac, whose activation must not bring it straight
 * back; a dismissal this recent makes `approach()` a no-op. */
export const MAC_APPROACH_DISMISS_GRACE_MS = 700;

let near = false;
let dismissedAt = Number.NEGATIVE_INFINITY;
const listeners = new Set<() => void>();

function setNear(next: boolean) {
  if (near === next) return;
  near = next;
  for (const listener of listeners) listener();
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function recentlyDismissed(at = now()) {
  return at - dismissedAt < MAC_APPROACH_DISMISS_GRACE_MS;
}

function dismiss(at = now()) {
  dismissedAt = at;
  setNear(false);
}

function approach(at = now()) {
  if (recentlyDismissed(at)) return;
  setNear(true);
}

function subscribeNear(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const macApproach = {
  get near() {
    return near;
  },
  set: setNear,
  toggle: () => setNear(!near),
  /** Bring the machine up, unless a press just put it back. */
  approach,
  /** Put the machine back and remember when, so the tap that did it cannot
   * also be the tap that brings it up again. */
  dismiss,
  recentlyDismissed,
  subscribe: subscribeNear,
  /** Eased 0 (on the shelf) to 1 (at the camera), written each frame by the
   * MacApproach wrapper and read imperatively by the screen. */
  progress: { current: 0 },
};

export function useMacApproachNear(): boolean {
  return useSyncExternalStore(
    macApproach.subscribe,
    () => near,
    () => false,
  );
}

/** Camera distance that frames a `height`-tall, `width`-wide machine at
 * MAC_APPROACH_FILL of the viewport, whichever axis binds. */
export function macApproachDistance({
  fovDegrees,
  aspect,
  height,
  width,
  fill = MAC_APPROACH_FILL,
}: {
  fovDegrees: number;
  aspect: number;
  height: number;
  width: number;
  fill?: number;
}): number {
  const tanHalf = Math.tan((fovDegrees * Math.PI) / 360);
  const byHeight = height / (fill * 2 * tanHalf);
  const byWidth = width / (fill * 2 * tanHalf * Math.max(0.01, aspect));
  return Math.max(MAC_APPROACH_MIN_DISTANCE, byHeight, byWidth);
}

/** Leaving the shelf puts the machine back: either the active unit is no
 * longer Projects, or the camera has travelled since the approach began. */
export function macApproachReleased({
  startPosition,
  scenePosition,
  activeUnit,
  unitIndex,
}: {
  startPosition: number;
  scenePosition: number;
  activeUnit: number;
  unitIndex: number;
}): boolean {
  return (
    activeUnit !== unitIndex ||
    Math.abs(scenePosition - startPosition) > MAC_APPROACH_RELEASE_TRAVEL
  );
}
