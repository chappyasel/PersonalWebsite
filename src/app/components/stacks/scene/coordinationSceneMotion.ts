/** The CR orb speeds up ambient scene time without changing UI or gestures. */
export const COORDINATION_SCENE_SPEED = 2;
const RESPONSE = 5;

export function createCoordinationSceneMotion() {
  let snapshot = { enabled: true };
  let speed = 1;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setEnabled(enabled: boolean) {
      if (enabled === snapshot.enabled) return;
      snapshot = { enabled };
      if (!enabled) speed = 1;
      for (const listener of listeners) listener();
    },
    /** Average speed for the frame, so elapsed time and simulation agree. */
    advance(delta: number, engaged: boolean, motionAllowed = true) {
      if (!snapshot.enabled || !motionAllowed) {
        speed = 1;
        return 1;
      }
      const target = engaged ? COORDINATION_SCENE_SPEED : 1;
      if (speed === target || delta <= 0) return speed;
      const decay = Math.exp(-RESPONSE * delta);
      const average =
        target + ((speed - target) * (1 - decay)) / (RESPONSE * delta);
      speed = target + (speed - target) * decay;
      if (Math.abs(speed - target) < 0.0001) speed = target;
      return average;
    },
  };
}

export const coordinationSceneMotion = createCoordinationSceneMotion();
