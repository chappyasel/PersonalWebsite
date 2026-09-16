"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

import { desktopMotionPreference } from "~/lib/desktopMotionPreference";
import { overlayBackgroundMotion } from "~/lib/overlays/backgroundMotion";
import { overlayCoordinator } from "~/lib/overlays/coordinator";

/** Subscribe outside Canvas so dismissal can wake a sleeping renderer. */
export function useOverlayBackgroundMotion() {
  const snapshot = useSyncExternalStore(
    overlayBackgroundMotion.subscribe,
    overlayBackgroundMotion.getSnapshot,
    overlayBackgroundMotion.getSnapshot,
  );
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () =>
      overlayBackgroundMotion.setReducedMotion(
        media.matches || desktopMotionPreference.getSnapshot(),
      );
    const sync = () =>
      overlayBackgroundMotion.setPaused(
        overlayCoordinator.getSnapshot().hasOpenOverlay,
      );
    const stopPreference = desktopMotionPreference.subscribe(preference);
    media.addEventListener("change", preference);
    preference();
    const stopOverlay = overlayCoordinator.subscribe(sync);
    sync();
    return () => {
      stopPreference();
      stopOverlay();
      media.removeEventListener("change", preference);
      overlayBackgroundMotion.setReducedMotion(true);
      overlayBackgroundMotion.setPaused(false);
      overlayBackgroundMotion.setReducedMotion(false);
    };
  }, []);
  return snapshot;
}
