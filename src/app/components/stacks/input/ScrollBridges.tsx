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
import { useEffect, useRef } from "react";

import { UNIT_COUNT, unitIndexFromHash, UNITS } from "../data";
import { panelBusy, useStacks } from "../store";

function wheelDeltaPx(e: WheelEvent, axisDelta: number): number {
  if (e.deltaMode === 1) return axisDelta * 33; // lines
  if (e.deltaMode === 2) return axisDelta * window.innerHeight; // pages
  return axisDelta;
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
      if (useStacks.getState().modalOpen || panelBusy()) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-stacks-scrollable]")) return;
      if (e.ctrlKey) {
        // Trackpad pinch — don't zoom the page and don't travel.
        e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
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

    const onTouchStart = (e: TouchEvent) => {
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
      if (useStacks.getState().modalOpen || panelBusy()) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!axis && Math.hypot(dx, dy) > 8) {
        axis = Math.abs(dy) > Math.abs(dx) ? "v" : "h";
      }
      if (axis !== "v") return;
      e.preventDefault();
      const now = performance.now();
      const step = lastY - t.clientY; // swipe up = travel forward
      scrollEl.scrollLeft += step;
      if (now > lastT) velocity = (step / (now - lastT)) * 16.7;
      lastY = t.clientY;
      lastT = now;
    };
    const onTouchEnd = () => {
      if (axis !== "v" || Math.abs(velocity) < 0.5) return;
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
      const state = useStacks.getState();
      if (state.modalOpen || state.panelState !== "closed") return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        state.travelTo?.(Math.min(UNIT_COUNT - 1, state.activeUnit + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        state.travelTo?.(Math.max(0, state.activeUnit - 1));
      }
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
