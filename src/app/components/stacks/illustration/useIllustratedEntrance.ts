import { useLayoutEffect, useRef, useState } from "react";

export type IllustratedEntrancePhase =
  | "shelf"
  | "content"
  | "navigation"
  | "complete";

const CONTENT_AT = 180;
const NAVIGATION_AT = 500;
const COMPLETE_AT = 740;

/** One entrance per resident room, independent of image loading and boot retries. */
export function useIllustratedEntrance(enabled: boolean) {
  const [phase, setPhase] = useState<IllustratedEntrancePhase>(
    enabled ? "shelf" : "complete",
  );
  const startedAt = useRef<number | null>(null);
  const completed = useRef(false);

  useLayoutEffect(() => {
    if (!enabled || completed.current) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    startedAt.current ??= performance.now();
    const elapsed = performance.now() - startedAt.current;
    if (motion.matches || elapsed >= COMPLETE_AT) {
      completed.current = true;
      setPhase("complete");
      return;
    }

    setPhase(
      elapsed >= NAVIGATION_AT
        ? "navigation"
        : elapsed >= CONTENT_AT
          ? "content"
          : "shelf",
    );
    const timers: number[] = [];
    const events = ["pointerdown", "touchstart", "wheel", "keydown"] as const;
    const stop = () => {
      timers.forEach(window.clearTimeout);
      events.forEach((event) =>
        window.removeEventListener(event, finish, true),
      );
      motion.removeEventListener("change", onMotionChange);
    };
    const finish = () => {
      completed.current = true;
      setPhase("complete");
      stop();
    };
    const onMotionChange = () => {
      if (motion.matches) finish();
    };
    for (const [at, next] of [
      [CONTENT_AT, "content"],
      [NAVIGATION_AT, "navigation"],
    ] as const) {
      if (at > elapsed)
        timers.push(window.setTimeout(() => setPhase(next), at - elapsed));
    }
    timers.push(window.setTimeout(finish, COMPLETE_AT - elapsed));
    events.forEach((event) =>
      window.addEventListener(event, finish, { capture: true, passive: true }),
    );
    motion.addEventListener("change", onMotionChange);
    return stop;
  }, [enabled]);

  return phase;
}
