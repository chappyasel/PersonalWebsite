"use client";

import {
  GOLF_STOP_POSITION,
  UNIT_COUNT,
  golfFocusedForScenePosition,
  initialScenePositionFromLocation,
  scenePositionFromHash,
  sceneUrl,
  unitUrl,
} from "../data";
import { closeStacksPanel, isPanelHistoryEntry, useStacks } from "../store";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { isRoomPathname } from "~/lib/site/roomRoutes";
import { isUniversalSearchOpen } from "~/lib/universal-search/overlay";

import {
  isStacksScrollableTarget,
  shouldHandleWorldNavigationKey,
  worldNavigationStep,
  worldNavigationUnit,
} from "./roomNavigationKeys";

/** DOM selection is authoritative when no visible renderer owns travel. */
export function navigateRoom(
  position: number,
  { rendererEnabled = true, instant = false } = {},
) {
  if (!Number.isFinite(position)) return;
  const target = Math.max(0, Math.min(UNIT_COUNT - 1, position));
  const state = useStacks.getState();
  const command = instant ? state.jumpTo : state.travelTo;
  if (rendererEnabled && command) {
    command(target);
    return;
  }
  const golf = golfFocusedForScenePosition(target);
  useStacks.setState({
    activeUnit: Math.round(target),
    golfFocused: golf,
    golfStop: golf,
    settledUnit: Number.isInteger(target) ? target : null,
    focusedInteraction: null,
  });
}

export function navigateRoomLink(index: number, rendererEnabled: boolean) {
  const state = useStacks.getState();
  if (state.modalOpen || state.panelState === "closing") return false;
  state.setFocusedInteraction(null);
  const push = () =>
    window.history.pushState(null, "", unitUrl(index, window.location.search));
  if (state.panelState === "open" || state.panelState === "opening") {
    closeStacksPanel();
    navigateRoom(index, { rendererEnabled });
    const unsubscribe = useStacks.subscribe((next) => {
      if (next.panelState !== "closed") return;
      unsubscribe();
      if (isRoomPathname(window.location.pathname)) push();
    });
  } else {
    push();
    navigateRoom(index, { rendererEnabled });
  }
  return true;
}

const NavigationContext = createContext<(index: number) => boolean>((index) =>
  navigateRoomLink(index, true),
);
export const useRoomNavigation = () => useContext(NavigationContext);
const NavigationReadyContext = createContext(true);
export const useRoomNavigationReady = () => useContext(NavigationReadyContext);

export function shouldMirrorWorldHistory(
  state: Pick<
    ReturnType<typeof useStacks.getState>,
    "modalOpen" | "panelState" | "unitMapPreview"
  > & {
    visionRidePhase?: ReturnType<typeof useStacks.getState>["visionRidePhase"];
  },
) {
  return (
    !state.modalOpen &&
    (state.visionRidePhase === undefined || state.visionRidePhase === "idle") &&
    state.panelState === "closed" &&
    state.unitMapPreview === null
  );
}

