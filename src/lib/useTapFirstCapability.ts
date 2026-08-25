"use client";

import { useSyncExternalStore } from "react";

/** The interaction profile follows the primary pointer, independently of
 * viewport geometry. The server assumes tap-first so hover-only UI cannot
 * flash before hydration resolves the actual client capability. */
export const TAP_FIRST_POINTER_QUERY = "(hover: none) and (pointer: coarse)";

function matchesTapFirstPointer() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(TAP_FIRST_POINTER_QUERY).matches
  );
}

function subscribe(listener: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(TAP_FIRST_POINTER_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export function useTapFirstCapability() {
  return useSyncExternalStore(subscribe, matchesTapFirstPointer, () => true);
}
