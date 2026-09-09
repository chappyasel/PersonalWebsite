"use client";

import { useSyncExternalStore } from "react";

import {
  FULL_PAGE_QUERY,
  prefersFullPage,
} from "~/components/modal-sheet/sheetRoute";

function subscribe(listener: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(FULL_PAGE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export function useBookNotesActionLabel() {
  // Use the launcher's viewport rule, including short landscape screens.
  const fullPage = useSyncExternalStore(subscribe, prefersFullPage, () => true);
  return fullPage ? "View book notes" : "Preview book notes";
}
