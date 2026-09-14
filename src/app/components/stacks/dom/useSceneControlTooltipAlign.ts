"use client";

import { STACKS_MOBILE_QUERY } from "../scene/worldLayout";
import { useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(STACKS_MOBILE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function isNarrow() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(STACKS_MOBILE_QUERY).matches
  );
}

/** Top-right controls anchor hints right; bottom-left controls anchor left. */
export function useSceneControlTooltipAlign() {
  const narrow = useSyncExternalStore(subscribe, isNarrow, () => false);
  return narrow ? "end" : "start";
}
