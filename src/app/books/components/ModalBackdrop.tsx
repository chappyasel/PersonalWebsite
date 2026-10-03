"use client";

import { usePresence } from "framer-motion";
import {
  type ComponentPropsWithoutRef,
  type RefObject,
  useLayoutEffect,
} from "react";

// The same fade in and out.
const FADE_MS = 280;
const FADE_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

/**
 * The book modal's black. Its fades are plain WAAPI animations, the way
 * originFlight animates it, not framer-motion's. framer-motion ends a
 * browser fade by cancelling it and writing the final opacity on its next
 * frame, so the black could blink clear at the end of fading in and back at
 * the end of fading out. Here the fade in ends on the layer's own resting
 * opacity, and the fade out holds its last frame (`fill: "forwards"`) until
 * AnimatePresence, which waits for it (usePresence), removes the layer.
 * Running on the compositor, neither stalls behind a busy main thread.
 */
export function ModalBackdrop({
  backdropRef,
  instant,
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  backdropRef: RefObject<HTMLDivElement | null>;
  /** No fade: reduced motion, or an origin flight already faded it out. */
  instant: boolean;
}) {
  const [isPresent, safeToRemove] = usePresence();

  useLayoutEffect(() => {
    const backdrop = backdropRef.current;
    const canAnimate = typeof backdrop?.animate === "function";
    if (isPresent) {
      // Before paint, so the black never shows at rest first.
      if (canAnimate && !instant)
        backdrop.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: FADE_MS,
          easing: FADE_EASE,
        });
      return;
    }
    if (!canAnimate || instant) {
      // Not synchronously: AnimatePresence marks this exit pending in its
      // own layout effect, which runs after this one and would undo it,
      // leaving the modal mounted and invisible over the page.
      queueMicrotask(safeToRemove);
      return;
    }
    const fade = backdrop.animate(
      [{ opacity: getComputedStyle(backdrop).opacity }, { opacity: 0 }],
      { duration: FADE_MS, easing: FADE_EASE, fill: "forwards" },
    );
    fade.onfinish = () => safeToRemove();
    fade.oncancel = () => safeToRemove();
    // Presence is the only trigger; `instant` is read as it stood then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  return <div ref={backdropRef} {...props} />;
}
