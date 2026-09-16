"use client";

import { useIsPresent } from "framer-motion";
import {
  type RefObject,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";

import {
  type OverlayKind,
  type OverlayPhase,
  overlayCoordinator,
  registerOverlay,
} from "~/lib/overlays/coordinator";
import { OVERLAY_MOTION } from "~/lib/overlays/motion";

// Includes the authored entrance/room-chrome motion. Physical photo handoffs
// additionally keep the renderer awake until their source reaches its target.
const entranceMs: Record<OverlayKind, number> = {
  command: 220,
  document: 540,
  image: 420,
  "scene-image": 420,
  video: OVERLAY_MOTION.enter.duration * 1000,
  album: 760,
  drawer: 500,
  object: 0,
};

/** Lives inside the renderer's retained DOM, including its exit animation. */
export function OverlayPresence({
  kind,
  onDismiss,
  phase = "open",
  surfaceRef,
}: {
  kind: OverlayKind;
  onDismiss?: () => void;
  phase?: OverlayPhase;
  surfaceRef?: RefObject<HTMLElement | null>;
}) {
  const marker = useRef<HTMLSpanElement>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const lease = useRef<ReturnType<typeof registerOverlay> | null>(null);
  const present = useIsPresent();
  const resolvedPhase = present ? phase : "closing";
  useLayoutEffect(() => {
    const surface = marker.current?.closest<HTMLElement>(
      "[data-overlay-surface], .PhotoView-Portal",
    );
    if (!surface) return;
    if (surfaceRef) surfaceRef.current = surface;
    const sibling = surface.previousElementSibling;
    const backdrop =
      sibling instanceof HTMLElement &&
      sibling.hasAttribute("data-overlay-backdrop")
        ? sibling
        : undefined;
    const registration = registerOverlay({
      kind,
      settled: false,
      surface,
      backdrop,
      dismiss: () => {
        if (dismiss.current) dismiss.current();
        else
          surface.querySelector<HTMLElement>("[data-overlay-close]")?.click();
      },
    });
    const reflectState = () => {
      if (surface.getAttribute("data-state") === "closed")
        registration.update("closing");
      else if (surface.getAttribute("data-state") === "open")
        registration.update("open");
    };
    reflectState();
    const observer = new MutationObserver(reflectState);
    observer.observe(surface, { attributeFilter: ["data-state"] });
    lease.current = registration;
    return () => {
      observer.disconnect();
      if (surfaceRef?.current === surface) surfaceRef.current = null;
      registration.release();
      lease.current = null;
    };
  }, [kind, surfaceRef]);
  useLayoutEffect(() => {
    lease.current?.update(resolvedPhase);
    if (resolvedPhase === "closing") return;
    const registration = lease.current;
    const timer = window.setTimeout(
      () => registration?.settle(),
      entranceMs[kind],
    );
    return () => window.clearTimeout(timer);
  }, [kind, resolvedPhase]);
  return <span ref={marker} hidden aria-hidden />;
}

export function useOverlayState() {
  return useSyncExternalStore(
    overlayCoordinator.subscribe,
    overlayCoordinator.getSnapshot,
    overlayCoordinator.getServerSnapshot,
  );
}
