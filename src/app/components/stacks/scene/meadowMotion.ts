/** Motion constants shared by the meadow shader and its frame loop. Kept pure
 * so the combined wind/pointer response can be regression-tested without
 * mounting WebGL. */
export const MEADOW_WIND = {
  amplitude: 0.21,
  speed: 1.608,
  gustKnee: 0.25,
  gustCeiling: 1,
  audioReference: 0.3,
  authoredMaxLean: 0.36,
  maxLean: 1.05,
  bootBoost: 0.2,
  mainGustRate: 0.42,
  mainGustPhase: -0.7,
  mainGustAmplitude: 0.34,
  rareGustEvery: 5,
  rareGustOffset: 3,
  rareGustSharpness: 12,
  residualGustRate: 0.17,
  residualGustPhase: 1.8,
  residualGustAmplitude: 0.1,
  flowDirectionX: -0.702,
  flowDirectionZ: -0.712,
} as const;

export const MEADOW_FLOWER_WIND = {
  response: 0.85,
  stemLength: 0.1,
  maxLean: 0.65,
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

/** Physical contacts reuse the click pulse pool as a short, compact brush.
 * Two offset radial pulses suggest travel direction without adding work to
 * the meadow's per-vertex shader loop. */
export const MEADOW_IMPACT = {
  pulseStrengthScale: 1.4,
  wakeStrengthScale: 0.75,
  directionOffset: 0.12,
  radiusScale: 0.34,
  timeScale: 1.8,
  groundTolerance: 0.18,
} as const;

export const MEADOW_TRAIL = {
  minSpeed: 0.25,
  minDistance: 0.1,
  minInterval: 0.06,
  maxGenericEmitters: 3,
  timeScale: 2.35,
} as const;

export function meadowTrailReady(
  elapsed: number,
  distance: number,
  speed: number,
) {
  return (
    speed >= MEADOW_TRAIL.minSpeed &&
    elapsed >= MEADOW_TRAIL.minInterval &&
    distance >= MEADOW_TRAIL.minDistance
  );
}

export function meadowPhysicalResponse(options: {
  normalSpeed: number;
  tangentSpeed: number;
  massKg: number;
  footprint: number;
  trailing?: boolean;
}) {
  const massWeight = Math.min(
    1.35,
    0.85 + Math.log2(1 + Math.max(0, options.massKg)) * 0.08,
  );
  const strength = Math.min(
    1,
    Math.max(
      0,
      (Math.max(0, options.normalSpeed) / 4 +
        Math.max(0, options.tangentSpeed) / 5.5) *
        massWeight,
    ),
  );
  const radius = Math.min(
    0.72,
    Math.max(0.22, 0.18 + Math.max(0, options.footprint) * 0.55),
  );
  return {
    strength,
    radius,
    timeScale: options.trailing
      ? MEADOW_TRAIL.timeScale
      : MEADOW_IMPACT.timeScale,
  };
}

export function limitMeadowWind(magnitude: number): number {
  if (magnitude <= MEADOW_WIND.gustKnee) return magnitude;
  const span = MEADOW_WIND.gustCeiling - MEADOW_WIND.gustKnee;
  return (
    MEADOW_WIND.gustKnee +
    span * (1 - Math.exp(-(magnitude - MEADOW_WIND.gustKnee) / span))
  );
}

export function meadowWindAudioLevel(amplitude: number): number {
  return Math.min(1, Math.max(0, amplitude / MEADOW_WIND.audioReference));
}

/** The meadow-wide gust envelope. Both waves are slow enough to complete over
 * tens of seconds, and this runs once per frame rather than once per vertex. */
export function sampleMeadowGust(
  time: number,
  amplitude: number = MEADOW_WIND.amplitude,
  speed: number = MEADOW_WIND.speed,
) {
  const windTime = time * speed;
  const mainPhase =
    windTime * MEADOW_WIND.mainGustRate + MEADOW_WIND.mainGustPhase;
  const main = Math.sin(mainPhase);
  const rareWindow =
    ((1 +
      Math.cos(
        (mainPhase - Math.PI / 2 - Math.PI * 2 * MEADOW_WIND.rareGustOffset) /
          MEADOW_WIND.rareGustEvery,
      )) /
      2) **
    MEADOW_WIND.rareGustSharpness;
  const boostedMain = main + rareWindow * Math.max(0, main) ** 2;
  const residual = Math.sin(
    windTime * MEADOW_WIND.residualGustRate + MEADOW_WIND.residualGustPhase,
  );
  return limitMeadowWind(
    amplitude *
      (1 +
        MEADOW_WIND.mainGustAmplitude * boostedMain +
        MEADOW_WIND.residualGustAmplitude * residual),
  );
}

const fract = (value: number) => value - Math.floor(value);

function meadowWindHash(x: number, z: number) {
  let px = fract(x * 0.1031);
  let py = fract(z * 0.1031);
  let pz = fract(x * 0.1031);
  const dot = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += dot;
  py += dot;
  pz += dot;
  return fract((px + py) * pz);
}

function meadowWindNoise(x: number, z: number) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = fract(x);
  const fz = fract(z);
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const near =
    meadowWindHash(ix, iz) * (1 - sx) + meadowWindHash(ix + 1, iz) * sx;
  const far =
    meadowWindHash(ix, iz + 1) * (1 - sx) + meadowWindHash(ix + 1, iz + 1) * sx;
  return near * (1 - sz) + far * sz;
}

/** CPU companion to the near-grass shader for petals and regression tests. */
export function sampleMeadowWind(
  x: number,
  z: number,
  time: number,
  amplitude: number = MEADOW_WIND.amplitude,
  speed: number = MEADOW_WIND.speed,
) {
  const windTime = time * speed;
  const angle =
    (meadowWindNoise(x * 0.035 + windTime * 0.025, z * 0.035) - 0.5) * 1.2 -
    2.35;
  const directionX = Math.cos(angle);
  const directionZ = Math.sin(angle);
  let localGust = meadowWindNoise(
    x * 0.22 - MEADOW_WIND.flowDirectionX * windTime * 0.55,
    z * 0.22 - MEADOW_WIND.flowDirectionZ * windTime * 0.55,
  );
  localGust *= localGust;
  const breeze = meadowWindNoise(
    x * 0.85 - MEADOW_WIND.flowDirectionX * windTime * 1.1,
    z * 0.85 - MEADOW_WIND.flowDirectionZ * windTime * 1.1,
  );
  const magnitude = limitMeadowWind(
    sampleMeadowGust(time, amplitude, speed) *
      (0.35 + 0.85 * localGust + 0.25 * breeze),
  );
  return {
    x: directionX * magnitude,
    z: directionZ * magnitude,
    magnitude,
  };
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
