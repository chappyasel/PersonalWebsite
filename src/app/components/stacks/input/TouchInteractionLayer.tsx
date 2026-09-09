"use client";

import { GOLF_STOP_POSITION, UNIT_COUNT } from "../data";
import {
  TOUCH_PICKUP_MS,
  type TouchGestureEffect,
  type TouchGestureState,
  reduceTouchGesture,
} from "../mobile/gesture";
import { expandAndClipTouchHalo, resolveTouchHalo } from "../mobile/halos";
import { haptic } from "../mobile/liveness";
import {
  touchSwipeDestination,
  touchSwipeScrollBounds,
} from "../mobile/swipeTravel";
import {
  authoredTravelStops,
  isAtAuthoredTravelStop,
  shouldSettleInterruptedTravel,
  worldZoomFromPinch,
  worldZoomFromVerticalDrag,
} from "../mobile/travel";
import { isHittableBall, tapHittableBall } from "../scene/golf/hittableBalls";
import { projectedInteractionBounds } from "../scene/interactionProjection";
import {
  getSceneInteraction,
  runSceneInteractionActivation,
} from "../scene/interactionRegistry";
import { isSeated, leaveSeat } from "../scene/seated";
import { scrollOffsetForUnit } from "../scene/worldLayout";
import { progressRef, touchWorldRef, useStacks } from "../store";
import { useEffect, useRef } from "react";

function activeSheetTop() {
  const sheet = document.querySelector<HTMLElement>(
    "[data-stacks-mobile-panel][data-stacks-panel]",
  );
  if (!sheet || sheet.dataset.sheet === "dismissed") return window.innerHeight;
  return Math.min(window.innerHeight, sheet.getBoundingClientRect().top);
}

function nearestStopForElement(element: HTMLElement) {
  const max = Math.max(1, element.scrollWidth - element.clientWidth);
  const offset = element.scrollLeft / max;
  let best = 0;
  let distance = Infinity;
  for (const unit of authoredTravelStops(UNIT_COUNT, [GOLF_STOP_POSITION])) {
    const candidate = scrollOffsetForUnit(unit);
    const next = Math.abs(candidate - offset);
    if (next < distance) {
      distance = next;
      best = unit;
    }
  }
  return best;
}

type TrackedTouch = Readonly<{ x: number; y: number }>;

function touchSpan(a: TrackedTouch, b: TrackedTouch) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The one coarse-pointer arbiter over the exposed World. It owns no visual
 * geometry and installs one capture path, leaving fine-pointer r3f handlers
 * intact and leaving native page behavior outside the World untouched. */
