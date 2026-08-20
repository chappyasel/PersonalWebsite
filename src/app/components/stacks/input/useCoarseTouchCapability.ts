"use client";

import { useSyncExternalStore } from "react";

/** This capability selects touch input behavior and the paper fallback. It
 * does not select the narrow bottom-sheet presentation; viewport width does. */
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
