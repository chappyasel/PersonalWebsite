"use client";

// Input bridges for the horizontal world. Vertical wheel/trackpad and vertical
// touch swipes translate into lateral travel on drei's real scroll container;
// keyboard arrows hop one unit while A/D pan continuously. All bridges
// suspend while the book modal is
// open or when the pointer is inside an opted-in scrollable region
// ([data-stacks-scrollable] — placard panels).
//
// The wheel listener runs window-level in the CAPTURE phase and stops
// propagation: drei's ScrollControls attaches its own passive wheel handler
// (scrollLeft += deltaY / 2) on the scroll element, and letting both run would
// double-apply deltas at inconsistent rates.
import {
  GOLF_STOP_POSITION,
  UNIT_COUNT,
  golfFocusedForScenePosition,
  initialScenePositionFromLocation,
  scenePositionFromHash,
  sceneUrlForLocation,
} from "../data";
import { haptic } from "../mobile/liveness";
import { freeRoamDiagnosticsController } from "../scene/freeRoamDiagnostics";
import {
  type TouchTravelStop,
  touchSwipeDestination,
  touchSwipeScrollBounds,
} from "../mobile/swipeTravel";
import { authoredTravelStops } from "../mobile/travel";
import { scrollLeftAfterResize } from "../scene/scrollResize";
import { scrollOffsetForUnit } from "../scene/worldLayout";
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

/** A/D follow the same left/right convention as free-roam controls, but pan
 * the authored world while free roam is inactive. Unlike arrows, these keys
 * remain continuous for as long as they are held. */
