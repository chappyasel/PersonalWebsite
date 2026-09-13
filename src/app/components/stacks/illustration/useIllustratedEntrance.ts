import { type RefObject, useLayoutEffect, useRef, useState } from "react";

import {
  prepareEntranceArtwork,
  waitForEntranceStage,
} from "./entranceArtwork";

export type IllustratedEntrancePhase =
  | "shelf"
  | "items"
  | "placing"
  | "complete";
export const ILLUSTRATED_ENTRANCE = {
  assetWaitMs: 2000,
  emptyMs: 180,
  itemMs: 320,
  itemStepMs: 90,
  maxStaggerMs: 1500,
  placementMs: 620,
  nameMs: 850,
} as const;

/** One assembly per resident room. WebGL readiness never shortens it; input
 * can settle it immediately without consuming the visitor's gesture. */
export function useIllustratedEntrance(
  enabled: boolean,
  root: RefObject<HTMLElement | null>,
  identity: string,
  skip = false,
) {
  const [phase, setPhase] = useState<IllustratedEntrancePhase>("shelf");
  const completed = useRef(false);
  useLayoutEffect(() => {
    if (!enabled || completed.current || skip) {
      if (skip) completed.current = true;
      if (completed.current) setPhase("complete");
      return;
    }
    const container = root.current;
    if (!container) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const controller = new AbortController();
    const { signal } = controller;
    const animations = new Set<Animation>();
    let disposeArtwork: (() => void) | undefined;
    let started = false;
    let preparationTimer = 0;
    let remainingWait: number = ILLUSTRATED_ENTRANCE.assetWaitMs;
    let waitStarted = performance.now();
    const events = ["pointerdown", "touchstart", "wheel", "keydown"] as const;
    const finish = () => {
      if (signal.aborted) return;
      completed.current = true;
      stop();
      setPhase("complete");
    };
    const onMotionChange = () => {
      if (motion.matches) finish();
    };
    const armPreparationTimeout = () => {
      waitStarted = performance.now();
      preparationTimer = window.setTimeout(finish, Math.max(1, remainingWait));
    };
    const onVisibility = () => {
      for (const animation of animations) {
        if (document.hidden && animation.playState === "running")
          animation.pause();
        else if (!document.hidden && animation.playState === "paused")
          animation.play();
      }
      if (started) return;
      if (document.hidden) {
        window.clearTimeout(preparationTimer);
        remainingWait -= performance.now() - waitStarted;
      } else armPreparationTimeout();
    };
    const stop = () => {
      controller.abort();
      window.clearTimeout(preparationTimer);
      for (const animation of animations) animation.cancel();
      animations.clear();
      disposeArtwork?.();
      events.forEach((event) =>
        window.removeEventListener(event, finish, true),
      );
      window.removeEventListener("resize", finish);
      window.removeEventListener("popstate", finish);
      window.removeEventListener("hashchange", finish);
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", onMotionChange);
    };
    const animate = (
      element: Element,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => {
      const animation = element.animate(frames, options);
      animations.add(animation);
      if (document.hidden) animation.pause();
      return animation;
    };
    setPhase("shelf");
    events.forEach((event) =>
      window.addEventListener(event, finish, { capture: true, passive: true }),
    );
    window.addEventListener("resize", finish);
    window.addEventListener("popstate", finish);
    window.addEventListener("hashchange", finish);
    document.addEventListener("visibilitychange", onVisibility);
    motion.addEventListener("change", onMotionChange);
    if (motion.matches || typeof Element.prototype.animate !== "function") {
      finish();
      return stop;
    }
    if (!document.hidden) armPreparationTimeout();
    void (async () => {
      const stage = await waitForEntranceStage(container, signal);
      const artwork = await prepareEntranceArtwork(stage, signal);
      disposeArtwork = artwork.dispose;
      if (signal.aborted) disposeArtwork();
      signal.throwIfAborted();
      window.clearTimeout(preparationTimer);
      started = true;
      const count = artwork.items.length;
      const step = Math.min(
        ILLUSTRATED_ENTRANCE.itemStepMs,
        ILLUSTRATED_ENTRANCE.maxStaggerMs / Math.max(1, count - 1),
      );
      const reveals = artwork.items.map((item, index) =>
        animate(
          item,
          [
            { opacity: 0, transform: "translateY(7px) scale(0.96)" },
            { opacity: 1, transform: "none" },
          ],
          {
            delay: ILLUSTRATED_ENTRANCE.emptyMs + index * step,
            duration: ILLUSTRATED_ENTRANCE.itemMs,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "both",
          },
        ),
      );
      setPhase("items");
      await Promise.all(reveals.map((animation) => animation.finished));
      signal.throwIfAborted();
      const initialTransform = getComputedStyle(stage).transform;
      const name = document.querySelector<HTMLElement>(".room-entry-wordmark");
      const nameArrival = name
        ? animate(
            name,
            [
              { transform: getComputedStyle(name).transform },
              { transform: "none" },
            ],
            {
              duration: ILLUSTRATED_ENTRANCE.nameMs,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              fill: "both",
            },
          )
        : null;
      const placement = animate(
        stage,
        [{ transform: initialTransform }, { transform: "none" }],
        {
          duration: ILLUSTRATED_ENTRANCE.placementMs,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both",
        },
      );
      setPhase("placing");
      // The name, sheet and navigation arrive together only after every item.
      // Wait for both compositor timelines before the room may dissolve.
      await Promise.all([placement.finished, nameArrival?.finished]);
      signal.throwIfAborted();
      finish();
    })().catch(() => {
      // Entrance preparation never covers the usable reader indefinitely.
      // The ordinary decoder still owns renderer registration and failures.
      if (!signal.aborted) finish();
    });
    return () => {
      stop();
      // Shelf/theme changes and resident returns never replay a shown sequence.
      // Strict Mode's pre-start cleanup can retry.
      if (started) completed.current = true;
    };
  }, [enabled, identity, root, skip]);
  return !enabled || skip || completed.current ? "complete" : phase;
}
