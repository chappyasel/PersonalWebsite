"use client";

import { UNIT_COUNT } from "../data";
import { navigateRoom, useRoomNavigationReady } from "../input/RoomNavigation";
import {
  backgroundWorldGesture,
  isBrowserZoomWheel,
} from "../input/ScrollBridges";
import { dimensionTravel } from "../input/dimensionTravel";
import { isStacksScrollableTarget } from "../input/roomNavigationKeys";
import { openSearchFromEdge, roomEdgeMotion } from "../mobile/roomEdgeMotion";
import { touchSwipeDestination } from "../mobile/swipeTravel";
import {
  nativeHorizontalWheelGesture,
  wheelStepGesture,
  worldWheelDelta,
} from "../mobile/wheelStepGesture";
import { RAIL_RIGHT_PX_FALLBACK } from "../scene/worldLayout";
import { closeStacksPanel, railRightPxRef, useStacks } from "../store";
import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";

import { useDesktopReducedMotion } from "~/lib/desktopMotionPreference";
import { isUniversalSearchOpen } from "~/lib/universal-search/overlay";

import type { RoomArtworkTheme, RoomArtworkViewport } from "./artwork/types";
import "./illustratedTraverse.css";
import { illustrationInteraction } from "./illustrationInteraction";
import {
  createIllustrationOverscroll,
  illustrationOverscrollController,
} from "./illustrationOverscroll";
import {
  illustratedScrollForPosition,
  illustrationTravelStops,
  positionForIllustratedScroll,
} from "./illustrationTravelStops";

