import type { CSSProperties } from "react";

/** Shared timing for DOM modals. Physical objects keep their authored travel. */
export const OVERLAY_MOTION = {
  enter: { duration: 0.34, ease: [0.16, 1, 0.3, 1] as const },
  exit: { duration: 0.22, ease: [0.4, 0, 1, 1] as const },
  initial: { opacity: 0, scale: 0.965, y: 14 },
  active: { opacity: 1, scale: 1, y: 0 },
  departing: { opacity: 0, scale: 0.982, y: 8 },
} as const;

export const OVERLAY_MOTION_STYLE = {
  "--overlay-enter-duration": `${OVERLAY_MOTION.enter.duration * 1000}ms`,
  "--overlay-exit-duration": `${OVERLAY_MOTION.exit.duration * 1000}ms`,
  "--overlay-enter-transform": `translateY(${OVERLAY_MOTION.initial.y}px) scale(${OVERLAY_MOTION.initial.scale})`,
  "--overlay-exit-transform": `translateY(${OVERLAY_MOTION.departing.y}px) scale(${OVERLAY_MOTION.departing.scale})`,
} as CSSProperties;
