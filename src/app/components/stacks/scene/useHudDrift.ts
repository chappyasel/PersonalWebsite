"use client";

import { UNIT_COUNT } from "../data";
import { roomWindowEvents } from "../room/roomEvents";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";

import { useDesktopReducedMotion } from "~/lib/desktopMotionPreference";

import {
  HUD_MOBILE_TRAVEL_MAX_PX,
  HUD_MOUSE_MAX_PX,
  HUD_TRAVEL_MAX_PX,
  advanceHudCameraDrift,
  advanceHudPointerSpring,
  hudCameraDriftController,
} from "./hudCameraDriftControl";
import { advancePointerArrival, pointerArrivalWeight } from "./pointerArrival";
import { STACKS_DESKTOP_MIN_WIDTH, ogCaptureFromSearch } from "./worldLayout";

const MEDIA_QUERY = `(min-width: ${STACKS_DESKTOP_MIN_WIDTH}px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)`;
const MOBILE_MEDIA_QUERY = `(width < ${STACKS_DESKTOP_MIN_WIDTH}px) and (prefers-reduced-motion: no-preference)`;
const serverProfile = () => "off" as const;
const MOBILE_HUD_TARGETS =
  ".stacks-mobile-hud-drift, [data-stacks-mobile-sheet-drift]";
const SIDEBAR_TARGETS =
  "[data-stacks-desktop-dock], [data-stacks-details-toggle-shell]";
type HudTarget = {
  property: "translate" | "transform";
  original: string;
  /** Holds the drawn offset while the element is away from rest. */
  hold: Animation | null;
};
/** The resting style each element had before any drift claimed it. The 2D
 * drift and the 3D drift live in different React roots, so on a dimension
 * switch the incoming one can claim an element before the outgoing one
 * lets go. Reading the inline style then would record the other drift's
 * offset as the resting style and restore it on the next switch. */
const claims = new WeakMap<
  HTMLElement,
  { original: string; holders: number }
>();

function claim(element: HTMLElement, property: HudTarget["property"]) {
  let held = claims.get(element);
  if (!held) {
    held = { original: element.style[property], holders: 0 };
    claims.set(element, held);
  }
  held.holders++;
  return { property, original: held.original, hold: null };
}

function unclaim(element: HTMLElement) {
  const held = claims.get(element);
  if (held && --held.holders <= 0) claims.delete(element);
}
const HUD_TARGETS = [
  ".stacks-hud-drift",
  ".stacks-debug-launchers",
  "[data-stacks-desktop-dock]",
  "[data-stacks-details-toggle-shell]",
  "[data-stacks-portal-label]",
  "[data-stacks-globe-label]",
  "[data-prop-caption]",
].join(",");
/** Matches the placard's paper-to-glass handoff (placardPaper.css). */
const HUD_RETURN_MS = 420;

function offsetValue(target: HudTarget, x: number, y: number) {
  return target.property === "transform"
    ? y === 0
      ? `translateX(${x}px)`
      : `translate(${x}px, ${y}px)`
    : `${x}px ${y === 0 ? "0" : `${y}px`}`;
}

/** Draw the offset through a paused Web Animation rather than the inline
 * style. Every inline write is a `style` attribute mutation, and an ad
 * blocker's `:has()` filters turn each one into a restyle of most of the
 * page: AdGuard cost about 40 ms a frame during travel. Updating a held
 * animation's keyframes moves the element without mutating the DOM.
 * Without `animate` (jsdom), the inline style still carries the offset. */
function writeOffset(
  element: HTMLElement,
  target: HudTarget,
  x: number,
  y = 0,
  keepTransform = false,
) {
  const atRest = x === 0 && y === 0 && !keepTransform;
  if (typeof element.animate !== "function") {
    element.style[target.property] = atRest
      ? target.original
      : offsetValue(target, x, y);
    return;
  }
  if (atRest) {
    target.hold?.cancel();
    target.hold = null;
    return;
  }
  const value = offsetValue(target, x, y);
  const keyframes = [
    { [target.property]: value },
    { [target.property]: value },
  ];
  // A hold cancelled from outside goes idle; draw a fresh one instead.
  const effect =
    target.hold?.playState === "idle"
      ? null
      : (target.hold?.effect as KeyframeEffect | null | undefined);
  if (effect) {
    effect.setKeyframes(keyframes);
    return;
  }
  target.hold = element.animate(keyframes, { duration: 1, fill: "both" });
  target.hold.pause();
}

