"use client";

import { type RefObject, useEffect, useRef } from "react";

export const COORDINATION_CHARGE_MS = 2000;
export type CoordinationChargeSignal = RefObject<number | null>;

export function coordinationChargeProgress(
  startedAt: number | null,
  now: number,
) {
  return startedAt === null
    ? 0
    : Math.max(0, Math.min(1, (now - startedAt) / COORDINATION_CHARGE_MS));
}

/** One burst per continuous engagement. Leaving, disabling the effect, or
 * hiding the page discards the charge instead of banking it for later. */
export function useCoordinationCharge(
  engaged: boolean,
  enabled: boolean,
  onCharged: () => void,
): CoordinationChargeSignal {
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!engaged || !enabled || document.hidden) return;
    startedAt.current = performance.now();
    const timer = window.setTimeout(() => {
      startedAt.current = null;
      if (!document.hidden) onCharged();
    }, COORDINATION_CHARGE_MS);
    const cancel = () => {
      window.clearTimeout(timer);
      startedAt.current = null;
    };
    const onVisibilityChange = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancel();
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [engaged, enabled, onCharged]);

  return startedAt;
}
