import { roomWindowEvents } from "../room/roomEvents";
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

/** Where a near prop leads, shown as a button under it while it is up
 * (dom/PropCaption.tsx). The tile used to be a Portal that opened this on a
 * tap; up close the tap is spoken for, so the link moves under the prop. */
export type PropApproachLink = Readonly<{ href: string; label: string }>;

export type PropApproach = Readonly<{
  id: string;
  /** A destination to offer while the prop is up, or null. */
  link: PropApproachLink | null;
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
  /** Where the near pose puts the prop on screen, written each frame by the
   * wrapper while the prop is up: the viewport y, in CSS pixels, of the
   * prop's foot, before the pointer follow and any hand turn. The caption
   * sits just under it (dom/PropCaption.tsx). */
  frame: { bottom: number };
}>;

let nearApproach: PropApproach | null = null;
const anyListeners = new Set<() => void>();

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function notifyAny() {
  for (const listener of anyListeners) listener();
}

export function createPropApproach(
  id: string,
  options: { link?: PropApproachLink } = {},
): PropApproach {
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
    link: options.link ?? null,
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
    frame: { bottom: 0 },
  };
  return controller;
}

/**
 * Fraction of the viewport height at which the near pose's foot projects:
 * the prop is centred, and its half height is some share of the half frame
 * at the near distance (all of `fill` when the height binds, less when the
 * width does). Pure, so the caption's placement can be tested.
 */
export function propApproachBottomFraction({
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
  const distance = propApproachDistance({
    fovDegrees,
    aspect,
    height,
    width,
    fill,
  });
  const halfFrame = distance * Math.tan((fovDegrees * Math.PI) / 360);
  return 0.5 + 0.5 * Math.min(1, height / 2 / Math.max(1e-6, halfFrame));
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

// --- turning a near prop by hand -------------------------------------------
//
// The globe turns through its own SpinProp (globeCloseUpState.ts) because the
// ball spins inside a fixed stand. A prop that is one solid piece (the
// Homework tile) turns as a whole instead: a drag on it while it is up close
// yaws it about the camera's up axis and pitches it about the camera's right
// axis, and a fast release keeps it spinning for a moment. PropApproach reads
// `yaw`/`pitch` each frame, eases toward them, integrates the fling and
// levels everything again on the way home.

/** Pixels of drag for one full turn. */
export const PROP_TURN_PX_PER_LAP = 520;
export const PROP_TURN_RADIANS_PER_PX = (Math.PI * 2) / PROP_TURN_PX_PER_LAP;
export const PROP_TURN_PITCH_RADIANS_PER_PX = 0.006;
export const PROP_TURN_PITCH_LIMIT = 0.55;
/** Release speeds below this, in rad/s, stop dead rather than coast. */
export const PROP_TURN_FLING_MIN = 0.6;
/** Coasting decay, per second. */
export const PROP_TURN_FLING_DECAY = 2.2;
/** Coasting decay on the way home, per second: the spin runs down over the
 * flight rather than stopping the moment the prop is dismissed. */
export const PROP_TURN_HOME_DECAY = 4.5;

export type PropTurn = {
  yaw: number;
  pitch: number;
  /** Coasting yaw speed after a release, rad/s. */
  yawVelocity: number;
  held: boolean;
  /** Ends a drag in progress, idempotent; set while one is live. Called by
   * the wrapper on dismissal and unmount so no listener outlives the prop. */
  cancel: (() => void) | null;
};

export function createPropTurn(): PropTurn {
  return { yaw: 0, pitch: 0, yawVelocity: 0, held: false, cancel: null };
}

export function resetPropTurn(turn: PropTurn) {
  turn.cancel?.();
  turn.yaw = 0;
  turn.pitch = 0;
  turn.yawVelocity = 0;
  turn.held = false;
}

const TAU = Math.PI * 2;

/** The same orientation with the yaw brought into (-π, π], and any drag in
 * progress ended. Used the moment a prop starts home: easing a whole-lap yaw
 * back through π would flip the flight's slerp onto the other short arc
 * mid-way, a visible snap. A coasting fling is kept: the wrapper runs it down
 * over the flight home, so a spinning prop does not lock the instant it is
 * dismissed (owner review, 2026-09-11). Ending a live drag zeroes it. */
export function wrapPropTurn(turn: PropTurn) {
  turn.cancel?.();
  turn.yaw = wrapYaw(turn.yaw);
}

export function wrapYaw(a: number) {
  return ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

/** One pointer step applied to a turn. Pure, for the tests. */
export function propTurnStep(
  turn: PropTurn,
  dx: number,
  dy: number,
): { yaw: number; pitch: number } {
  return {
    yaw: turn.yaw + dx * PROP_TURN_RADIANS_PER_PX,
    pitch: Math.max(
      -PROP_TURN_PITCH_LIMIT,
      Math.min(
        PROP_TURN_PITCH_LIMIT,
        turn.pitch + dy * PROP_TURN_PITCH_RADIANS_PER_PX,
      ),
    ),
  };
}

/**
 * Begin turning a near prop by hand. Called by the carrier when a press on
 * the prop crosses the drag threshold while it is up close; the Grabbable is
 * tap-only then, so nothing is carried. Listens on the room's window events
 * until the pointer lifts, then hands any speed to the fling.
 */
export function beginPropTurn(turn: PropTurn, pointerId?: number) {
  if (typeof window === "undefined") return;
  turn.cancel?.();
  turn.held = true;
  turn.yawVelocity = 0;
  let last: { x: number; y: number; time: number } | null = null;
  let velocity = 0;
  // The carrier's drag-intent callback has no event to hand over, so the
  // drag binds to the first pointer it hears from and ignores every other:
  // a second finger must neither jump the rotation nor end the turn.
  let owner = pointerId;
  const onMove = (event: PointerEvent) => {
    owner ??= event.pointerId;
    if (event.pointerId !== owner) return;
    const time = event.timeStamp;
    if (last) {
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      const seconds = Math.max(1e-3, (time - last.time) / 1000);
      const step = propTurnStep(turn, dx, dy);
      const turned = step.yaw - turn.yaw;
      turn.yaw = step.yaw;
      turn.pitch = step.pitch;
      // Blend toward the latest speed so a pause before release reads as a
      // stop rather than a fling.
      velocity = velocity * 0.6 + (turned / seconds) * 0.4;
    }
    last = { x: event.clientX, y: event.clientY, time };
  };
  const detach = () => {
    roomWindowEvents.removeEventListener("pointermove", onMove);
    roomWindowEvents.removeEventListener("pointerup", end);
    roomWindowEvents.removeEventListener("pointercancel", cancel);
    roomWindowEvents.removeEventListener("blur", cancel);
    turn.held = false;
    if (turn.cancel === cancel) turn.cancel = null;
  };
  const end = (event: PointerEvent) => {
    if (owner !== undefined && event.pointerId !== owner) return;
    detach();
    const stale = last ? event.timeStamp - last.time > 120 : true;
    const fling = !stale && Math.abs(velocity) >= PROP_TURN_FLING_MIN;
    turn.yawVelocity = fling ? velocity : 0;
  };
  // A cancelled pointer, a lost window, a dismissal or an unmount: stop
  // where it is, never fling.
  const cancel = () => {
    detach();
    turn.yawVelocity = 0;
  };
  turn.cancel = cancel;
  roomWindowEvents.addEventListener("pointermove", onMove);
  roomWindowEvents.addEventListener("pointerup", end);
  roomWindowEvents.addEventListener("pointercancel", cancel);
  roomWindowEvents.addEventListener("blur", cancel);
}
