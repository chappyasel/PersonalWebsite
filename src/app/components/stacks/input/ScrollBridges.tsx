"use client";

// Input bridges for the horizontal world. Vertical wheel/trackpad and vertical
// touch swipes translate into lateral travel on drei's real scroll container;
// keyboard arrows hop one unit. All bridges suspend while the book modal is
// open or when the pointer is inside an opted-in scrollable region
// ([data-stacks-scrollable] — placard panels).
//
// The wheel listener runs window-level in the CAPTURE phase and stops
// propagation: drei's ScrollControls attaches its own passive wheel handler
// (scrollLeft += deltaY / 2) on the scroll element, and letting both run would
// double-apply deltas at inconsistent rates.
import { UNITS, UNIT_COUNT, unitIndexFromHash } from "../data";
import { closeStacksPanel, useStacks } from "../store";
import { useEffect, useRef } from "react";

function wheelDeltaPx(e: WheelEvent, axisDelta: number): number {
  if (e.deltaMode === 1) return axisDelta * 33; // lines
  if (e.deltaMode === 2) return axisDelta * window.innerHeight; // pages
  return axisDelta;
}

type BridgeInteractionState = Pick<
  ReturnType<typeof useStacks.getState>,
  "dragging" | "modalOpen" | "panelState"
>;

/** One prop/overlay gets a gesture at a time. In particular, Pointer Events
 * can hand a touch drag to a Grabbable before this Touch Events bridge sees
 * `touchmove`; continuing here would move the room underneath the prop. */
export function blocksWorldTouchTravel(state: BridgeInteractionState) {
  return !!state.dragging || state.modalOpen || state.panelState !== "closed";
}

/** DOM cards opt out of world navigation without needing to stop bubbling.
 * Kept structural so events whose target is Window/Text cannot throw. */
export function isStacksScrollableTarget(target: EventTarget | null) {
  const closest = (target as { closest?: (selector: string) => Element | null })
    ?.closest;
  return (
    typeof closest === "function" &&
    !!closest.call(
      target,
      "[data-stacks-scrollable], [data-stacks-mobile-panel]",
    )
  );
}

/** Horizontal and vertical arrow pairs describe the same previous/next
 * movement through the one-dimensional World. Page keys retain their existing
 * aliases. Keeping the mapping pure makes it harder for the input paths to
 * drift apart. */
export function worldNavigationStep(key: string): -1 | 1 | null {
  if (key === "ArrowRight" || key === "ArrowDown" || key === "PageDown")
    return 1;
  if (key === "ArrowLeft" || key === "ArrowUp" || key === "PageUp") return -1;
  return null;
}

/** Browser pinch zoom arrives as Ctrl+wheel on desktop trackpads. */
export function isBrowserZoomWheel(event: Pick<WheelEvent, "ctrlKey">) {
  return event.ctrlKey;
}

export function isInteractiveWorldNavigationTarget(target: EventTarget | null) {
  const closest = (target as { closest?: (selector: string) => Element | null })
    ?.closest;
  return (
    typeof closest === "function" &&
    !!closest.call(
      target,
      "a[href], button, input, textarea, select, [role='button'], [role='link'], [contenteditable]:not([contenteditable='false'])",
    )
  );
}

export function shouldHandleWorldNavigationKey(
  event: Pick<KeyboardEvent, "defaultPrevented" | "target">,
) {
  return (
    !event.defaultPrevented && !isInteractiveWorldNavigationTarget(event.target)
  );
}

export function backgroundWorldGesture(
  state: BridgeInteractionState,
  scrollableTarget: boolean,
): "blocked" | "collapse-and-travel" | "travel" {
  if (state.modalOpen || state.dragging || scrollableTarget) return "blocked";
  if (state.panelState === "open" || state.panelState === "opening")
    return "collapse-and-travel";
  // `closing` is deliberately travel-capable: the gesture that collapsed the
  // sheet must not disappear while its 280ms visual settle finishes.
  return "travel";
}

