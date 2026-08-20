"use client";

import { useSyncExternalStore } from "react";

/** This capability selects touch input behavior. It does not select either
 * the Placard surface or the narrow bottom-sheet presentation; the shipped
 * surface is native glass, and viewport width selects the layout. */
export const COARSE_TOUCH_QUERY =
  "(width < 1200px) and (hover: none) and (pointer: coarse)";

function subscribe(listener: () => void) {
  const query = window.matchMedia(COARSE_TOUCH_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export function useCoarseTouchCapability() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(COARSE_TOUCH_QUERY).matches,
    () => true,
  );
}