export function worldPanDirection(key: string): -1 | 1 | null {
  const normalized = key.toLowerCase();
  if (normalized === "d") return 1;
  if (normalized === "a") return -1;
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

export function shouldMirrorWorldHistory(
  state: Pick<
    ReturnType<typeof useStacks.getState>,
    "modalOpen" | "panelState" | "unitMapPreview"
  >,
) {
  return (
    !state.modalOpen &&
    state.panelState === "closed" &&
    state.unitMapPreview === null
  );
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
      const target = initialScenePositionFromLocation(
        window.location.pathname,
        window.location.hash,
      );
      if (target > 0) jumpTo(target);
      // Accepted legacy aliases are read-compatible, then immediately
      // canonicalized so a centered golf stop always exposes #golf for copy,
      // refresh, and subsequent history entries.
      if (scenePositionFromHash(window.location.hash) !== null) {
        const canonical = sceneUrlForLocation(
          window.location.pathname,
          window.location.search,
          Math.round(target),
          golfFocusedForScenePosition(target),
        );
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (current !== canonical)
          window.history.replaceState(null, "", canonical);
      }
    }

    // Mirror travel into the URL — at most one replaceState per unit change.
    let mirrored = {
      activeUnit: useStacks.getState().activeUnit,
      golfFocused: useStacks.getState().golfFocused,
    };
    const unsubscribe = useStacks.subscribe((state) => {
      if (
        state.activeUnit === mirrored.activeUnit &&
        state.golfFocused === mirrored.golfFocused
      )
        return;
      mirrored = {
        activeUnit: state.activeUnit,
        golfFocused: state.golfFocused,
      };
      if (!shouldMirrorWorldHistory(state)) return;
      window.history.replaceState(
        null,
        "",
        sceneUrlForLocation(
          window.location.pathname,
          window.location.search,
          mirrored.activeUnit,
          mirrored.golfFocused,
        ),
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
      const target = initialScenePositionFromLocation(
        window.location.pathname,
        window.location.hash,
      );
      mirrored = {
        activeUnit: Math.round(target),
        golfFocused: golfFocusedForScenePosition(target),
      }; // suppress the replaceState echo for this travel
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

    let scrollRange = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth);
    let preservedOffset =
      scrollRange > 0 ? scrollEl.scrollLeft / scrollRange : 0;
    const reconcileScrollRange = () => {
      const nextScrollRange = Math.max(
        0,
        scrollEl.scrollWidth - scrollEl.clientWidth,
      );
      if (
        scrollRange > 0 &&
        nextScrollRange > 0 &&
        nextScrollRange !== scrollRange
      ) {
        scrollEl.scrollLeft = scrollLeftAfterResize({
          scrollLeft: preservedOffset * scrollRange,
          scrollRange,
          nextScrollRange,
        });
      }
      scrollRange = nextScrollRange;
      preservedOffset =
        scrollRange > 0
          ? Math.min(1, Math.max(0, scrollEl.scrollLeft / scrollRange))
          : 0;
    };

    const onWheel = (e: WheelEvent) => {
      const action = backgroundWorldGesture(
        useStacks.getState(),
        isStacksScrollableTarget(e.target),
      );
      if (action === "blocked") return;
      if (isBrowserZoomWheel(e)) return;
      reconcileScrollRange();
      e.preventDefault();
      e.stopPropagation();
      if (action === "collapse-and-travel") closeStacksPanel();
      // A wheel or trackpad is fine-pointer intent even in a narrow window.
      // Touch inspection zoom is owned by TouchInteractionLayer's vertical
      // pointer drag; routing width-sized wheel events into that path made a
      // narrow desktop window impossible to travel.
      const dominant =
        Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      scrollEl.scrollLeft += wheelDeltaPx(e, dominant);
    };
    window.addEventListener("wheel", onWheel, {
      passive: false,
      capture: true,
    });

    // Coarse World travel is native horizontal pan + browser momentum. The
    // browser owns the stream until it ends; then every path shares one
    // authored-stop snap. Vertical motion is intentionally untouched.
    scrollEl.style.touchAction = "pan-x pinch-zoom";
    let coarseTravel = false;
    let settleTimer = 0;
    let coarseTravelStops: TouchTravelStop[] = [];
    const travelStops = () => {
      const max = Math.max(1, scrollEl.scrollWidth - scrollEl.clientWidth);
      return authoredTravelStops(UNIT_COUNT, [GOLF_STOP_POSITION]).map(
        (position) => ({
          position,
          scrollLeft: scrollOffsetForUnit(position) * max,
        }),
      );
    };
    const settleTouchTravel = () => {
      if (!coarseTravel) return;
      coarseTravel = false;
      window.clearTimeout(settleTimer);
      const state = useStacks.getState();
      if (state.dragging || state.modalOpen || state.panelState !== "closed")
        return;
      const destination = touchSwipeDestination({
        startScrollLeft: coarseStartScrollLeft,
        endScrollLeft: scrollEl.scrollLeft,
        stops: coarseTravelStops,
      });
      if (destination === null) return;
      state.setFocusedInteraction(null);
      state.travelTo?.(destination);
      state.setSettledUnit(Number.isInteger(destination) ? destination : null);
      haptic(8);
    };
    let coarseStartScrollLeft = 0;
    const onPointerDown = (event: PointerEvent) => {
      reconcileScrollRange();
      if (event.pointerType !== "touch") return;
      const action = backgroundWorldGesture(
        useStacks.getState(),
        isStacksScrollableTarget(event.target),
      );
      coarseTravel = action === "travel";
      coarseStartScrollLeft = scrollEl.scrollLeft;
      coarseTravelStops = coarseTravel ? travelStops() : [];
    };
    const onPointerUp = (event: PointerEvent) => {
      if (
        event.pointerType === "touch" &&
        coarseTravel &&
        Math.abs(scrollEl.scrollLeft - coarseStartScrollLeft) < 1
      )
        coarseTravel = false;
    };
    const onScroll = () => {
      reconcileScrollRange();
      if (!coarseTravel) return;
      const bounds = touchSwipeScrollBounds({
        startScrollLeft: coarseStartScrollLeft,
        stops: coarseTravelStops,
      });
      if (bounds) {
        const bounded = Math.min(
          bounds.max,
          Math.max(bounds.min, scrollEl.scrollLeft),
        );
        if (bounded !== scrollEl.scrollLeft) scrollEl.scrollLeft = bounded;
      }
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settleTouchTravel, 120);
    };
    scrollEl.addEventListener("pointerdown", onPointerDown, { passive: true });
    scrollEl.addEventListener("pointerup", onPointerUp, { passive: true });
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    scrollEl.addEventListener("scrollend", settleTouchTravel);

    const panKeys = new Set<"a" | "d">();
    let panFrame = 0;
    let previousPanFrame = 0;
    const clearPanKeys = () => {
      panKeys.clear();
      previousPanFrame = 0;
      if (panFrame) cancelAnimationFrame(panFrame);
      panFrame = 0;
    };
    const panWorld = (now: number) => {
      const state = useStacks.getState();
      const direction =
        Number(panKeys.has("d")) - Number(panKeys.has("a"));
      const elapsed = previousPanFrame
        ? Math.min(32, now - previousPanFrame)
        : 0;
      previousPanFrame = now;
      if (
        direction !== 0 &&
        !state.modalOpen &&
        state.panelState === "closed" &&
        !freeRoamDiagnosticsController.getSnapshot().enabled
      ) {
        reconcileScrollRange();
        // Roughly one shelf per second. ScrollControls supplies the camera's
        // damping while this changes the real horizontal scroll position.
        scrollEl.scrollLeft +=
          direction * scrollEl.clientWidth * 0.85 * (elapsed / 1_000);
      }
      panFrame = requestAnimationFrame(panWorld);
    };

    const onKey = (e: KeyboardEvent) => {
      if (!shouldHandleWorldNavigationKey(e)) return;
      const state = useStacks.getState();
      if (state.modalOpen || state.panelState !== "closed") return;
      const target = e.target as HTMLElement | null;
      if (isStacksScrollableTarget(target)) return;
      const panDirection = worldPanDirection(e.key);
      // A and D belong to the free-roam camera while it owns the view; the
      // authored traverse must not pan underneath it.
      if (
        panDirection !== null &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !freeRoamDiagnosticsController.getSnapshot().enabled
      ) {
        e.preventDefault();
        panKeys.add(panDirection < 0 ? "a" : "d");
        if (!panFrame) panFrame = requestAnimationFrame(panWorld);
        return;
      }
      const step = worldNavigationStep(e.key);
      if (step === null) return;
      e.preventDefault();
      const destination = state.golfFocused
        ? step < 0
          ? 1
          : 2
        : Math.min(UNIT_COUNT - 1, Math.max(0, state.activeUnit + step));
      state.travelTo?.(destination);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const direction = worldPanDirection(e.key);
      if (direction === null) return;
      panKeys.delete(direction < 0 ? "a" : "d");
      if (panKeys.size === 0) clearPanKeys();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearPanKeys);

    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
      scrollEl.removeEventListener("pointerdown", onPointerDown);
      scrollEl.removeEventListener("pointerup", onPointerUp);
      scrollEl.removeEventListener("scroll", onScroll);
      scrollEl.removeEventListener("scrollend", settleTouchTravel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearPanKeys);
      clearPanKeys();
      window.clearTimeout(settleTimer);
    };
  }, [scrollEl]);

  return null;
}