export default function ScrollBridges() {
  const scrollEl = useStacks((s) => s.scrollEl);
  const jumpTo = useStacks((s) => s.jumpTo);
  const didInitialJump = useRef(false);

  // History wiring. Hash mirrors the active unit (replaceState while
  // traveling); deep-links jump instantly on mount; back/forward travels.
  useEffect(() => {
    if (!scrollEl || !jumpTo) return;

    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    if (!didInitialJump.current) {
      didInitialJump.current = true;
      const target = unitIndexFromHash(window.location.hash);
      if (target !== null && target > 0) jumpTo(target);
    }

    // Mirror travel into the URL — at most one replaceState per unit change.
    let mirrored = useStacks.getState().activeUnit;
    const unsubscribe = useStacks.subscribe((state) => {
      if (state.activeUnit === mirrored) return;
      mirrored = state.activeUnit;
      if (state.modalOpen) return; // the modal owns the URL while open
      if (state.panelState !== "closed") return; // panel owns it too
      const slug = UNITS[mirrored]?.slug;
      window.history.replaceState(
        null,
        "",
        mirrored === 0 || !slug
          ? window.location.pathname + window.location.search
          : `#${slug}`,
      );
    });

    const onPopState = () => {
      const state = useStacks.getState();
      if (state.modalOpen) return;
      // Browser back while the mobile panel is up closes the panel — the
      // pushed entry belongs to it — and never travels.
      if (state.panelState === "open" || state.panelState === "opening") {
        state.setPanelState("closing");
        return;
      }
      if (state.panelState === "closing") return; // our own history.back()
      const target = unitIndexFromHash(window.location.hash) ?? 0;
      mirrored = target; // suppress the replaceState echo for this travel
      state.travelTo?.(target);
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      unsubscribe();
      window.removeEventListener("popstate", onPopState);
      window.history.scrollRestoration = previousRestoration;
    };
  }, [scrollEl, jumpTo]);

  useEffect(() => {
    if (!scrollEl) return;

    const onWheel = (e: WheelEvent) => {
      const action = backgroundWorldGesture(
        useStacks.getState(),
        isStacksScrollableTarget(e.target),
      );
      if (action === "blocked") return;
      if (isBrowserZoomWheel(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (action === "collapse-and-travel") closeStacksPanel();
      const dominant =
        Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      scrollEl.scrollLeft += wheelDeltaPx(e, dominant);
    };
    window.addEventListener("wheel", onWheel, {
      passive: false,
      capture: true,
    });

    // Touch: native pan-x handles horizontal drags (with momentum); vertical
    // swipes are re-mapped to lateral travel with a lightweight fling.
    let axis: "h" | "v" | null = null;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let flingRaf = 0;
    let ownsCollapsingGesture = false;

    const onTouchStart = (e: TouchEvent) => {
      const action = backgroundWorldGesture(
        useStacks.getState(),
        isStacksScrollableTarget(e.target),
      );
      if (action === "blocked") {
        axis = null;
        velocity = 0;
        ownsCollapsingGesture = false;
        return;
      }
      ownsCollapsingGesture = action === "collapse-and-travel";
      if (ownsCollapsingGesture) closeStacksPanel();
      const t = e.touches[0];
      if (!t) return;
      cancelAnimationFrame(flingRaf);
      axis = null;
      startX = t.clientX;
      startY = t.clientY;
      lastY = t.clientY;
      lastT = performance.now();
      velocity = 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const state = useStacks.getState();
      if (
        state.dragging ||
        state.modalOpen ||
        (!ownsCollapsingGesture && state.panelState !== "closed")
      ) {
        // Clear the pending fling as well as bailing from this frame. A prop
        // can claim the gesture after one vertical sample, and replaying that
        // stale velocity on touchend would still move the room underneath it.
        axis = null;
        velocity = 0;
        return;
      }
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!axis && Math.hypot(dx, dy) > 8) {
        axis = Math.abs(dy) > Math.abs(dx) ? "v" : "h";
      }
      if (axis !== "v" && !(ownsCollapsingGesture && axis === "h")) return;
      e.preventDefault();
      const now = performance.now();
      const step = axis === "v" ? lastY - t.clientY : startX - t.clientX; // swipe up/left = travel forward
      scrollEl.scrollLeft += step;
      if (now > lastT) velocity = (step / (now - lastT)) * 16.7;
      if (axis === "h") startX = t.clientX;
      lastY = t.clientY;
      lastT = now;
    };
    const onTouchEnd = () => {
      ownsCollapsingGesture = false;
      if ((axis !== "v" && axis !== "h") || Math.abs(velocity) < 0.5) return;
      const fling = () => {
        scrollEl.scrollLeft += velocity;
        velocity *= 0.95;
        if (Math.abs(velocity) > 0.3) flingRaf = requestAnimationFrame(fling);
      };
      flingRaf = requestAnimationFrame(fling);
    };
    scrollEl.addEventListener("touchstart", onTouchStart, { passive: true });
    scrollEl.addEventListener("touchmove", onTouchMove, { passive: false });
    scrollEl.addEventListener("touchend", onTouchEnd, { passive: true });

    const onKey = (e: KeyboardEvent) => {
      if (!shouldHandleWorldNavigationKey(e)) return;
      const state = useStacks.getState();
      if (state.modalOpen || state.panelState !== "closed") return;
      const target = e.target as HTMLElement | null;
      if (isStacksScrollableTarget(target)) return;
      const step = worldNavigationStep(e.key);
      if (step === null) return;
      e.preventDefault();
      state.travelTo?.(
        Math.min(UNIT_COUNT - 1, Math.max(0, state.activeUnit + step)),
      );
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
      scrollEl.removeEventListener("touchstart", onTouchStart);
      scrollEl.removeEventListener("touchmove", onTouchMove);
      scrollEl.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(flingRaf);
    };
  }, [scrollEl]);

  return null;
}
