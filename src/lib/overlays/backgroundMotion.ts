/** Seconds spent easing scene speed, independently of foreground travel. */
export const OVERLAY_BACKGROUND_RAMP_SECONDS = 1.5;

// Constant speed change through the middle, with short rounded ends so
// slowing starts promptly and reaches rest without a sharp final stop.
const EDGE = 0.12;
function rampSpeed(progress: number) {
  if (progress < EDGE) return progress ** 2 / (2 * EDGE * (1 - EDGE));
  if (progress > 1 - EDGE)
    return 1 - (1 - progress) ** 2 / (2 * EDGE * (1 - EDGE));
  return (progress - EDGE / 2) / (1 - EDGE);
}

/** Exact integral of rampSpeed, including the rounded endpoints. */
function rampIntegral(progress: number) {
  if (progress < EDGE) return progress ** 3 / (6 * EDGE * (1 - EDGE));
  if (progress > 1 - EDGE)
    return progress - 0.5 + (1 - progress) ** 3 / (6 * EDGE * (1 - EDGE));
  return (
    (progress ** 2 / 2 - (EDGE * progress) / 2 + EDGE ** 2 / 6) / (1 - EDGE)
  );
}

/** Integrate speed instead of multiplying absolute scene time. This keeps
 * birds, wind, physics, and shader animation continuous through reversals. */
export function createOverlayBackgroundMotion() {
  let snapshot = { enabled: true, active: false, paused: false };
  let reduced = false;
  let speed = 1;
  let progress = 1;
  let target = 1;
  const listeners = new Set<() => void>();
  const publish = () => {
    const active = progress !== target;
    const paused = speed === 0 && !active;
    if (snapshot.active === active && snapshot.paused === paused) return;
    snapshot = { ...snapshot, active, paused };
    for (const listener of listeners) listener();
  };
  const snap = () => {
    speed = progress = target;
    publish();
  };

  return {
    getSnapshot: () => snapshot,
    getSpeed: () => speed,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setPaused(paused: boolean) {
      const next = paused ? 0 : 1;
      if (next === target) return;
      target = next;
      // Reverse along the same curve. An interrupted ramp only travels the
      // remaining distance, rather than starting another full ramp.
      if (!snapshot.enabled || reduced) snap();
      else publish();
    },
    setEnabled(enabled: boolean) {
      if (snapshot.enabled === enabled) return;
      snapshot = { ...snapshot, enabled };
      if (!enabled) snap();
      for (const listener of listeners) listener();
    },
    setReducedMotion(value: boolean) {
      reduced = value;
      if (reduced) snap();
    },
    /** Called once by the scene clock. Returns ambient seconds for this frame.
     * At rest, including the disabled path, no easing work runs. */
    advance(delta: number) {
      if (delta <= 0) return 0;
      if (!snapshot.active) return delta * target;
      const duration = OVERLAY_BACKGROUND_RAMP_SECONDS;
      const remaining = Math.abs(target - progress) * duration;
      const step = Math.min(delta, remaining);
      const next =
        delta >= remaining
          ? target
          : progress + (Math.sign(target - progress) * step) / duration;
      const ambientDelta =
        duration * Math.abs(rampIntegral(next) - rampIntegral(progress)) +
        target * (delta - step);
      progress = next;
      speed = rampSpeed(progress);
      publish();
      return Math.max(0, ambientDelta);
    },
  };
}

export const overlayBackgroundMotion = createOverlayBackgroundMotion();
