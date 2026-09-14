export const HUD_TRAVEL_MAX_PX = 20;
export const HUD_MOBILE_TRAVEL_MAX_PX = 20;
export const HUD_MOUSE_MAX_PX = 12;

const DEFAULT: Readonly<{ enabled: boolean; mouseEnabled: boolean }> =
  Object.freeze({
    enabled: true,
    mouseEnabled: true,
  });

/** Session-only override. Reloading restores the enabled production default. */
export const hudCameraDriftController = (() => {
  let snapshot = DEFAULT;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setEnabled: (enabled: boolean) => {
      if (snapshot.enabled === enabled) return;
      snapshot = Object.freeze({ ...snapshot, enabled });
      for (const listener of listeners) listener();
    },
    setMouseEnabled: (mouseEnabled: boolean) => {
      if (snapshot.mouseEnabled === mouseEnabled) return;
      snapshot = Object.freeze({ ...snapshot, mouseEnabled });
      for (const listener of listeners) listener();
    },
  };
})();

/** Lean against section travel, then ease back to centre when travel stops. */
export function advanceHudCameraDrift(
  currentPx: number,
  sectionsPerSecond: number,
  deltaSeconds: number,
  maxPx = HUD_TRAVEL_MAX_PX,
): number {
  if (currentPx === 0 && sectionsPerSecond === 0) return 0;
  if (
    !Number.isFinite(sectionsPerSecond) ||
    !Number.isFinite(deltaSeconds) ||
    deltaSeconds <= 0
  )
    return currentPx;
  // A section activation or resumed tab can delay a frame. Keep easing from
  // the current offset with one normal step, rather than snapping to centre
  // or applying the entire missed interval in one visible frame.
  const stepSeconds = Math.min(deltaSeconds, 1 / 60);
  // Speed across a pause is stale. Settle gently until the next fresh sample;
  // DriftFrame still rebases its progress sample on every frame.
  const velocity = deltaSeconds > 0.1 ? 0 : sectionsPerSecond;
  // Smoothstep gives slow travel a soft onset and reaches the travel limit
  // with zero slope, avoiding a hard change when a fast swipe hits the cap.
  // Two sections per second reaches full strength; one reaches half.
  const speed = Math.min(1, Math.abs(velocity) / 2);
  const strength = speed * speed * (3 - 2 * speed);
  const target = -Math.sign(velocity) * maxPx * strength;
  const next =
    currentPx + (target - currentPx) * (1 - Math.exp(-8 * stepSeconds));
  return Math.abs(next) < 0.05 ? 0 : next;
}
