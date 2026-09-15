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
import { openSearchFromEdge, roomEdgeMotion } from "../mobile/roomEdgeMotion";
import {
  type TouchTravelStop,
  touchSwipeDestination,
  touchSwipeScrollBounds,
} from "../mobile/swipeTravel";
import { authoredTravelStops } from "../mobile/travel";
import {
  nativeHorizontalWheelGesture,
  wheelStepGesture,
  worldWheelDelta,
} from "../mobile/wheelStepGesture";
import { freeRoamDiagnosticsController } from "../scene/freeRoamDiagnostics";
import { scrollLeftAfterResize } from "../scene/scrollResize";
import { isSeated } from "../scene/seated";
import { STACKS_MOBILE_QUERY, scrollOffsetForUnit } from "../scene/worldLayout";
import { closeStacksPanel, touchWorldRef, useStacks } from "../store";
import { useEffect } from "react";

import {
  UNIVERSAL_SEARCH_OPEN_ATTRIBUTE,
  isUniversalSearchOpen,
  onUniversalSearchSelection,
} from "~/lib/universal-search/overlay";

import {
  COARSE_TRAVEL_QUIET_MS,
  type CoarseTravelOwner,
  coarseTravelSettleDecision,
  isCurrentGeneration,
  notifyRoomTakeover,
  onRoomTakeover,
  ownsCoarseTravel,
} from "./coarseTravelOwnership";
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

    const edgeSearch = wheelStepGesture(() => openSearchFromEdge(), "world");
    const nativeWheel = nativeHorizontalWheelGesture();
    const originalOverscroll = scrollEl.style.overscrollBehaviorX;
    const onWheel = (e: WheelEvent) => {
      const nativeHorizontal =
        nativeWheel(e, scrollEl) &&
        window.matchMedia(STACKS_MOBILE_QUERY).matches;
      const action = backgroundWorldGesture(
        useStacks.getState(),
        isStacksScrollableTarget(e.target),
        isUniversalSearchOpen(),
      );
      const atSearchEdge =
        action === "travel" &&
        !isSeated() &&
        window.matchMedia(STACKS_MOBILE_QUERY).matches &&
        useStacks.getState().activeUnit === 0 &&
        worldWheelDelta(e) < 0 &&
        scrollEl.scrollLeft <= 2;
      if (action === "blocked" || isBrowserZoomWheel(e)) {
        edgeSearch(e, false);
        return;
      }
      if (e.deltaX !== 0 || e.deltaY !== 0) resetSelection();
      reconcileScrollRange();
      e.stopPropagation();
      if (action === "collapse-and-travel") closeStacksPanel();
      // A wheel or trackpad is fine-pointer intent, even in a narrow window.
      const dominant = worldWheelDelta(e);
      const delta = wheelDeltaPx(e, dominant);
      const remaining = roomEdgeMotion.consume(delta);
      const requested = scrollEl.scrollLeft + remaining;
      const clamped = Math.max(0, Math.min(scrollRange, requested));
      const overflow = requested - clamped;
      if (overflow !== 0 && !isSeated()) roomEdgeMotion.pull(-overflow);
      const searchOpened = edgeSearch(e, atSearchEdge);
      // Native travel remains in charge between stops. At the two ends the
      // camera spring supplies visible resistance for either wheel axis.
      scrollEl.style.overscrollBehaviorX = "none";
      if (
        nativeHorizontal &&
        overflow === 0 &&
        remaining === delta &&
        !searchOpened
      )
        return;
      e.preventDefault();
      scrollEl.scrollLeft = clamped;
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
    let owner: CoarseTravelOwner | null = null;
    let generationSeed = 0;
    let settleTimer = 0;
    // When the container last moved by itself. Our own corrective writes are
    // excluded, or the clamp would keep resetting the quiet it is meant to
    // prove.
    let lastScrollAt: number | null = null;
    // The browser queues the scroll event for our own corrective write, so a
    // synchronous flag is already false when it arrives. Remember what the
    // container ACTUALLY read back after the write — a bound of 101.739 reads
    // as 102, so matching the requested value misses its own echo — and scope
    // the token to the gesture that made it, or a stale token outlives its
    // gesture and swallows a later genuine event.
    let pendingCorrection: { value: number; generation: number } | null = null;
    // Set synchronously the moment anything else claims the destination.
    // Checked BEFORE the clamp, because the write that follows an explicit
    // navigation is the very next thing to arrive.
    let takenOver = false;
    // One saved settlement, for a gesture the palette interrupted. It holds the
    // destination that gesture had earned, so dismissing the palette without
    // choosing anything puts the room back on its authored stop instead of
    // leaving it wherever the swipe happened to stop. It is single-slot,
    // consumed before it writes, and dropped by a selection, an explicit
    // navigation, a new gesture or unmount.
    let pendingRestoration: {
      destination: number;
      generation: number;
      /** True when the palette's opening has not been DELIVERED to the
       * observer yet. The record is created at scrollend, which happens in DOM
       * time; the observer runs later. Counting sessions at delivery time
       * therefore drops a legitimate record the moment its own opening is
       * finally announced. Instead the record remembers that one opening is
       * still owed to it: the first delivered open is the one it was saved
       * under, and only a LATER open means the visitor started a new search. */
      ownOpenPending: boolean;
      /** When the container last moved, carried across the handover so the
       * restoration still waits for real stillness rather than firing the
       * instant the palette goes away. */
      lastScrollAt: number | null;
    } | null = null;
    /** Whether the last DELIVERED palette transition left it open. */
    let deliveredOpen = false;
    let restorationTimer = 0;
    const dropRestoration = () => {
      pendingRestoration = null;
      window.clearTimeout(restorationTimer);
    };

    const releaseCoarseTravel = () => {
      owner = null;
      lastScrollAt = null;
      takenOver = false;
      window.clearTimeout(settleTimer);
    };
    const stopTakeoverWatch = onRoomTakeover(() => {
      // Ownerless cancellation matters: a gesture that has already deferred
      // owns nothing, and its pending restoration must still be dropped.
      takenOver = true;
      dropRestoration();
      releaseCoarseTravel();
    });
    // A chosen result, destination or command action. Announced BEFORE the
    // palette closes and before it navigates, because dismissal and selection
    // both end with the marker gone and a selection whose destination never
    // reaches navigateRoom — an external href, an action — raises nothing else.
    const stopSelectionWatch = onUniversalSearchSelection(() => {
      takenOver = true;
      dropRestoration();
      releaseCoarseTravel();
    });
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
    /** Look again when the REMAINING quiet has elapsed, measured from the last
     * genuine scroll. Both re-arm sites go through here: a correction echo
     * does not move `lastScrollAt`, so scheduling a full window after one
     * would postpone the settle for motion that never happened. */
    const armSettle = () => {
      const generationNow = owner?.generation;
      const remaining =
        lastScrollAt === null
          ? COARSE_TRAVEL_QUIET_MS
          : Math.max(
              0,
              COARSE_TRAVEL_QUIET_MS - (performance.now() - lastScrollAt),
            );
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(
        () => settleTouchTravel(generationNow),
        remaining,
      );
    };
    const settleTouchTravel = (generation?: number) => {
      // A timer scheduled by a previous gesture must not settle this one.
      if (generation !== undefined && !isCurrentGeneration(owner, generation))
        return;
      const state = useStacks.getState();
      const decision = coarseTravelSettleDecision({
        owner,
        takenOver,
        blocked:
          Boolean(state.dragging) ||
          state.modalOpen ||
          state.panelState !== "closed" ||
          state.visionRidePhase !== "idle" ||
          isUniversalSearchOpen(),
        lastScrollAt,
        now: performance.now(),
      });
      if (decision === "revoke") {
        // The palette is a pause, not a cancellation: remember where this
        // gesture was going so a dismissal can put the room back. Every other
        // blocker is a genuine handover and leaves nothing behind.
        if (
          isUniversalSearchOpen() &&
          !takenOver &&
          owner &&
          lastScrollAt !== null
        ) {
          const destination = touchSwipeDestination({
            startScrollLeft: coarseStartScrollLeft,
            endScrollLeft: scrollEl.scrollLeft,
            stops: coarseTravelStops,
          });
          if (destination !== null) {
            window.clearTimeout(restorationTimer);
            pendingRestoration = {
              destination,
              generation: owner.generation,
              ownOpenPending: !deliveredOpen,
              lastScrollAt,
            };
          }
        }
        releaseCoarseTravel();
        return;
      }
      if (decision === "wait") {
        // Not still yet. Keep ownership so the clamp stays live for the rest
        // of the motion, and look again when the REMAINING quiet has elapsed.
        // Rescheduling a full window here would let a redundant scrollend, or
        // our own correction echo, push the settle further out every time one
        // arrived — the deadline must track the last real motion, not the last
        // thing that asked.
        armSettle();
        return;
      }
      releaseCoarseTravel();
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
      scrollEl.style.overscrollBehaviorX = originalOverscroll;
      // A new contact owns the container from here; anything the previous
      // gesture still had pending is its predecessor's, not this one's.
      window.clearTimeout(settleTimer);
      const action = backgroundWorldGesture(
        useStacks.getState(),
        isStacksScrollableTarget(event.target),
        isUniversalSearchOpen(),
      );
      generationSeed += 1;
      owner =
        action === "travel"
          ? { pointerId: event.pointerId, generation: generationSeed }
          : null;
      takenOver = false;
      dropRestoration();
      lastScrollAt = null;
      // pendingCorrection deliberately SURVIVES: a correction written by the
      // previous gesture may still be in flight, and it is not this one's
      // motion. It is consumed once, by whichever gesture is holding the
      // container when it lands.
      coarseStartScrollLeft = scrollEl.scrollLeft;
      coarseTravelStops = owner ? travelStops() : [];
    };
    const onPointerUp = (event: PointerEvent) => {
      if (
        event.pointerType === "touch" &&
        ownsCoarseTravel(owner, event.pointerId) &&
        Math.abs(scrollEl.scrollLeft - coarseStartScrollLeft) < 1
      )
        releaseCoarseTravel();
    };
    const onScroll = () => {
      if (scrollEl.scrollLeft !== lastScrollLeft) {
        lastScrollLeft = scrollEl.scrollLeft;
        resetSelection();
      }
      reconcileScrollRange();
      // Retire the correction token FIRST, and whether or not a gesture owns
      // the container. A token only describes an echo still in flight, so any
      // delivered position that is not it disproves it — the echo cannot
      // arrive after a later position already has. Leaving a disproved token
      // alive let a genuine scroll that happened to equal it be suppressed as
      // an echo, which released the gesture 11ms after real motion and let the
      // residual escape unclamped. Deliveries while ownerless count too: that
      // is exactly when a revoked gesture's echo lands.
      const echoed =
        pendingCorrection !== null &&
        scrollEl.scrollLeft === pendingCorrection.value;
      if (pendingCorrection !== null) pendingCorrection = null;
      // A pending restoration waits on STILLNESS, and the container does not
      // stop moving just because the palette went away. Update its clock on
      // any real motion, whoever owns the container and whether or not the
      // palette is still up — otherwise motion arriving after the dismissal
      // is invisible and the room is written into while it is still moving.
      if (pendingRestoration && !echoed)
        pendingRestoration.lastScrollAt = performance.now();
      const searchOpen = isUniversalSearchOpen();
      // The palette owns the room. Residual motion is still WATCHED, because a
      // deferred restoration must wait for it to stop, but nothing may be
      // written while the visitor is looking at the palette.
      if (searchOpen) {
        if (!echoed && owner) lastScrollAt = performance.now();
        return;
      }
      if (!owner) return;
      // A takeover outranks the clamp. Checking it here rather than at settle
      // is the whole point: the scroll that follows an explicit navigation
      // arrives before any settle could run.
      if (takenOver) {
        releaseCoarseTravel();
        return;
      }
      // Our own corrective write is not the container moving on its own.
      // Our own correction, or a predecessor's still in flight, is not motion.
      // Anything else is, including a later event that lands on the same value
      // once the token has been spent: over-counting activity only delays a
      // settle, under-counting releases the gesture early and loses the room.
      if (!echoed) lastScrollAt = performance.now();
      const bounds = touchSwipeScrollBounds({
        startScrollLeft: coarseStartScrollLeft,
        stops: coarseTravelStops,
      });
      if (bounds) {
        const bounded = Math.min(
          bounds.max,
          Math.max(bounds.min, scrollEl.scrollLeft),
        );
        if (bounded !== scrollEl.scrollLeft) {
          scrollEl.scrollLeft = bounded;
          // Readback, not the requested bound: the container rounds.
          pendingCorrection = {
            value: scrollEl.scrollLeft,
            generation: owner.generation,
          };
        }
      }
      armSettle();
    };
    scrollEl.addEventListener("pointerdown", onPointerDown, { passive: true });
    scrollEl.addEventListener("pointerup", onPointerUp, { passive: true });
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    /** Open and close only. A close means "the palette went away", never "the
     * visitor chose nothing" — selection has its own signal, which arrives
     * first and has already cleared the record by the time this runs. */
    const runRestoration = () => {
      const pending = pendingRestoration;
      if (!pending) return;
      // Still moving: the dismissal does not override stillness.
      if (pending.lastScrollAt !== null) {
        const waited = performance.now() - pending.lastScrollAt;
        if (waited < COARSE_TRAVEL_QUIET_MS) {
          window.clearTimeout(restorationTimer);
          restorationTimer = window.setTimeout(
            runRestoration,
            COARSE_TRAVEL_QUIET_MS - waited,
          );
          return;
        }
      }
      // Consume BEFORE writing, so a duplicate delivery cannot settle twice.
      dropRestoration();
      const state = useStacks.getState();
      if (
        owner ||
        isUniversalSearchOpen() ||
        state.dragging ||
        state.modalOpen ||
        state.panelState !== "closed" ||
        state.visionRidePhase !== "idle" ||
        !scrollEl.isConnected
      )
        return;
      state.setFocusedInteraction(null);
      state.travelTo?.(pending.destination);
      state.setSettledUnit(
        Number.isInteger(pending.destination) ? pending.destination : null,
      );
    };
    const paletteObserver = new MutationObserver((records) => {
      // A single batch can carry a whole close/reopen/close round trip, and
      // its final state is the only thing live reads can see. Walk the records
      // instead. The state AFTER record i is the state BEFORE record i+1,
      // which that record's oldValue gives exactly; the last record's after
      // state is the live one. No toggle is assumed.
      for (let index = 0; index < records.length; index += 1) {
        const open =
          index + 1 < records.length
            ? records[index + 1]!.oldValue !== null
            : isUniversalSearchOpen();
        deliveredOpen = open;
        if (!open) continue;
        if (pendingRestoration?.ownOpenPending) {
          // This is the opening the record was saved under, arriving late.
          pendingRestoration.ownOpenPending = false;
          continue;
        }
        // A genuinely new search. Whatever was paused belongs to the one
        // before it, and the visitor has moved on.
        dropRestoration();
      }
      if (deliveredOpen) return;
      if (!pendingRestoration) return;
      pendingRestoration.ownOpenPending = false;
      runRestoration();
    });
    paletteObserver.observe(document.documentElement, {
      attributes: true,
      // Required: the walk above reconstructs each record's after-state from
      // the NEXT record's oldValue. Without this every oldValue is null and a
      // reopen buried inside a batch reads as a close.
      attributeOldValue: true,
      attributeFilter: [UNIVERSAL_SEARCH_OPEN_ATTRIBUTE],
    });

    const onScrollEnd = () => settleTouchTravel();
    scrollEl.addEventListener("scrollend", onScrollEnd);

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
        // A digit jump is an explicit destination and does NOT route through
        // navigateRoom, so it has to announce the takeover itself.
        notifyRoomTakeover();
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
      notifyRoomTakeover();
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
      scrollEl.style.overscrollBehaviorX = originalOverscroll;
      window.removeEventListener("wheel", onWheel, { capture: true });
      scrollEl.removeEventListener("pointerdown", onPointerDown);
      scrollEl.removeEventListener("pointerup", onPointerUp);
      scrollEl.removeEventListener("scroll", onScroll);
      scrollEl.removeEventListener("scrollend", onScrollEnd);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearPanKeys);
      clearPanKeys();
      window.clearTimeout(settleTimer);
      dropRestoration();
      paletteObserver.disconnect();
      stopTakeoverWatch();
      stopSelectionWatch();
    };
  }, [scrollEl]);

  return null;
}