export default function RoomNavigation({
  rendererEnabled,
  onInteract,
  children,
}: {
  rendererEnabled: boolean;
  onInteract?: () => void;
  children?: ReactNode;
}) {
  const scrollEl = useStacks((s) => s.scrollEl);
  const jumpTo = useStacks((s) => s.jumpTo);
  const initialized = useRef(false);
  const [locationReady, setLocationReady] = useState(false);
  const lastLocation = useRef<string | null>(null);
  const locationAppliedTo = useRef<HTMLDivElement | null>(null);
  const go = useCallback(
    (index: number) => {
      onInteract?.();
      return navigateRoomLink(index, rendererEnabled);
    },
    [rendererEnabled, onInteract],
  );
  // History wiring. Hash mirrors the active unit (replaceState while
  // traveling); deep-links jump instantly on mount; back/forward travels.
  useEffect(() => {
    if (!isRoomPathname(window.location.pathname)) return;

    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    if (!initialized.current) {
      initialized.current = true;
      if (rendererEnabled && scrollEl && jumpTo)
        locationAppliedTo.current = scrollEl;
      const target = initialScenePositionFromLocation(
        window.location.pathname,
        window.location.hash,
      );
      if (!rendererEnabled || target > 0)
        navigateRoom(target, { rendererEnabled, instant: true });
      if (scenePositionFromHash(window.location.hash) !== null) {
        const canonical = sceneUrl(
          Math.round(target),
          golfFocusedForScenePosition(target),
          window.location.search,
        );
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (current !== canonical)
          window.history.replaceState(null, "", canonical);
      }
    }
    // A replacement renderer adopts the existing selection. It never resets
    // the resident panel or its scroller to the URL's previous state.
    if (scrollEl && jumpTo && locationAppliedTo.current !== scrollEl) {
      locationAppliedTo.current = scrollEl;
      const state = useStacks.getState();
      jumpTo(state.golfStop ? GOLF_STOP_POSITION : state.activeUnit);
    }

    // Activity may reconnect after another route changed the address. A
    // renderer replacement alone must not replay a stale panel-history URL.
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (lastLocation.current !== null && lastLocation.current !== here) {
      const target = initialScenePositionFromLocation(
        window.location.pathname,
        window.location.hash,
      );
      const current = useStacks.getState();
      if (
        current.panelState === "closed" &&
        (Math.round(target) !== current.activeUnit ||
          golfFocusedForScenePosition(target) !== current.golfStop)
      )
        navigateRoom(target, { rendererEnabled, instant: true });
    }
    lastLocation.current = here;
    setLocationReady(true);

    // Mirror travel into the URL — at most one replaceState per unit change.
    // The golf half of it is the scroll's stop window, not golf mode: the
    // mouse can put the visitor in golf from the Books stop, and that must
    // not rewrite the URL under them.
    let mirrored = {
      activeUnit: useStacks.getState().activeUnit,
      golfFocused: useStacks.getState().golfStop,
    };
    const unsubscribe = useStacks.subscribe((state) => {
      if (
        state.activeUnit === mirrored.activeUnit &&
        state.golfStop === mirrored.golfFocused
      )
        return;
      mirrored = {
        activeUnit: state.activeUnit,
        golfFocused: state.golfStop,
      };
      if (
        !isRoomPathname(window.location.pathname) ||
        !shouldMirrorWorldHistory(state)
      )
        return;
      lastLocation.current = sceneUrl(
        mirrored.activeUnit,
        mirrored.golfFocused,
        window.location.search,
      );
      window.history.replaceState(
        null,
        "",
        sceneUrl(
          mirrored.activeUnit,
          mirrored.golfFocused,
          window.location.search,
        ),
      );
    });

    const travelToLocation = () => {
      // A replayed major-route pop can reach us before Activity disconnects
      // the old room. The destination page owns its URL and scroll position.
      if (!isRoomPathname(window.location.pathname)) return;
      const target = initialScenePositionFromLocation(
        window.location.pathname,
        window.location.hash,
      );
      lastLocation.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const nextMirrored = {
        activeUnit: Math.round(target),
        golfFocused: golfFocusedForScenePosition(target),
      };
      if (
        mirrored.activeUnit === nextMirrored.activeUnit &&
        mirrored.golfFocused === nextMirrored.golfFocused
      ) {
        return;
      }
      mirrored = nextMirrored; // suppress the replaceState echo for this travel
      onInteract?.();
      navigateRoom(target, { rendererEnabled });
    };
    const onPopState = () => {
      if (!isRoomPathname(window.location.pathname)) return;
      const state = useStacks.getState();
      if (state.modalOpen || state.visionRidePhase !== "idle") return;
      // Browser back while the mobile panel is up closes the panel — the
      // pushed entry belongs to it — and never travels. Unless the pop
      // LANDED on the panel's entry: that is a surface stacked above it (a
      // document sheet, the book modal) closing, and the panel stays.
      if (state.panelState === "open" || state.panelState === "opening") {
        if (isPanelHistoryEntry(window.history.state)) return;
        state.setPanelState("closing");
        return;
      }
      if (state.panelState === "closing") return; // our own history.back()
      travelToLocation();
    };
    // Direct fragment navigation (including Universal Search) fires
    // hashchange rather than popstate. It is an explicit destination, so it
    // travels even if an overlaid panel is finishing its own close.
    const onHashChange = () => travelToLocation();
    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onHashChange);

    return () => {
      unsubscribe();
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("hashchange", onHashChange);
      window.history.scrollRestoration = previousRestoration;
    };
  }, [scrollEl, jumpTo, rendererEnabled, onInteract]);

  useEffect(() => {
    if (rendererEnabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        !isRoomPathname(window.location.pathname) ||
        !shouldHandleWorldNavigationKey(event, isUniversalSearchOpen()) ||
        isStacksScrollableTarget(event.target) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const state = useStacks.getState();
      if (
        state.modalOpen ||
        state.panelState !== "closed" ||
        state.visionRidePhase !== "idle"
      )
        return;
      const step = worldNavigationStep(event.key);
      const digit = worldNavigationUnit(event.key);
      if (step === null && digit === null) return;
      event.preventDefault();
      const destination =
        digit ??
        Math.min(UNIT_COUNT - 1, Math.max(0, state.activeUnit + step!));
      go(destination);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rendererEnabled, go]);

  return (
    <NavigationContext.Provider value={go}>
      <NavigationReadyContext.Provider value={locationReady}>
        {children}
      </NavigationReadyContext.Provider>
    </NavigationContext.Provider>
  );
}