export default function TouchInteractionLayer() {
  const gesture = useRef<TouchGestureState>({ phase: "idle" });
  const pickupTimer = useRef<number | null>(null);
  const inertiaFrame = useRef<number | null>(null);
  const latestEvent = useRef<PointerEvent | null>(null);
  const touchPoints = useRef(new Map<number, TrackedTouch>());
  const depthGesture = useRef<{
    interactionId: string;
    primaryPointerId: number;
    secondaryPointerId: number;
  } | null>(null);
  const worldPinch = useRef<{
    primaryPointerId: number;
    secondaryPointerId: number;
    initialSpan: number;
    initialZoom: number;
  } | null>(null);
  const backgroundGesture = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startZoom: number;
    mode: "pending" | "pinch" | "zoom" | "travel";
  } | null>(null);

  useEffect(() => {
    // Captured once for the cleanup below: the ref's Map identity is stable
    // for the component's life, but reading `.current` from cleanup is what
    // react-hooks/exhaustive-deps flags.
    const points = touchPoints.current;
    const clearPickup = () => {
      if (pickupTimer.current !== null)
        window.clearTimeout(pickupTimer.current);
      pickupTimer.current = null;
    };
    const stopInertia = (reason: "new-contact" | "cleanup") => {
      const shouldSettle = shouldSettleInterruptedTravel(
        inertiaFrame.current,
        useStacks.getState().settledUnit,
        isAtAuthoredTravelStop(
          progressRef.current * (UNIT_COUNT - 1),
          UNIT_COUNT,
          [GOLF_STOP_POSITION],
        ),
        reason,
      );
      if (inertiaFrame.current !== null)
        cancelAnimationFrame(inertiaFrame.current);
      inertiaFrame.current = null;
      return shouldSettle;
    };
    const restoreTravel = () => {
      const element = useStacks.getState().scrollEl;
      if (element && !useStacks.getState().dragging) {
        element.style.touchAction = "pan-x";
        element.style.overflowX = "auto";
      }
    };
    const finishDepthGesture = () => {
      const active = depthGesture.current;
      if (!active) return;
      getSceneInteraction(
        active.interactionId,
      )?.movableController?.endDepthGesture();
      depthGesture.current = null;
    };
    const startDepthGesture = (
      interactionId: string,
      primaryPointerId: number,
      secondaryPointerId: number,
    ) => {
      if (depthGesture.current) return;
      const primary = touchPoints.current.get(primaryPointerId);
      const secondary = touchPoints.current.get(secondaryPointerId);
      const controller = getSceneInteraction(interactionId)?.movableController;
      if (!primary || !secondary || !controller) return;
      depthGesture.current = {
        interactionId,
        primaryPointerId,
        secondaryPointerId,
      };
      controller.startDepthGesture(touchSpan(primary, secondary));
      haptic(6);
    };
    const updateDepthGesture = () => {
      const active = depthGesture.current;
      if (!active) return;
      const primary = touchPoints.current.get(active.primaryPointerId);
      const secondary = touchPoints.current.get(active.secondaryPointerId);
      if (!primary || !secondary) return;
      getSceneInteraction(
        active.interactionId,
      )?.movableController?.moveDepthGesture(touchSpan(primary, secondary));
    };
    const finishWorldPinch = () => {
      const active = worldPinch.current;
      if (!active) return;
      worldPinch.current = null;
      const primary = touchPoints.current.get(active.primaryPointerId);
      if (primary)
        backgroundGesture.current = {
          pointerId: active.primaryPointerId,
          startX: primary.x,
          startY: primary.y,
          startZoom: touchWorldRef.zoomOffset,
          mode: "pending",
        };
      else backgroundGesture.current = null;
    };
    const startWorldPinch = (
      primaryPointerId: number,
      secondaryPointerId: number,
    ) => {
      if (worldPinch.current) return;
      const primary = touchPoints.current.get(primaryPointerId);
      const secondary = touchPoints.current.get(secondaryPointerId);
      if (!primary || !secondary) return;
      const initialSpan = touchSpan(primary, secondary);
      worldPinch.current = {
        primaryPointerId,
        secondaryPointerId,
        initialSpan,
        initialZoom: touchWorldRef.zoomOffset,
      };
      if (backgroundGesture.current) backgroundGesture.current.mode = "pinch";
      haptic(6);
    };
    const updateWorldPinch = () => {
      const active = worldPinch.current;
      if (!active) return;
      const primary = touchPoints.current.get(active.primaryPointerId);
      const secondary = touchPoints.current.get(active.secondaryPointerId);
      if (!primary || !secondary) return;
      touchWorldRef.zoomOffset = worldZoomFromPinch(
        active.initialZoom,
        active.initialSpan,
        touchSpan(primary, secondary),
      );
    };
    const settle = (userInitiated: boolean, swipeStartScrollLeft?: number) => {
      const state = useStacks.getState();
      const element = state.scrollEl;
      if (!element || !state.travelTo) return;
      let unit = nearestStopForElement(element);
      if (swipeStartScrollLeft !== undefined) {
        const max = Math.max(1, element.scrollWidth - element.clientWidth);
        unit =
          touchSwipeDestination({
            startScrollLeft: swipeStartScrollLeft,
            endScrollLeft: element.scrollLeft,
            stops: authoredTravelStops(UNIT_COUNT, [GOLF_STOP_POSITION]).map(
              (position) => ({
                position,
                scrollLeft: scrollOffsetForUnit(position) * max,
              }),
            ),
          }) ?? unit;
      }
      state.setFocusedInteraction(null);
      state.travelTo(unit);
      if (userInitiated) haptic(8);
    };
    const runEffects = (effects: TouchGestureEffect[], event: PointerEvent) => {
      const store = useStacks.getState();
      for (const effect of effects) {
        const spec =
          "interactionId" in effect
            ? getSceneInteraction(effect.interactionId ?? null)
            : null;
        switch (effect.type) {
          case "compress":
            store.setPressedInteraction(effect.interactionId);
            break;
          case "drag-intent":
            // The prop takes the pointer stream from here (the globe's drag
            // listens on window until the finger lifts). Release the press
            // so nothing stays compressed under a turn, and forget the hold
            // so it cannot become a pickup mid-drag.
            clearPickup();
            store.setPressedInteraction(null);
            spec?.dragIntent?.();
            break;
          case "focus":
            clearPickup();
            spec?.movableController?.cancel(event);
            store.setPressedInteraction(null);
            store.setFocusedInteraction(effect.interactionId);
            restoreTravel();
            break;
          case "activate":
            clearPickup();
            spec?.movableController?.cancel(event);
            store.setPressedInteraction(null);
            // Same order as Grabbable's window dispatcher: the registry
            // answers for registered activations; a bare hittable ball's tap
            // belongs to the bay. A declined tap (the ball is not teed)
            // degrades to Touch Focus, so a shelf ball still answers its
            // first touch instead of going dead.
            if (
              !runSceneInteractionActivation(effect.interactionId) &&
              !tapHittableBall(effect.interactionId)
            ) {
              store.setFocusedInteraction(effect.interactionId);
              restoreTravel();
            }
            break;
          case "pickup":
            clearPickup();
            store.setPressedInteraction(null);
            store.setFocusedInteraction(effect.interactionId);
            spec?.movableController?.pickup(event);
            for (const secondaryPointerId of touchPoints.current.keys()) {
              if (secondaryPointerId === event.pointerId) continue;
              startDepthGesture(
                effect.interactionId,
                event.pointerId,
                secondaryPointerId,
              );
              break;
            }
            haptic(12);
            break;
          case "carry-move":
            spec?.movableController?.move(event);
            break;
          case "carry-release":
            finishDepthGesture();
            spec?.movableController?.release(event, 0.55, 2.5);
            restoreTravel();
            break;
          case "clear-focus":
            if (store.focusedInteraction === effect.interactionId)
              store.setFocusedInteraction(null);
            break;
          case "swipe-start": {
            clearPickup();
            spec?.movableController?.cancel(event);
            store.setPressedInteraction(null);
            store.setFocusedInteraction(null);
            const element = store.scrollEl;
            if (element) element.scrollLeft -= effect.displacementX;
            break;
          }
          case "swipe-move":
            if (store.scrollEl) store.scrollEl.scrollLeft -= effect.deltaX;
            break;
          case "swipe-release": {
            clearPickup();
            let velocity = -effect.velocityX * 16.7;
            let frames = 0;
            const element = store.scrollEl;
            const swipeStartScrollLeft = element
              ? element.scrollLeft + effect.displacementX
              : undefined;
            const swipeBounds =
              element && swipeStartScrollLeft !== undefined
                ? touchSwipeScrollBounds({
                    startScrollLeft: swipeStartScrollLeft,
                    stops: authoredTravelStops(UNIT_COUNT, [
                      GOLF_STOP_POSITION,
                    ]).map((position) => ({
                      position,
                      scrollLeft:
                        scrollOffsetForUnit(position) *
                        Math.max(1, element.scrollWidth - element.clientWidth),
                    })),
                  })
                : null;
            if (!element || Math.abs(velocity) < 0.25) {
              settle(true, swipeStartScrollLeft);
              restoreTravel();
              break;
            }
            const coast = () => {
              frames += 1;
              element.scrollLeft += velocity;
              if (swipeBounds) {
                const bounded = Math.min(
                  swipeBounds.max,
                  Math.max(swipeBounds.min, element.scrollLeft),
                );
                if (bounded !== element.scrollLeft) {
                  element.scrollLeft = bounded;
                  velocity = 0;
                }
              }
              velocity *= 0.9;
              if (Math.abs(velocity) > 0.25 && frames < 90) {
                inertiaFrame.current = requestAnimationFrame(coast);
              } else {
                inertiaFrame.current = null;
                settle(true, swipeStartScrollLeft);
                restoreTravel();
              }
            };
            inertiaFrame.current = requestAnimationFrame(coast);
            break;
          }
          case "cancel":
            clearPickup();
            finishDepthGesture();
            store.setPressedInteraction(null);
            if (effect.interactionId)
              getSceneInteraction(
                effect.interactionId,
              )?.movableController?.cancel(event);
            restoreTravel();
            break;
        }
      }
    };
    const reduce = (
      event: Parameters<typeof reduceTouchGesture>[1],
      native: PointerEvent,
    ) => {
      const reduction = reduceTouchGesture(gesture.current, event);
      gesture.current = reduction.state;
      runEffects(reduction.effects, native);
    };
    const exposedWorldContact = (
      target: EventTarget | null,
      clientY: number,
    ) => {
      const element = useStacks.getState().scrollEl;
      return Boolean(
        element &&
          target instanceof Node &&
          element.contains(target) &&
          clientY < activeSheetTop(),
      );
    };
    const exposedWorldEvent = (event: PointerEvent) =>
      exposedWorldContact(event.target, event.clientY);
    const touchHitAt = (x: number, y: number) => {
      const bounds = projectedInteractionBounds({ x, y })
        .map((bounds) =>
          expandAndClipTouchHalo(bounds, {
            width: window.innerWidth,
            height: window.innerHeight,
            sheetTop: activeSheetTop(),
          }),
        )
        .filter((bounds) => bounds !== null);
      return resolveTouchHalo(x, y, bounds);
    };
    const publishWake = (event: PointerEvent) => {
      touchWorldRef.pointerX =
        (event.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      touchWorldRef.pointerY =
        -(event.clientY / Math.max(1, window.innerHeight)) * 2 + 1;
      touchWorldRef.clientX = event.clientX;
      touchWorldRef.clientY = event.clientY;
      touchWorldRef.wakeStrength = 1;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || event.button !== 0) return;
      touchPoints.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (!event.isPrimary) {
        const current = gesture.current;
        if (
          current.phase === "carrying" &&
          exposedWorldEvent(event) &&
          !depthGesture.current
        ) {
          event.preventDefault();
          event.stopPropagation();
          useStacks.getState().scrollEl?.setPointerCapture?.(event.pointerId);
          startDepthGesture(
            current.interactionId,
            current.pointerId,
            event.pointerId,
          );
        } else if (
          current.phase === "idle" &&
          backgroundGesture.current &&
          exposedWorldEvent(event) &&
          !worldPinch.current
        ) {
          event.preventDefault();
          event.stopPropagation();
          const primaryPointerId = backgroundGesture.current.pointerId;
          const element = useStacks.getState().scrollEl;
          element?.setPointerCapture?.(primaryPointerId);
          element?.setPointerCapture?.(event.pointerId);
          startWorldPinch(primaryPointerId, event.pointerId);
        }
        return;
      }
      // Camera zoom must not depend on CameraRig's separate pointer listener
      // having mounted first. This arbiter owns the accepted touch contact.
      touchWorldRef.interactionPointerType = "touch";
      const settleInterruptedTravel = stopInertia("new-contact");
      if (settleInterruptedTravel) settle(false);
      latestEvent.current = event;
      const store = useStacks.getState();
      const exposed = exposedWorldEvent(event);
      if (
        !exposed ||
        store.modalOpen ||
        store.panelState !== "closed" ||
        store.visionRidePhase !== "idle"
      )
        return;
      if (isSeated()) {
        clearPickup();
        backgroundGesture.current = null;
        store.setFocusedInteraction(null);
        store.setPressedInteraction(null);
        leaveSeat();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      publishWake(event);
      touchWorldRef.meadowPulseRevision += 1;
      const hit = touchHitAt(event.clientX, event.clientY);
      if (!hit) {
        store.setFocusedInteraction(null);
        backgroundGesture.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startZoom: touchWorldRef.zoomOffset,
          mode: "pending",
        };
        return;
      }
      backgroundGesture.current = null;
      const spec = getSceneInteraction(hit.id);
      if (!spec) return;
      event.stopPropagation();
      const controllerAccepted = spec.movableController?.press(event) ?? true;
      if (!controllerAccepted) return;
      store.scrollEl?.setPointerCapture?.(event.pointerId);
      reduce(
        {
          type: "press",
          interactionId: hit.id,
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          at: performance.now(),
          wasFocused: store.focusedInteraction === hit.id,
          movable: Boolean(spec.movableController),
          activatable: Boolean(spec.activation) || isHittableBall(hit.id),
          activateOnFirstTouch: Boolean(spec.activateOnFirstTouch),
          dragIntent: Boolean(spec.dragIntent) && !spec.movableController,
        },
        event,
      );
      clearPickup();
      pickupTimer.current = window.setTimeout(() => {
        const latest = latestEvent.current ?? event;
        reduce({ type: "pickup", pointerId: event.pointerId }, latest);
      }, TOUCH_PICKUP_MS);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      touchPoints.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      const activeDepth = depthGesture.current;
      if (
        activeDepth &&
        (event.pointerId === activeDepth.primaryPointerId ||
          event.pointerId === activeDepth.secondaryPointerId)
      ) {
        event.preventDefault();
        updateDepthGesture();
        if (event.pointerId === activeDepth.secondaryPointerId) return;
      }
      const activeWorldPinch = worldPinch.current;
      if (
        activeWorldPinch &&
        (event.pointerId === activeWorldPinch.primaryPointerId ||
          event.pointerId === activeWorldPinch.secondaryPointerId)
      ) {
        event.preventDefault();
        updateWorldPinch();
        return;
      }
      if (!event.isPrimary) return;
      latestEvent.current = event;
      if (exposedWorldEvent(event)) publishWake(event);
      if (gesture.current.phase === "idle") {
        const background = backgroundGesture.current;
        if (background?.pointerId !== event.pointerId) return;
        const dx = event.clientX - background.startX;
        const dy = event.clientY - background.startY;
        if (background.mode === "pending") {
          if (Math.hypot(dx, dy) <= 8) return;
          background.mode =
            Math.abs(dy) > Math.abs(dx) * 1.15 ? "zoom" : "travel";
        }
        if (background.mode !== "zoom") return;
        event.preventDefault();
        touchWorldRef.zoomOffset = worldZoomFromVerticalDrag(
          background.startZoom,
          dy,
        );
        return;
      }
      event.preventDefault();
      reduce(
        {
          type: "move",
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          at: performance.now(),
        },
        event,
      );
    };
    const onTouchStart = (event: TouchEvent) => {
      if (!event.cancelable) return;
      if (
        gesture.current.phase === "pressing" ||
        gesture.current.phase === "carrying"
      ) {
        event.preventDefault();
        return;
      }
      if (event.touches.length >= 2 && backgroundGesture.current) {
        event.preventDefault();
        return;
      }
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch || !exposedWorldContact(event.target, touch.clientY)) return;
      const store = useStacks.getState();
      if (store.modalOpen || store.panelState !== "closed") return;
      if (!touchHitAt(touch.clientX, touch.clientY)) return;

      // `touch-action` is locked before pointerdown handlers run. Cancel the
      // legacy touch default at gesture start only inside a live Touch Halo,
      // so the browser cannot replace this carry with a native horizontal pan.
      // Background World travel remains native. Pinch is reserved for prop
      // depth, so the browser cannot replace a carry with viewport zoom.
      event.preventDefault();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      const activeDepth = depthGesture.current;
      if (!event.isPrimary) {
        if (activeDepth?.secondaryPointerId === event.pointerId)
          finishDepthGesture();
        if (worldPinch.current?.secondaryPointerId === event.pointerId)
          finishWorldPinch();
        touchPoints.current.delete(event.pointerId);
        return;
      }
      if (activeDepth?.primaryPointerId === event.pointerId)
        finishDepthGesture();
      if (worldPinch.current?.primaryPointerId === event.pointerId)
        finishWorldPinch();
      touchPoints.current.delete(event.pointerId);
      clearPickup();
      if (backgroundGesture.current?.pointerId === event.pointerId)
        backgroundGesture.current = null;
      reduce({ type: "release", pointerId: event.pointerId }, event);
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      const activeDepth = depthGesture.current;
      if (!event.isPrimary) {
        if (activeDepth?.secondaryPointerId === event.pointerId)
          finishDepthGesture();
        if (worldPinch.current?.secondaryPointerId === event.pointerId)
          finishWorldPinch();
        touchPoints.current.delete(event.pointerId);
        return;
      }
      if (activeDepth?.primaryPointerId === event.pointerId)
        finishDepthGesture();
      if (worldPinch.current?.primaryPointerId === event.pointerId)
        finishWorldPinch();
      touchPoints.current.delete(event.pointerId);
      clearPickup();
      if (backgroundGesture.current?.pointerId === event.pointerId)
        backgroundGesture.current = null;
      reduce({ type: "cancel", pointerId: event.pointerId }, event);
    };
    const clearFocusForContextChange = () => {
      const store = useStacks.getState();
      store.setFocusedInteraction(null);
      store.setPressedInteraction(null);
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointermove", onPointerMove, {
      capture: true,
      passive: false,
    });
    window.addEventListener("pointerup", onPointerUp, { capture: true });
    window.addEventListener("pointercancel", onPointerCancel, {
      capture: true,
    });
    window.addEventListener("lostpointercapture", onPointerCancel, {
      capture: true,
    });
    window.addEventListener("touchstart", onTouchStart, {
      capture: true,
      passive: false,
    });
    window.addEventListener("resize", clearFocusForContextChange);
    window.addEventListener("orientationchange", clearFocusForContextChange);
    const unsubscribe = useStacks.subscribe((state, previous) => {
      if (
        state.activeUnit !== previous.activeUnit ||
        state.unitMapPreview !== previous.unitMapPreview ||
        (state.seated && !previous.seated)
      )
        state.setFocusedInteraction(null);
    });
    return () => {
      clearPickup();
      finishDepthGesture();
      finishWorldPinch();
      points.clear();
      stopInertia("cleanup");
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      window.removeEventListener("pointermove", onPointerMove, {
        capture: true,
      });
      window.removeEventListener("pointerup", onPointerUp, { capture: true });
      window.removeEventListener("pointercancel", onPointerCancel, {
        capture: true,
      });
      window.removeEventListener("lostpointercapture", onPointerCancel, {
        capture: true,
      });
      window.removeEventListener("touchstart", onTouchStart, {
        capture: true,
      });
      window.removeEventListener("resize", clearFocusForContextChange);
      window.removeEventListener(
        "orientationchange",
        clearFocusForContextChange,
      );
      unsubscribe();
    };
  }, []);

  return (
    <div
      aria-hidden
      data-stacks-touch-layer
      className="pointer-events-none fixed inset-0 z-20"
    />
  );
}
