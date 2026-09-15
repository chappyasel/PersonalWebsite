import { onRoomTakeover } from "../input/coarseTravelOwnership";

import { desktopMotionPreference } from "~/lib/desktopMotionPreference";
import { onUniversalSearchSelection } from "~/lib/universal-search/overlay";

import { openUniversalSearch } from "~/components/universal-search/UniversalSearchController";

/** Used by both drei's room travel and the edge spring. */
export const ROOM_TRAVEL_DAMPING_SECONDS = 0.2;
const EDGE_LIMIT = 0.18;
const EDGE_ROTATION_RADIANS = (4 * Math.PI) / 180;

/** Temporary edge deflection for camera rotation and illustrated motion.
 * It never changes the selected shelf, scroll position, or URL. */
export function createRoomEdgeMotion() {
  let snapshot = { enabled: true, active: false };
  let offset = 0;
  let velocity = 0;
  let previous: number | null = null;
  let frame = 0;
  let lastPullAt = -Infinity;
  let lastPull = 0;
  let returningTail = false;
  let gestureMovedOutward = false;
  let risingPulls = 0;
  let risingDistance = 0;
  const listeners = new Set<() => void>();
  const frames = new Set<() => void>();
  let stopWatching: (() => void) | null = null;
  const active = (value: boolean) => {
    if (snapshot.active === value) return;
    snapshot = { ...snapshot, active: value };
    if (value) {
      const stopNavigation = onRoomTakeover(cancel);
      const stopSelection = onUniversalSearchSelection(cancel);
      const hidden = () => {
        if (document.hidden) cancel();
      };
      window.addEventListener("blur", cancel);
      document.addEventListener("visibilitychange", hidden);
      stopWatching = () => {
        stopNavigation();
        stopSelection();
        window.removeEventListener("blur", cancel);
        document.removeEventListener("visibilitychange", hidden);
      };
    } else {
      stopWatching?.();
      stopWatching = null;
    }
    for (const listener of listeners) listener();
  };
  const publish = (value: number) => {
    offset = value;
    for (const listener of frames) listener();
  };
  const clear = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    velocity = 0;
    previous = null;
    lastPullAt = -Infinity;
    lastPull = 0;
    returningTail = false;
    gestureMovedOutward = false;
    risingPulls = 0;
    risingDistance = 0;
  };
  const allowed = () =>
    snapshot.enabled &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    !desktopMotionPreference.getSnapshot();
  const cancel = () => {
    clear();
    publish(0);
    active(false);
  };
  const sample = (now = performance.now()) => {
    if (previous === null) {
      previous = now;
      return offset;
    }
    const dt = Math.max(0, (now - previous) / 1000);
    if (dt === 0) return offset;
    previous = now;
    const frequency = 2 / ROOM_TRAVEL_DAMPING_SECONDS;
    const carry = velocity + frequency * offset;
    const decay = Math.exp(-frequency * dt);
    const next = (offset + carry * dt) * decay;
    velocity = (velocity - frequency * carry * dt) * decay;
    if (offset !== 0 && next * offset < 0) {
      velocity = 0;
      offset = 0;
    } else {
      offset = Math.max(-EDGE_LIMIT, Math.min(EDGE_LIMIT, next));
      if (Math.abs(next) > EDGE_LIMIT && velocity * offset > 0) velocity = 0;
    }
    return offset;
  };
  const startSpring = () => {
    if (frame) return;
    active(true);
    const tick = () => {
      if (!allowed()) {
        cancel();
        return;
      }
      // The camera also samples this analytic spring at its own render time.
      // Extra reads never advance it twice or repeat an old animation frame.
      publish(sample());
      if (Math.abs(offset) < 0.00005 && Math.abs(velocity) < 0.0005) {
        publish(0);
        previous = null;
        velocity = 0;
        // Keep the renderer running for one final frame at its resting pose.
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (offset !== 0 || velocity !== 0) startSpring();
          else active(false);
        });
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };
  const rawOffset = () =>
    Math.sign(offset) *
    -180 *
    Math.log(1 - Math.min(0.999, Math.abs(offset) / EDGE_LIMIT));
  return {
    getSnapshot: () => snapshot,
    getOffset: () => (snapshot.active ? sample() : offset),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeFrame: (listener: () => void) => {
      frames.add(listener);
      return () => {
        frames.delete(listener);
      };
    },
    setEnabled(enabled: boolean) {
      if (!enabled) cancel();
      snapshot = { ...snapshot, enabled };
      for (const listener of listeners) listener();
    },
    pull(distance: number) {
      if (!allowed() || !Number.isFinite(distance) || distance === 0) return;
      const now = performance.now();
      sample(now);
      const magnitude = Math.abs(distance);
      const separated = now - lastPullAt > 180 || distance * lastPull <= 0;
      // A fresh trackpad contact can interrupt momentum without a quiet gap.
      // Require a sustained ramp, not one larger packet in an uneven tail.
      if (!separated && magnitude > Math.abs(lastPull)) {
        risingPulls += 1;
        risingDistance += magnitude;
      } else {
        risingPulls = 0;
        risingDistance = 0;
      }
      const renewed = returningTail && risingPulls >= 3 && risingDistance >= 48;
      if (separated || renewed) {
        returningTail = false;
        gestureMovedOutward = false;
        risingPulls = 0;
        risingDistance = 0;
      } else if (
        gestureMovedOutward &&
        offset !== 0 &&
        velocity * offset <= 0
      ) {
        returningTail = true;
      }
      lastPullAt = now;
      lastPull = distance;
      // One excursion per gesture: momentum deltas can grow briefly even
      // while the gesture is dying away. Only a new gesture can rearm it.
      if (returningTail) return;
      const resistance = (1 - Math.min(1, Math.abs(offset) / EDGE_LIMIT)) ** 2;
      velocity += Math.max(-2.5, Math.min(2.5, distance / 60)) * resistance;
      // A gentle new swipe must first overcome the previous return before
      // that return can count as the new gesture's momentum tail.
      if (velocity * distance > 0) gestureMovedOutward = true;
      startSpring();
    },
    /** Spend inward wheel travel on the existing stretch before entering the room. */
    consume(delta: number) {
      sample();
      if (!allowed() || offset * delta <= 0) return delta;
      const stretch = Math.abs(rawOffset());
      const spent = Math.min(Math.abs(delta), stretch);
      velocity -= (Math.sign(delta) * spent) / 60;
      return delta - Math.sign(delta) * spent;
    },
    play(initialOffset?: number) {
      if (!allowed()) return;
      sample();
      if (initialOffset !== undefined && initialOffset > offset)
        publish(Math.min(EDGE_LIMIT, initialOffset));
      // A sheet swipe turns the camera briefly left with an impulse.
      // An existing edge stretch simply continues its return.
      if (offset === 0 && velocity === 0) velocity = 2;
      startSpring();
    },
    cancel,
  };
}

export const roomEdgeMotion = createRoomEdgeMotion();

export function openSearchFromEdge(initialOffset?: number) {
  roomEdgeMotion.play(initialOffset);
  openUniversalSearch();
}

/** The offset is already eased. Apply it after the normal camera pose so
 * restoring zero cannot leave a damped camera frozen partway home. */
export function applyRoomEdgeCameraRotation(
  camera: { rotateY: (angle: number) => unknown },
  offset = roomEdgeMotion.getOffset(),
) {
  if (offset === 0) return;
  camera.rotateY(
    Math.max(-1, Math.min(1, offset / EDGE_LIMIT)) * EDGE_ROTATION_RADIANS,
  );
}

export function searchFreezesRoom(searchOpen: boolean, motionActive: boolean) {
  return searchOpen && !motionActive;
}
