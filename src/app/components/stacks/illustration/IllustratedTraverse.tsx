"use client";

import { UNIT_COUNT } from "../data";
import { navigateRoom, useRoomNavigationReady } from "../input/RoomNavigation";
import {
  backgroundWorldGesture,
  isBrowserZoomWheel,
} from "../input/ScrollBridges";
import { isStacksScrollableTarget } from "../input/roomNavigationKeys";
import { touchSwipeDestination } from "../mobile/swipeTravel";
import { RAIL_RIGHT_PX_FALLBACK } from "../scene/worldLayout";
import { closeStacksPanel, railRightPxRef, useStacks } from "../store";
import { type ReactNode, useCallback, useLayoutEffect, useRef } from "react";

import { isUniversalSearchOpen } from "~/lib/universal-search/overlay";

import type { RoomArtworkTheme, RoomArtworkViewport } from "./artwork/types";
import "./illustratedTraverse.css";
import { illustrationInteraction } from "./illustrationInteraction";
import { illustrationTravelStops } from "./illustrationTravelStops";

/** Native lateral travel, using the same wheel ownership and touch stops as 3D. */
export function IllustratedTraverse({
  unit,
  enabled,
  theme = "light",
  viewport = "desktop",
  onMovingChange,
  children,
}: {
  unit: number;
  enabled: boolean;
  theme?: RoomArtworkTheme;
  viewport?: RoomArtworkViewport;
  onMovingChange: (moving: boolean) => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const published = useRef(unit);
  const destination = useRef<number | null>(null);
  const initialized = useRef(false);
  const stops = useRef<ReturnType<typeof illustrationTravelStops>>([]);
  const locationReady = useRoomNavigationReady();
  const moving = useCallback(
    (value: boolean) => {
      illustrationInteraction.moving = value;
      onMovingChange(value);
    },
    [onMovingChange],
  );

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    let disposed = false;
    const update = () => {
      if (disposed || !el.clientWidth) return;
      const next = illustrationTravelStops(
        el.clientWidth,
        innerHeight,
        railRightPxRef.current || RAIL_RIGHT_PX_FALLBACK,
        theme,
        viewport,
      );
      const previous = stops.current;
      if (
        next.every(
          (stop, index) =>
            Math.abs(
              stop.scrollLeft - (previous[index]?.scrollLeft ?? Infinity),
            ) < 0.01 &&
            Math.abs(stop.width - (previous[index]?.width ?? Infinity)) < 0.01,
        )
      )
        return;
      stops.current = next;
      const slots = el.querySelectorAll<HTMLElement>(".room-illustration-stop");
      next.forEach((stop, index) =>
        slots[index]?.style.setProperty("--room-stop-width", `${stop.width}px`),
      );
      if (initialized.current && previous[published.current])
        el.scrollLeft +=
          next[published.current]!.scrollLeft -
          previous[published.current]!.scrollLeft;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    const rail = document.querySelector(".stacks-unit-rail-desktop");
    if (rail) observer.observe(rail);
    window.addEventListener("resize", update);
    void document.fonts?.ready.then(update);
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [theme, viewport]);

  useLayoutEffect(() => {
    const el = root.current;
    // History resolves the initial path/hash after hydration. Wait for that
    // selection so the first position snaps directly to the requested shelf.
    if (!el || !locationReady || !el.clientWidth) return;
    if (!initialized.current || !enabled) {
      el.scrollLeft = stops.current[unit]!.scrollLeft;
      initialized.current = true;
      published.current = unit;
    } else if (published.current !== unit) {
      published.current = unit;
      destination.current = unit;
      moving(true);
      el.scrollTo({
        left: stops.current[unit]!.scrollLeft,
        behavior: "smooth",
      });
    }
  }, [unit, enabled, locationReady, moving]);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !enabled || !locationReady) return;
    let timer = 0;
    let touching = false;
    let touchStart: number | null = null;
    const nearest = () =>
      stops.current.reduce((best, stop) =>
        Math.abs(stop.scrollLeft - el.scrollLeft) <=
        Math.abs(best.scrollLeft - el.scrollLeft)
          ? stop
          : best,
      ).position;
    const select = () => {
      if (!el.clientWidth) return;
      const next = nearest();
      if (published.current === next) return;
      published.current = next;
      navigateRoom(next, { rendererEnabled: false });
    };
    const settle = () => {
      if (touching || !el.clientWidth) return;
      const closest = nearest();
      const target =
        destination.current ??
        (touchStart === null
          ? closest
          : (touchSwipeDestination({
              startScrollLeft: touchStart,
              endScrollLeft: el.scrollLeft,
              stops: stops.current,
            }) ?? closest));
      touchStart = null;
      const left =
        stops.current[Math.max(0, Math.min(UNIT_COUNT - 1, target))]!
          .scrollLeft;
      if (Math.abs(el.scrollLeft - left) > 1) {
        el.scrollTo({ left, behavior: "smooth" });
        timer = window.setTimeout(settle, 180);
        return;
      }
      select();
      destination.current = null;
      moving(false);
    };
    const scroll = () => {
      moving(true);
      // A rail command owns selection until it arrives. Intermediate scroll
      // positions must not rewrite its destination through the room store.
      if (destination.current === null) select();
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 180);
    };
    const wheel = (event: WheelEvent) => {
      const action = backgroundWorldGesture(
        useStacks.getState(),
        isStacksScrollableTarget(event.target),
        isUniversalSearchOpen(),
      );
      if (action === "blocked" || isBrowserZoomWheel(event)) return;
      moving(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 180);
      destination.current = null;
      event.preventDefault();
      event.stopPropagation();
      if (action === "collapse-and-travel") closeStacksPanel();
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;
      el.scrollLeft +=
        delta *
        (event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? innerHeight : 1);
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      destination.current = null;
      touching = true;
      touchStart = el.scrollLeft;
      moving(true);
    };
    const up = () => {
      if (!touching) return;
      touching = false;
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 180);
    };
    const resize = () => {
      el.scrollLeft = stops.current[published.current]!.scrollLeft;
    };
    el.addEventListener("scroll", scroll, { passive: true });
    el.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    window.addEventListener("pointercancel", up, { passive: true });
    window.addEventListener("wheel", wheel, { passive: false, capture: true });
    window.addEventListener("resize", resize);
    return () => {
      illustrationInteraction.moving = false;
      window.clearTimeout(timer);
      el.removeEventListener("scroll", scroll);
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("wheel", wheel, true);
      window.removeEventListener("resize", resize);
    };
  }, [enabled, locationReady, moving]);

  return (
    <div
      ref={root}
      className="room-illustration-traverse"
      data-illustration-positioned={locationReady ? "" : undefined}
    >
      {children}
    </div>
  );
}
