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
import { GOLF_STOP_POSITION, UNIT_COUNT } from "../data";
import { haptic } from "../mobile/liveness";
import {
  type TouchTravelStop,
  touchSwipeDestination,
  touchSwipeScrollBounds,
} from "../mobile/swipeTravel";
import { authoredTravelStops } from "../mobile/travel";
import { freeRoamDiagnosticsController } from "../scene/freeRoamDiagnostics";
import { scrollLeftAfterResize } from "../scene/scrollResize";
import { scrollOffsetForUnit } from "../scene/worldLayout";
import { closeStacksPanel, touchWorldRef, useStacks } from "../store";
import { useEffect } from "react";

import { isUniversalSearchOpen } from "~/lib/universal-search/overlay";

import {
  isStacksScrollableTarget,
  shouldHandleWorldNavigationKey,
  worldNavigationStep,
  worldNavigationUnit,
} from "./roomNavigationKeys";

export {
  isStacksScrollableTarget,
  worldNavigationStep,
  worldNavigationUnit,
  isInteractiveWorldNavigationTarget,
  shouldHandleWorldNavigationKey,
} from "./roomNavigationKeys";

function wheelDeltaPx(e: WheelEvent, axisDelta: number): number {
  if (e.deltaMode === 1) return axisDelta * 33; // lines
  if (e.deltaMode === 2) return axisDelta * window.innerHeight; // pages
  return axisDelta;
}

type BridgeInteractionState = Pick<
  ReturnType<typeof useStacks.getState>,
  "dragging" | "modalOpen" | "panelState"
> & {
  visionRidePhase?: ReturnType<typeof useStacks.getState>["visionRidePhase"];
};

/** One prop/overlay gets a gesture at a time. In particular, Pointer Events
 * can hand a touch drag to a Grabbable before this Touch Events bridge sees
 * `touchmove`; continuing here would move the room underneath the prop. */
export function blocksWorldTouchTravel(state: BridgeInteractionState) {
  return (
    !!state.dragging ||
    state.modalOpen ||
    state.panelState !== "closed" ||
    (state.visionRidePhase !== undefined && state.visionRidePhase !== "idle")
  );
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

export function backgroundWorldGesture(
  state: BridgeInteractionState,
  scrollableTarget: boolean,
  universalSearchOpen = false,
): "blocked" | "collapse-and-travel" | "travel" {
  if (
    universalSearchOpen ||
    state.modalOpen ||
    state.dragging ||
    (state.visionRidePhase !== undefined && state.visionRidePhase !== "idle") ||
    scrollableTarget
  )
    return "blocked";
  if (state.panelState === "open" || state.panelState === "opening")
    return "collapse-and-travel";
  // `closing` is deliberately travel-capable: the gesture that collapsed the
  // sheet must not disappear while its 280ms visual settle finishes.
  return "travel";
}

export { shouldMirrorWorldHistory } from "./RoomNavigation";

export default function ScrollBridges() {
  const scrollEl = useStacks((s) => s.scrollEl);

  useEffect(() => {
    if (!scrollEl) return;

    const resetSelection = () => {
      const state = useStacks.getState();
      state.setFocusedInteraction(null);
      state.setPressedInteraction(null);
      state.setHovered(null);
      touchWorldRef.zoomOffset = 0;
    };
    let lastScrollLeft = scrollEl.scrollLeft;

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
        isUniversalSearchOpen(),
      );
      if (action === "blocked") return;
      if (isBrowserZoomWheel(e)) return;
      if (e.deltaX !== 0 || e.deltaY !== 0) resetSelection();
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
      // This wheel already dismissed selection. Its queued native scroll
      // event must not dismiss an object selected after the wheel finished.
      lastScrollLeft = scrollEl.scrollLeft;
    };
    window.addEventListener("wheel", onWheel, {
      passive: false,
      capture: true,
    });

    // Coarse World travel is native horizontal pan + browser momentum. The
    // browser owns the stream until it ends; then every path shares one
    // authored-stop snap. Vertical motion is intentionally untouched.
    scrollEl.style.touchAction = "pan-x";
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
      if (
        state.dragging ||
        state.modalOpen ||
        state.panelState !== "closed" ||
        state.visionRidePhase !== "idle"
      )
        return;
      if (isUniversalSearchOpen()) return;
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
        isUniversalSearchOpen(),
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
      if (scrollEl.scrollLeft !== lastScrollLeft) {
        lastScrollLeft = scrollEl.scrollLeft;
        resetSelection();
      }
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
      const direction = Number(panKeys.has("d")) - Number(panKeys.has("a"));
      const elapsed = previousPanFrame
        ? Math.min(32, now - previousPanFrame)
        : 0;
      previousPanFrame = now;
      if (
        direction !== 0 &&
        !state.modalOpen &&
        state.panelState === "closed" &&
        state.visionRidePhase === "idle" &&
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
      if (!shouldHandleWorldNavigationKey(e, isUniversalSearchOpen())) return;
      const state = useStacks.getState();
      if (
        state.modalOpen ||
        state.panelState !== "closed" ||
        state.visionRidePhase !== "idle"
      )
        return;
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
        resetSelection();
        panKeys.add(panDirection < 0 ? "a" : "d");
        if (!panFrame) panFrame = requestAnimationFrame(panWorld);
        return;
      }
      // Digits with a modifier belong to the browser (tab switching); digits
      // under a free-roam camera would travel the world out from under it.
      const unit = worldNavigationUnit(e.key);
      if (
        unit !== null &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        !freeRoamDiagnosticsController.getSnapshot().enabled
      ) {
        e.preventDefault();
        resetSelection();
        state.travelTo?.(unit);
        return;
      }
      const step = worldNavigationStep(e.key);
      if (step === null) return;
      e.preventDefault();
      resetSelection();
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