/** Restore the resting style, then glide from the last drawn offset into
 * whatever the element shows underneath. Leaving 3D otherwise dropped the
 * cards up to HUD_MOUSE_MAX_PX in one frame. The implicit end keyframe
 * follows the underlying style, so the next renderer's writes land under
 * the glide instead of fighting it. */
function releaseOffset(
  element: HTMLElement,
  target: HudTarget,
  x: number,
  y: number,
) {
  writeOffset(element, target, 0);
  if ((x === 0 && y === 0) || typeof element.animate !== "function") return;
  element.animate([{ [target.property]: offsetValue(target, x, y) }, {}], {
    duration: HUD_RETURN_MS,
    easing: "ease-in-out",
  });
}
const getProfile = () =>
  window.matchMedia(MEDIA_QUERY).matches
    ? "desktop"
    : window.matchMedia(MOBILE_MEDIA_QUERY).matches
      ? "mobile"
      : "off";
function subscribeMedia(listener: () => void) {
  const queries = [MEDIA_QUERY, MOBILE_MEDIA_QUERY].map((query) =>
    window.matchMedia(query),
  );
  for (const query of queries) query.addEventListener("change", listener);
  return () => {
    for (const query of queries) query.removeEventListener("change", listener);
  };
}

/** Shared DOM motion for the illustrated room and the live camera. */
export function useHudDrift(
  root: RefObject<HTMLElement | null>,
  mobile: boolean,
  allowMouse = true,
) {
  const targets = useRef(new Map<HTMLElement, HudTarget>());
  const previousProgress = useRef<number | null>(null);
  const offset = useRef(0);
  const mouseOffset = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  // Seconds since the pointer was first heard while this drift is active.
  // The camera eases the pointer in on the same curve (pointerArrival.ts);
  // without it the cards reached the mouse two seconds before the room did.
  const mouseArrival = useRef(0);
  const renderedOffset = useRef({ x: 0, y: 0 });
  const heldPointers = useRef(new Set<number>());

  useEffect(() => {
    if (!mobile) return;
    const shell = root.current?.closest(".stacks-world-shell");
    const held = heldPointers.current;
    const press = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        shell?.contains(event.target) &&
        event.target.closest(MOBILE_HUD_TARGETS)
      )
        held.add(event.pointerId);
    };
    const release = (event: PointerEvent) => held.delete(event.pointerId);
    const clear = () => held.clear();
    // Capture observes a press before rail scrubbing takes pointer capture.
    // Coordinates stay frozen under the finger; native clicks/gestures pass through.
    roomWindowEvents.addEventListener("pointerdown", press, {
      capture: true,
      passive: true,
    });
    roomWindowEvents.addEventListener("pointerup", release, {
      capture: true,
      passive: true,
    });
    roomWindowEvents.addEventListener("pointercancel", release, {
      capture: true,
      passive: true,
    });
    roomWindowEvents.addEventListener("lostpointercapture", release, {
      capture: true,
      passive: true,
    });
    roomWindowEvents.addEventListener("blur", clear);
    return () => {
      roomWindowEvents.removeEventListener("pointerdown", press, true);
      roomWindowEvents.removeEventListener("pointerup", release, true);
      roomWindowEvents.removeEventListener("pointercancel", release, true);
      roomWindowEvents.removeEventListener("lostpointercapture", release, true);
      roomWindowEvents.removeEventListener("blur", clear);
      held.clear();
    };
  }, [root, mobile]);

  useEffect(() => {
    const shell = root.current?.closest<HTMLElement>(".stacks-world-shell");
    if (!shell) return;
    const elements = targets.current;
    // Mutated in place each frame, so cleanup reads the last drawn offset.
    const rendered = renderedOffset.current;
    previousProgress.current = null;
    offset.current = 0;
    mouseOffset.current.x = 0;
    mouseOffset.current.y = 0;
    mouseOffset.current.vx = 0;
    mouseOffset.current.vy = 0;
    mouseArrival.current = 0;
    renderedOffset.current.x = 0;
    renderedOffset.current.y = 0;
    const refresh = () => {
      for (const [element, target] of elements) {
        if (!shell.contains(element)) {
          writeOffset(element, target, 0);
          unclaim(element);
          elements.delete(element);
        }
      }
      for (const element of shell.querySelectorAll<HTMLElement>(
        mobile ? MOBILE_HUD_TARGETS : HUD_TARGETS,
      )) {
        if (elements.has(element)) continue;
        // The sidebar's translate has a 360ms CSS hide/show transition.
        // Its transform is independent and unanimated, so frame updates land
        // immediately without overriding the sidebar's retracted position.
        const property = element.matches(SIDEBAR_TARGETS)
          ? "transform"
          : "translate";
        const target = claim(element, property);
        elements.set(element, target);
        if (renderedOffset.current.x !== 0 || renderedOffset.current.y !== 0)
          writeOffset(
            element,
            target,
            renderedOffset.current.x,
            renderedOffset.current.y,
          );
      }
    };
    refresh();
    // Refresh only when elements mount or unmount, never on frame/style writes
    // or the diagnostics HUD's periodic text updates.
    const observer = new MutationObserver((records) => {
      if (
        records.some((record) =>
          [...record.addedNodes, ...record.removedNodes].some(
            (node) => node.nodeType === 1,
          ),
        )
      )
        refresh();
    });
    observer.observe(shell, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      const { x, y } = rendered;
      for (const [element, target] of elements) {
        releaseOffset(element, target, x, y);
        unclaim(element);
      }
      elements.clear();
    };
  }, [root, mobile]);

  return useCallback(
    (
      pointer: { x: number; y: number },
      delta: number,
      progress: number,
      active: boolean,
    ) => {
      const settings = hudCameraDriftController.getSnapshot();
      const previous = previousProgress.current;
      const travelActive = active && settings.enabled;
      const velocity =
        travelActive && previous !== null && delta > 0
          ? ((progress - previous) * (UNIT_COUNT - 1)) / delta
          : 0;
      previousProgress.current = travelActive ? progress : null;
      // Rebase progress while held so releasing cannot accumulate a travel kick.
      if (mobile && travelActive && heldPointers.current.size > 0) return;
      offset.current = travelActive
        ? advanceHudCameraDrift(
            offset.current,
            velocity,
            delta,
            mobile ? HUD_MOBILE_TRAVEL_MAX_PX : HUD_TRAVEL_MAX_PX,
          )
        : 0;
      let combinedX = offset.current;
      let combinedY = 0;
      if (allowMouse && !mobile && active && settings.mouseEnabled) {
        mouseArrival.current = advancePointerArrival(mouseArrival.current, {
          revealed: true,
          pointerSeen: pointer.x !== 0 || pointer.y !== 0,
          frameSeconds: delta,
        });
        const arrival = pointerArrivalWeight(mouseArrival.current);
        // Both renderers provide normalized input to the same smoothing step.
        const x =
          -Math.max(-1, Math.min(1, pointer.x)) * HUD_MOUSE_MAX_PX * arrival;
        const y =
          Math.max(-1, Math.min(1, pointer.y)) * HUD_MOUSE_MAX_PX * arrival;
        advanceHudPointerSpring(mouseOffset.current, x, y, delta);
        // Keep the approved travel curve and cap; mouse motion yields to travel.
        const mouseWeight =
          1 - Math.min(1, Math.abs(offset.current) / HUD_TRAVEL_MAX_PX);
        combinedX += mouseOffset.current.x * mouseWeight;
        combinedY = mouseOffset.current.y * mouseWeight;
      } else {
        mouseArrival.current = 0;
        mouseOffset.current.x = 0;
        mouseOffset.current.y = 0;
        mouseOffset.current.vx = 0;
        mouseOffset.current.vy = 0;
      }
      const x = Math.round(combinedX * 10) / 10;
      const y = Math.round(combinedY * 10) / 10;
      if (renderedOffset.current.x === x && renderedOffset.current.y === y)
        return;
      renderedOffset.current.x = x;
      renderedOffset.current.y = y;
      // Direct translations avoid changing an inherited variable above every
      // resident content section. At rest, no DOM writes occur.
      // 2D must retain its transform context when the last travel offset
      // reaches zero; cleanup alone restores the original styles.
      for (const [element, target] of targets.current)
        writeOffset(element, target, x, y, !allowMouse);
    },
    [mobile, allowMouse],
  );
}

/** Both renderers honor the same live diagnostics and accessibility settings. */
export function useHudDriftProfile(allowMouse = true) {
  const reducedMotion = useDesktopReducedMotion();
  const { enabled, mouseEnabled } = useSyncExternalStore(
    hudCameraDriftController.subscribe,
    hudCameraDriftController.getSnapshot,
    hudCameraDriftController.getSnapshot,
  );
  const profile = useSyncExternalStore(
    subscribeMedia,
    getProfile,
    serverProfile,
  );
  if (
    reducedMotion ||
    (!enabled && !(allowMouse && mouseEnabled)) ||
    (profile === "mobile" && !enabled) ||
    (typeof window !== "undefined" &&
      ogCaptureFromSearch(window.location.search))
  )
    return "off";
  return profile;
}
