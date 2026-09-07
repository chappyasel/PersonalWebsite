import { useSyncExternalStore } from "react";

// A prop's approach: a tap brings it up to the camera so it can be read, and
// a second tap, Escape, a drag away, or leaving the shelf sends it home. One
// controller per prop, outside the zustand store, because the per-frame
// progress the screens, the focus pull and the depth of field read must never
// flow through React state. At most one prop is near at a time: approaching
// one puts any other back.
//
// Grew out of the Mac's approach; macApproachState.ts keeps that prop's
// names. The globe was the second prop to do this.

/** Fraction of the viewport's shorter framing the prop fills when near. */
export const PROP_APPROACH_FILL = 0.62;
/** The prop never comes nearer than this, whatever the viewport. */
export const PROP_APPROACH_MIN_DISTANCE = 1.2;
/** Scene-position travel (in units) that counts as leaving the shelf. */
export const PROP_APPROACH_RELEASE_TRAVEL = 0.1;
/** Exponential ease rate for the flight, per second. */
export const PROP_APPROACH_LAMBDA = 7;
/** How far the near prop follows the pointer, as fractions of the half frame
 * at its distance, and how far it turns toward it, in radians. Enough to
 * feel held rather than pinned, not enough to leave the centre. */
export const PROP_APPROACH_FOLLOW = {
  x: 0.06,
  y: 0.04,
  yaw: 0.06,
  pitch: 0.035,
} as const;
/** A press anywhere puts the prop back. The same press then reaches the
 * Grabbable as a tap on the prop, whose activation must not bring it straight
 * back; a dismissal this recent makes `approach()` a no-op. */
export const PROP_APPROACH_DISMISS_GRACE_MS = 700;

export type PropApproach = Readonly<{
  id: string;
  readonly near: boolean;
  set(next: boolean): void;
  toggle(): void;
  /** Bring the prop up, unless a press just put it back. */
  approach(at?: number): void;
  /** Put the prop back and remember when, so the tap that did it cannot
   * also be the tap that brings it up again. */
  dismiss(at?: number): void;
  recentlyDismissed(at?: number): boolean;
  subscribe(listener: () => void): () => void;
  /** Eased 0 (on the shelf) to 1 (at the camera), written each frame by the
   * PropApproach wrapper and read imperatively by whatever the prop shows. */
  progress: { current: number };
}>;

let nearApproach: PropApproach | null = null;
const anyListeners = new Set<() => void>();

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function notifyAny() {
  for (const listener of anyListeners) listener();
}

export function createPropApproach(id: string): PropApproach {
  let near = false;
  let dismissedAt = Number.NEGATIVE_INFINITY;
  const listeners = new Set<() => void>();

  const setNear = (next: boolean) => {
    if (near === next) return;
    if (next && nearApproach && nearApproach !== controller)
      nearApproach.set(false);
    near = next;
    if (next) nearApproach = controller;
    else if (nearApproach === controller) nearApproach = null;
    for (const listener of listeners) listener();
    notifyAny();
  };
  const recentlyDismissed = (at = now()) =>
    at - dismissedAt < PROP_APPROACH_DISMISS_GRACE_MS;

  const controller: PropApproach = {
    id,
    get near() {
      return near;
    },
    set: setNear,
    toggle: () => setNear(!near),
    approach: (at = now()) => {
      if (recentlyDismissed(at)) return;
      setNear(true);
    },
    dismiss: (at = now()) => {
      dismissedAt = at;
      setNear(false);
    },
    recentlyDismissed,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    progress: { current: 0 },
  };
  return controller;
}

/** Whichever prop is up at the camera right now, if any. */
export function nearPropApproach(): PropApproach | null {
  return nearApproach;
}

/** While a prop is up at the camera, nothing else on the shelf may take the
 * hover: the room behind it is blurred and stepped aside, and a pointer
 * crossing the coordination orb back there must not set its network going.
 * Controllers are keyed by their prop's hover key so the near prop itself
 * still hovers. */
export function propApproachAllowsHover(id: string | null): boolean {
  return nearApproach === null || id === null || id === nearApproach.id;
}

/** Fires when any prop's near flag changes. */
export function subscribePropApproaches(listener: () => void) {
  anyListeners.add(listener);
  return () => {
    anyListeners.delete(listener);
  };
}

export function usePropApproachNear(approach: PropApproach): boolean {
  return useSyncExternalStore(
    approach.subscribe,
    () => approach.near,
    () => false,
  );
}

export function useAnyPropApproachNear(): boolean {
  return useSyncExternalStore(
    subscribePropApproaches,
    () => nearApproach !== null,
    () => false,
  );
}

/** Camera distance that frames a `height`-tall, `width`-wide prop at `fill`
 * of the viewport, whichever axis binds. */
export function propApproachDistance({
  fovDegrees,
  aspect,
  height,
  width,
  fill = PROP_APPROACH_FILL,
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
  return Math.max(PROP_APPROACH_MIN_DISTANCE, byHeight, byWidth);
}

/** Leaving the shelf puts the prop back: either the active unit is no longer
 * the prop's, or the camera has travelled since the approach began. */
export function propApproachReleased({
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
    Math.abs(scenePosition - startPosition) > PROP_APPROACH_RELEASE_TRAVEL
  );
}
