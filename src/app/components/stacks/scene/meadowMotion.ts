/** Motion constants shared by the meadow shader and its frame loop. Kept pure
 * so the combined wind/pointer response can be regression-tested without
 * mounting WebGL. */
export const MEADOW_WIND = {
  amplitude: 0.14,
  speed: 0.68,
  gustKnee: 0.2,
  gustCeiling: 0.25,
  maxLean: 0.28,
  bootBoost: 0.25,
} as const;

export const MEADOW_POKE = {
  radius: 0.52,
  hoverStrength: 0.2,
  dragSpeedScale: 1.5,
  dragDirectionLambda: 11,
  pointerMoveEpsilon: 0.0001,
  clickStrength: 0.17,
  pulseDuration: 0.9,
  pulseDecay: 0.5,
  pulseStartRadius: 0.14,
  pulseEndRadius: 1.1,
  pulseWidth: 0.22,
  windSuppression: 0.82,
  grassPositionLambda: 6,
  flowerPositionLambda: 2.5,
  grassAttackLambda: 14,
  grassReleaseLambda: 3.4,
  flowerAttackLambda: 4,
  flowerReleaseLambda: 1.4,
} as const;

export function limitMeadowWind(magnitude: number): number {
  if (magnitude <= MEADOW_WIND.gustKnee) return magnitude;
  const span = MEADOW_WIND.gustCeiling - MEADOW_WIND.gustKnee;
  return (
    MEADOW_WIND.gustKnee +
    span * (1 - Math.exp(-(magnitude - MEADOW_WIND.gustKnee) / span))
  );
}

export function meadowDragSample(
  previousX: number,
  previousZ: number,
  currentX: number,
  currentZ: number,
  delta: number,
  reach: number,
) {
  const dx = currentX - previousX;
  const dz = currentZ - previousZ;
  const distance = Math.hypot(dx, dz);
  if (distance <= 1e-8 || delta <= 0 || reach <= 0)
    return { directionX: 0, directionZ: 0, strength: 0 };
  const speed = distance / delta;
  return {
    directionX: dx / distance,
    directionZ: dz / distance,
    strength:
      MEADOW_POKE.hoverStrength *
      (1 - Math.exp(-speed / MEADOW_POKE.dragSpeedScale)) *
      reach,
  };
}

export function meadowPulseState(age: number, reach: number) {
  const t = Math.min(1, Math.max(0, age / MEADOW_POKE.pulseDuration));
  // Cover most of the distance early so it reads as a shockwave, then coast
  // while the initially full-strength impulse fades away.
  const travel = 1 - (1 - t) ** 3;
  return {
    radius:
      MEADOW_POKE.pulseStartRadius +
      (MEADOW_POKE.pulseEndRadius - MEADOW_POKE.pulseStartRadius) * travel,
    strength:
      age < 0 || age >= MEADOW_POKE.pulseDuration
        ? 0
        : MEADOW_POKE.clickStrength *
          Math.exp(-age / MEADOW_POKE.pulseDecay) *
          reach,
  };
}