/** Native lateral travel, using the same wheel ownership and touch stops as 3D. */
export function IllustratedTraverse({
  unit,
  enabled,
  transitionPosition = null,
  transitionId = 0,
  theme = "light",
  viewport = "desktop",
  onMovingChange,
  children,
}: {
  unit: number;
  enabled: boolean;
  transitionPosition?: number | null;
  transitionId?: number;
  theme?: RoomArtworkTheme;
  viewport?: RoomArtworkViewport;
  onMovingChange: (moving: boolean) => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const overscroll = useRef<ReturnType<
    typeof createIllustrationOverscroll
  > | null>(null);
  const reducedMotion = useDesktopReducedMotion();
  useLayoutEffect(() => {
    const element = content.current;
    const viewport = root.current;
    if (!element || !viewport || !enabled) return;
    const original = element.style.translate;
    let wasMoving = false;
    const update = () => {
      const offset = roomEdgeMotion.getOffset();
      if (offset > 0 && !wasMoving) overscroll.current?.reset();
      wasMoving = offset > 0;
      element.style.translate = offset
        ? `${Math.min(viewport.clientWidth, 900) * offset}px 0`
        : original;
    };
    update();
    const unsubscribe = roomEdgeMotion.subscribeFrame(update);
    return () => {
      unsubscribe();
      element.style.translate = original;
    };
  }, [enabled]);
  const overscrollEnabled = useSyncExternalStore(
    illustrationOverscrollController.subscribe,
    illustrationOverscrollController.getSnapshot,
    illustrationOverscrollController.getSnapshot,
  ).enabled;
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      overscroll.current?.dispose();
      const allowed =
        enabled && overscrollEnabled && !reducedMotion && !query.matches;
      overscroll.current =
        allowed && content.current
          ? createIllustrationOverscroll(content.current)
          : null;
      element.style.overscrollBehaviorX = allowed ? "contain" : "none";
    };
    update();
    query.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
      overscroll.current?.dispose();
      overscroll.current = null;
      element.style.removeProperty("overscroll-behavior-x");
    };
  }, [enabled, overscrollEnabled, reducedMotion]);
  const published = useRef(unit);
  const destination = useRef<number | null>(null);
  const initialized = useRef(false);
  const restoredPosition = useRef<number | null>(null);
  const appliedTransition = useRef<number | null>(null);
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
    // Activity preserves refs while parking effects. Recovery can wake this
    // row without a dimension handoff, so restore its current stop before
    // paint instead of resuming an old smooth-scroll destination.
    initialized.current = false;
    destination.current = null;
    restoredPosition.current = null;
    appliedTransition.current = null;
    const read = () => {
      // HUD drift and dimension handoff read logical travel, not the elastic
      // presentation or browser scroll adjustments made during its return.
      const elasticOffset = overscroll.current?.getOffset() ?? 0;
      if (elasticOffset > 0) return stops.current[0]?.position ?? 0;
      if (elasticOffset < 0) return stops.current.at(-1)?.position ?? 0;
      return positionForIllustratedScroll(
        stops.current,
        root.current?.scrollLeft ?? 0,
      );
    };
    dimensionTravel.readIllustratedPosition = read;
    return () => {
      if (dimensionTravel.readIllustratedPosition === read)
        dimensionTravel.readIllustratedPosition = null;
    };
  }, []);

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
      const previousLeft = el.scrollLeft;
      stops.current = next;
      const leadingSpace = next[0]?.scrollLeft ?? 0;
      if (track.current) {
        track.current.style.width = `${leadingSpace + next.reduce((sum, stop) => sum + stop.width, 0)}px`;
        track.current.style.setProperty(
          "--room-leading-space",
          `${leadingSpace}px`,
        );
      }
      const slots = el.querySelectorAll<HTMLElement>(".room-illustration-stop");
      next.forEach((stop, index) =>
        slots[index]?.style.setProperty("--room-stop-width", `${stop.width}px`),
      );
      if (initialized.current && previous.length) {
        const previousLeadingSpace = previous[0]!.scrollLeft;
        el.scrollLeft =
          previousLeadingSpace > 0 && previousLeft < previousLeadingSpace
            ? (Math.max(0, previousLeft) / previousLeadingSpace) * leadingSpace
            : illustratedScrollForPosition(
                next,
                positionForIllustratedScroll(previous, previousLeft),
              );
        if (restoredPosition.current !== null)
          restoredPosition.current = el.scrollLeft;
      }
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
    if (
      transitionPosition !== null &&
      appliedTransition.current !== transitionId
    ) {
      overscroll.current?.reset();
      appliedTransition.current = transitionId;
      const left = illustratedScrollForPosition(
        stops.current,
        transitionPosition,
      );
      // Also cancels any native smooth scroll toward a previous nav destination.
      el.scrollTo({ left, behavior: "instant" });
      restoredPosition.current = left;
      destination.current = null;
      initialized.current = true;
      published.current = unit;
      moving(false);
    } else if (
      !initialized.current ||
      (!enabled && transitionPosition === null)
    ) {
      el.scrollLeft = illustratedScrollForPosition(stops.current, unit);
      // Native scroll events also fire for initialization. Keep the requested
      // semantic position until travel actually moves away from it.
      restoredPosition.current = el.scrollLeft;
      initialized.current = true;
      published.current = unit;
      moving(false);
    } else if (enabled && published.current !== unit) {
      overscroll.current?.reset();
      published.current = unit;
      destination.current = unit;
      moving(true);
      el.scrollTo({
        left: illustratedScrollForPosition(stops.current, unit),
        behavior: "smooth",
      });
    }
  }, [unit, enabled, locationReady, moving, transitionPosition, transitionId]);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !enabled || !locationReady) return;
    let timer = 0;
    let touching = false;
    let objectTap = false;
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
      if (overscroll.current?.isActive()) {
        timer = window.setTimeout(settle, 80);
        return;
      }
      const closest = nearest();
      // Mouse/trackpad travel can rest between shelves; only touch and nav
      // commands snap to a stop. This also keeps a restored handoff in place.
      if (destination.current === null && touchStart === null) {
        select();
        moving(false);
        return;
      }
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
      const left = illustratedScrollForPosition(
        stops.current,
        Math.max(0, Math.min(UNIT_COUNT - 1, target)),
      );
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
      // Wheel input consumes the stretch before entering another section.
      // Scroll notifications during that stretch cannot claim a new gesture.
      if (overscroll.current?.getOffset()) return;
      if (
        restoredPosition.current !== null &&
        Math.abs(el.scrollLeft - restoredPosition.current) < 1
      )
        return;
      restoredPosition.current = null;
      objectTap = false;
      moving(true);
      // A rail command owns selection until it arrives. Intermediate scroll
      // positions must not rewrite its destination through the room store.
      if (destination.current === null) select();
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 180);
    };
    const edgeSearch = wheelStepGesture(
      () =>
        openSearchFromEdge(
          Math.max(0, overscroll.current?.getOffset() ?? 0) /
            Math.max(1, Math.min(el.clientWidth, 900)),
        ),
      "world",
    );
    const nativeWheel = nativeHorizontalWheelGesture();
    const wheel = (event: WheelEvent) => {
      const nativeHorizontal = nativeWheel(event, el);
      const action = backgroundWorldGesture(
        useStacks.getState(),
        isStacksScrollableTarget(event.target),
        isUniversalSearchOpen(),
      );
      const searchOpened = edgeSearch(
        event,
        action === "travel" &&
          useStacks.getState().activeUnit === 0 &&
          worldWheelDelta(event) < 0 &&
          el.scrollLeft <= 2,
      );
      if (action === "blocked" || isBrowserZoomWheel(event)) return;
      if (searchOpened) {
        if (!nativeHorizontal) event.preventDefault();
        event.stopPropagation();
        return;
      }
      moving(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 180);
      destination.current = null;
      event.stopPropagation();
      if (action === "collapse-and-travel") closeStacksPanel();
      // Native horizontal scrolling owns interior travel. At either edge,
      // use the same visible resistance for both axes and suppress a second
      // browser bounce. Touch restores its native overscroll below.
      el.style.overscrollBehaviorX = "none";
      const delta =
        (nativeHorizontal
          ? event.deltaX || (event.shiftKey ? event.deltaY : 0)
          : worldWheelDelta(event)) *
        (event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? innerHeight : 1);
      const min = 0;
      const max = stops.current.at(-1)?.scrollLeft ?? min;
      const stretched = overscroll.current?.isActive() ?? false;
      const elasticOffset = overscroll.current?.getOffset() ?? 0;
      const remaining = overscroll.current?.consume(delta) ?? delta;
      // Elastic motion is presentation only. Pin its logical position to the
      // edge; never recycle scroll anchoring or fractional layout differences
      // into another outward wheel delta.
      const position =
        elasticOffset > 0
          ? min
          : elasticOffset < 0
            ? max
            : Math.max(min, Math.min(max, el.scrollLeft));
      const requested = position + remaining;
      const clamped = Math.max(min, Math.min(max, requested));
      if (nativeHorizontal && !stretched && requested === clamped) return;
      event.preventDefault();
      if (el.scrollLeft !== clamped) el.scrollLeft = clamped;
      if (requested !== clamped) overscroll.current?.push(requested - clamped);
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      overscroll.current?.reset();
      el.style.overscrollBehaviorX = overscroll.current ? "contain" : "none";
      destination.current = null;
      touching = true;
      touchStart = el.scrollLeft;
      objectTap =
        !illustrationInteraction.moving &&
        event.target instanceof Element &&
        Boolean(event.target.closest("[data-illustration-object]"));
      // Block handoff during contact, but keep the target mounted until we
      // know whether this is a tap. Native scrolling still retires it above.
      if (objectTap) illustrationInteraction.moving = true;
      else moving(true);
    };
    const up = () => {
      if (!touching) return;
      touching = false;
      window.clearTimeout(timer);
      if (objectTap) {
        objectTap = false;
        touchStart = null;
        moving(false);
        return;
      }
      timer = window.setTimeout(settle, 180);
    };
    el.addEventListener("scroll", scroll, { passive: true });
    el.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    window.addEventListener("pointercancel", up, { passive: true });
    window.addEventListener("wheel", wheel, { passive: false, capture: true });
    return () => {
      illustrationInteraction.moving = false;
      window.clearTimeout(timer);
      el.removeEventListener("scroll", scroll);
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("wheel", wheel, true);
    };
  }, [enabled, locationReady, moving]);

  return (
    <div
      ref={root}
      className="room-illustration-traverse"
      data-illustration-positioned={locationReady ? "" : undefined}
    >
      <div ref={track} className="room-illustration-track">
        <div ref={content} className="room-illustration-content">
          {children}
        </div>
      </div>
    </div>
  );
}
