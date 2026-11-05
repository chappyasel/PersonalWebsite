"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

/** A touch of overshoot, as the grid's blocks slide. */
const WIDTH = { type: "spring" as const, duration: 0.4, bounce: 0.18 };
/** Even fades, slow enough to read as one: a steep ease-out lost most of
 * its opacity in the first frames and looked like a cut. */
const FADE_IN = { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] as const };
const FADE_OUT = { duration: 0.24, ease: [0.4, 0, 0.7, 1] as const };

/**
 * Inline text that comes and goes, such as "(in 10 hours)" beside a time.
 * It fades and sharpens in as it opens to its width, and on the way out
 * fades and blurs as it closes, so the text after it slides over instead
 * of jumping. Its last words stay while it leaves.
 */
export function Reveal({
  show,
  className,
  children,
}: {
  show: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const hidden = reducedMotion
    ? { opacity: 0 }
    : { opacity: 0, width: 0, filter: "blur(3px)" };
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          // Clipped to its width as it opens, by clip-path rather than
          // overflow: Safari sits a clipped inline-block on its bottom edge
          // instead of the line's baseline, so it rode high on a phone.
          className={cn(
            "inline-block whitespace-pre align-baseline [clip-path:inset(-0.5em_0)]",
            className,
          )}
          initial={hidden}
          animate={{ opacity: 1, width: "auto", filter: "blur(0px)" }}
          // On the way out the words start fading before their room closes.
          exit={{
            ...hidden,
            transition: {
              width: { ...WIDTH, delay: 0.08 },
              opacity: FADE_OUT,
              filter: FADE_OUT,
            },
          }}
          transition={{ width: WIDTH, opacity: FADE_IN, filter: FADE_IN }}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** The Best badge, which pops in with a slight spring and shrinks away. */
export function Pop({
  show,
  className,
  children,
}: {
  show: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const hidden = reducedMotion
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.6, filter: "blur(2px)" };
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          className={className}
          initial={hidden}
          // No filter once it's in, so the badge's HDR plate isn't drawn
          // through one.
          animate={{
            opacity: 1,
            scale: 1,
            filter: "blur(0px)",
            transitionEnd: { filter: "none" },
          }}
          exit={hidden}
          transition={{
            scale: { type: "spring", duration: 0.3, bounce: 0.3 },
            opacity: FADE_IN,
            filter: FADE_IN,
          }}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
