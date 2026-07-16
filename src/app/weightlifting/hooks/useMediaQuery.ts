"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * SSR-safe media query hook. Returns `undefined` on the server and during
 * the first client render (so hydration matches), then the live match state.
 */
export function useMediaQuery(query: string): boolean | undefined {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => undefined,
  );
}
