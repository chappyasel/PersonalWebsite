"use client";

import { useSyncExternalStore } from "react";

import {
  UNIVERSAL_SEARCH_OPEN_ATTRIBUTE,
  isUniversalSearchOpen,
} from "./overlay";

function subscribe(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [UNIVERSAL_SEARCH_OPEN_ATTRIBUTE],
  });
  return () => observer.disconnect();
}

const serverSnapshot = () => false;

/** React consumers follow the same marker as the global input handlers. */
export function useUniversalSearchOpen() {
  return useSyncExternalStore(subscribe, isUniversalSearchOpen, serverSnapshot);
}
