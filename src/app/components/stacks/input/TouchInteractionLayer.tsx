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
  authoredTravelStops,
  worldZoomFromVerticalDrag,
} from "../mobile/travel";
import { projectedInteractionBounds } from "../scene/interactionProjection";
import {
  getSceneInteraction,
  runSceneInteractionActivation,
} from "../scene/interactionRegistry";
import { scrollOffsetForUnit } from "../scene/worldLayout";
import { touchWorldRef, useStacks } from "../store";
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

/** The one coarse-pointer arbiter over the exposed World. It owns no visual
 * geometry and installs one capture path, leaving fine-pointer r3f handlers
 * and native page/zoom behavior outside localized interaction Halos intact. */
export default function TouchInteractionLayer() {
  const gesture = useRef<TouchGestureState>({ phase: "idle" });
  const pickupTimer = useRef<number | null>(null);
  const inertiaFrame = useRef<number | null>(null);
  const latestEvent = useRef<PointerEvent | null>(null);
  const backgroundGesture = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startZoom: number;
    mode: "pending" | "zoom" | "travel";
  } | null>(null);

  useEffect(() => {
    const clearPickup = () => {
      if (pickupTimer.current !== null)
        window.clearTimeout(pickupTimer.current);
      pickupTimer.current = null;
    };
    const stopInertia = () => {
      if (inertiaFrame.current !== null)
        cancelAnimationFrame(inertiaFrame.current);
      inertiaFrame.current = null;
    };
    const restoreTravel = () => {
      const element = useStacks.getState().scrollEl;
      if (element && !useStacks.getState().dragging) {
        element.style.touchAction = "pan-x pinch-zoom";
        element.style.overflowX = "auto";
      }
    };
    const settle = (userInitiated: boolean) => {
      const state = useStacks.getState();
      const element = state.scrollEl;
      if (!element || !state.travelTo) return;
      const unit = nearestStopForElement(element);
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
            runSceneInteractionActivation(effect.interactionId);
            break;
          case "pickup":
            clearPickup();
            store.setPressedInteraction(null);
            store.setFocusedInteraction(effect.interactionId);
            spec?.movableController?.pickup(event);
            haptic(12);
            break;
          case "carry-move":
            spec?.movableController?.move(event);
            break;
          case "carry-release":
            spec?.movableController?.release(event, 0.55, 2.5);
            restoreTravel();
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
            if (!element || Math.abs(velocity) < 0.25) {
              settle(true);
              restoreTravel();
              break;
            }
            const coast = () => {
              frames += 1;
              element.scrollLeft += velocity;
              velocity *= 0.9;
              if (Math.abs(velocity) > 0.25 && frames < 90) {
                inertiaFrame.current = requestAnimationFrame(coast);
              } else {
                inertiaFrame.current = null;
                settle(true);
                restoreTravel();
              }
            };
            inertiaFrame.current = requestAnimationFrame(coast);
            break;
          }
          case "cancel":
            clearPickup();
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
    const exposedWorldEvent = (event: PointerEvent) => {
      const element = useStacks.getState().scrollEl;
      return Boolean(
        element &&
          event.target instanceof Node &&
          element.contains(event.target) &&
          event.clientY < activeSheetTop(),
      );
    };
    const publishWake = (event: PointerEvent) => {
      touchWorldRef.pointerX =
        (event.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      touchWorldRef.pointerY =
        -(event.clientY / Math.max(1, window.innerHeight)) * 2 + 1;
      touchWorldRef.wakeStrength = 1;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.pointerType !== "touch" ||
        !event.isPrimary ||
        event.button !== 0
      )
        return;
      stopInertia();
      latestEvent.current = event;
      const store = useStacks.getState();
      if (
        !exposedWorldEvent(event) ||
        store.modalOpen ||
        store.panelState !== "closed"
      )
        return;
      publishWake(event);
      touchWorldRef.meadowPulseRevision += 1;
      const bounds = projectedInteractionBounds(store.activeUnit, {
        x: event.clientX,
        y: event.clientY,
      })
        .map((bounds) =>
          expandAndClipTouchHalo(bounds, {
            width: window.innerWidth,
            height: window.innerHeight,
            sheetTop: activeSheetTop(),
          }),
        )
        .filter((bounds) => bounds !== null);
      const hit = resolveTouchHalo(event.clientX, event.clientY, bounds);
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
      if (store.scrollEl) store.scrollEl.style.touchAction = "none";
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
          activatable: Boolean(spec.activation),
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
      if (event.pointerType !== "touch" || !event.isPrimary) return;
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
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      clearPickup();
      if (backgroundGesture.current?.pointerId === event.pointerId)
        backgroundGesture.current = null;
      reduce({ type: "release", pointerId: event.pointerId }, event);
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
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
      stopInertia();
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
