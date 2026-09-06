// Pure behavior for the Tended Meadow's flying wildlife. No React or Three
// imports: the renderer supplies elapsed time and theme/light state, and this
// module returns world-space intent that Vitest can exercise without a canvas.
import { MOTH_LIGHT_PROFILES } from "./meadowLights";

const TAU = Math.PI * 2;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
};

const modulo = (value: number, divisor: number) =>
  ((value % divisor) + divisor) % divisor;

export const BAT_FLIGHT = {
  firstRevealSeconds: 10.5,
  periodSeconds: 53,
  visibleFraction: 0.11,
} as const;

export type BatFrame = {
  opacity: number;
  progress: number;
  travelProgress: number;
  flap: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  roll: number;
  yaw: number;
};

export function createBatFrame(): BatFrame {
  return {
    opacity: 0,
    progress: 0,
    travelProgress: 0,
    flap: 0,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    roll: 0,
    yaw: 0,
  };
}

function hideBat(out: BatFrame) {
  out.opacity = 0;
  out.progress = 0;
  out.travelProgress = 0;
  out.flap = 0;
  out.offsetX = 0;
  out.offsetY = 0;
  out.offsetZ = 0;
  out.roll = 0;
  out.yaw = 0;
  return out;
}

/** One rare global-sky crossing. `progress` remains 0..1 only while visible. */
export function batFlightFrame(
  elapsedSeconds: number,
  nightAmount: number,
  out: BatFrame,
): BatFrame {
  if (elapsedSeconds < BAT_FLIGHT.firstRevealSeconds) {
    return hideBat(out);
  }
  const local = elapsedSeconds - BAT_FLIGHT.firstRevealSeconds;
  const u = modulo(local / BAT_FLIGHT.periodSeconds, 1);
  if (u >= BAT_FLIGHT.visibleFraction) {
    return hideBat(out);
  }
  const progress = u / BAT_FLIGHT.visibleFraction;
  const flightIndex = Math.floor(local / BAT_FLIGHT.periodSeconds);
  const routePhase = flightIndex * 2.399963;
  const routeAngle = progress * TAU;
  const pacePhase = routePhase * 0.47 + 1.2;
  const paceWave = Math.sin(routeAngle + routePhase) - Math.sin(routePhase);
  const paceRipple = Math.sin(routeAngle * 2 + pacePhase) - Math.sin(pacePhase);
  const travelProgress = progress + 0.026 * paceWave + 0.009 * paceRipple;
  const envelope =
    smoothstep(0, 0.08, progress) *
    (1 - smoothstep(0.84, 1, progress)) *
    clamp01(nightAmount);
  out.opacity = envelope;
  out.progress = progress;
  out.travelProgress = travelProgress;
  const flapPhase =
    elapsedSeconds * TAU * 3.65 +
    0.42 * Math.sin(elapsedSeconds * 0.73) +
    0.12 * Math.sin(elapsedSeconds * 1.81 + routePhase);
  const flapStrength =
    0.68 +
    0.32 * smoothstep(-0.65, 0.75, Math.sin(routeAngle * 1.5 + routePhase));
  out.flap = flapStrength * Math.sin(flapPhase);
  out.offsetX =
    0.1 * Math.sin(routeAngle * 1.5 + routePhase + 0.4) +
    0.04 * Math.sin(routeAngle * 3.5 + routePhase * 0.6 + 2.1);
  out.offsetY =
    0.24 * Math.sin(routeAngle + routePhase + 1.1) +
    0.085 * Math.sin(routeAngle * 2.5 + routePhase * 0.7 + 0.2) +
    0.045 * Math.cos(flapPhase);
  out.offsetZ =
    0.32 * Math.sin(routeAngle * 0.75 + routePhase + 2.4) +
    0.12 * Math.sin(routeAngle * 2 + routePhase * 0.8 + 0.7);

  // The silhouette leans into the same path that moves it. These analytic
  // slopes keep the pose deterministic and avoid storing prior-frame state.
  const dx =
    12.8 *
      (1 +
        0.026 * TAU * Math.cos(routeAngle + routePhase) +
        0.018 * TAU * Math.cos(routeAngle * 2 + pacePhase)) +
    0.15 * TAU * Math.cos(routeAngle * 1.5 + routePhase + 0.4) +
    0.14 * TAU * Math.cos(routeAngle * 3.5 + routePhase * 0.6 + 2.1);
  const dy =
    0.68 * Math.PI * Math.cos(progress * Math.PI) +
    0.24 * TAU * Math.cos(routeAngle + routePhase + 1.1) +
    0.2125 * TAU * Math.cos(routeAngle * 2.5 + routePhase * 0.7 + 0.2);
  const dz =
    -0.7 * Math.PI * Math.cos(progress * Math.PI) +
    0.24 * TAU * Math.cos(routeAngle * 0.75 + routePhase + 2.4) +
    0.24 * TAU * Math.cos(routeAngle * 2 + routePhase * 0.8 + 0.7);
  out.roll = Math.max(-0.2, Math.min(0.2, (dy / dx) * 0.65));
  out.yaw = Math.max(-0.18, Math.min(0.18, (-dz / dx) * 0.7));
  return out;
}

export const MOTH_COUNT = 12;
export const MOTH_FLIGHT = MOTH_LIGHT_PROFILES.floor;

export type MothFrame = {
  x: number;
  y: number;
  z: number;
  scale: number;
  opacity: number;
  yaw: number;
  flap: number;
  illumination: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  accelerationX: number;
  accelerationY: number;
  accelerationZ: number;
};

export function createMothFrame(): MothFrame {
  return {
    x: 0,
    y: 0,
    z: 0,
    scale: 0,
    opacity: 0,
    yaw: 0,
    flap: 0,
    illumination: 0,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    accelerationX: 0,
    accelerationY: 0,
    accelerationZ: 0,
  };
}

const MOTH_WAVE = { value: 0, velocity: 0, acceleration: 0 };

/** The one-sided radial path stays this far from the lamp/pole axis. */
export const MOTH_FORWARD_CLEARANCE = 0.12;

/**
 * How dark a moth gets at the very edge of the lit cone, and how far past that
 * edge the falloff keeps going.
 *
 * The floor was 0.32 and the falloff stopped at the cone radius, which was a
 * fair description of a model whose moths could not leave the light: the path
 * was constructed bounded by `maxRadius`, so the only gradient anyone ever saw
 * was the shallow interior one. Now that a moth roams by intent and drifts
 * proud of the beam (ADR 0007), leaving the light has to READ as leaving the
 * light — so the floor drops toward nothing and the curve continues out into
 * the dark.
 */
export const MOTH_ILLUMINATION = {
  floor: 0.05,
  /** Multiples of the local cone radius over which the edge fades to zero. */
  outerFalloff: 1.1,
} as const;

/**
 * Brightness of a moth at a given place in its lamp's cone.
 *
 * Radial distance from the axis and depth down the beam, exactly as before —
 * this was always a real model, and the only thing that changed is that the
 * insect can now reach the parts of it that were unreachable.
 */
export function mothIllumination(
  radialDistance: number,
  localConeRadius: number,
  axialDistance: number,
  nearDistance: number,
  axialRange: number,
  lampAmount: number,
) {
  const radius = Math.max(0.001, localConeRadius);
  const inside = clamp01(1 - radialDistance / radius);
  // Past the cone edge the floor itself fades, so a moth in the dark goes dark
  // rather than settling at a constant dim glow.
  const outside = clamp01(
    1 -
      (radialDistance - radius) /
        Math.max(0.001, radius * MOTH_ILLUMINATION.outerFalloff),
  );
  const depthLight =
    1 -
    0.35 *
      clamp01((axialDistance - nearDistance) / Math.max(0.001, axialRange));
  return (
    clamp01(lampAmount) *
    depthLight *
    outside *
    (MOTH_ILLUMINATION.floor + inside * (1 - MOTH_ILLUMINATION.floor))
  );
}

function mothSines(
  t: number,
  amplitude1: number,
  frequency1: number,
  phase1: number,
  amplitude2: number,
  frequency2: number,
  phase2: number,
) {
  const omega1 = TAU * frequency1;
  const omega2 = TAU * frequency2;
  const angle1 = omega1 * t + phase1;
  const angle2 = omega2 * t + phase2;
  const sine1 = Math.sin(angle1);
  const sine2 = Math.sin(angle2);
  MOTH_WAVE.value = amplitude1 * sine1 + amplitude2 * sine2;
  MOTH_WAVE.velocity =
    amplitude1 * omega1 * Math.cos(angle1) +
    amplitude2 * omega2 * Math.cos(angle2);
  MOTH_WAVE.acceleration =
    -(amplitude1 * omega1 * omega1 * sine1) -
    amplitude2 * omega2 * omega2 * sine2;
}

/** Fixture-local version of the butterfly flight model: two incommensurate
 * sine waves per axis provide position plus analytic velocity/acceleration.
 * Local negative Y is distance down the cone; X/Z are its radial plane. */
export function mothFrame(
  index: number,
  elapsedSeconds: number,
  lampAmount: number,
  nearDistance: number,
  farDistance: number,
  maxRadius: number,
  out: MothFrame,
  openAirXStrength = 0,
): MothFrame {
  const phase = index * TAU * 0.381966;
  const variation = modulo(index, 5);
  mothSines(
    elapsedSeconds,
    maxRadius * 0.36,
    0.061 + variation * 0.0021,
    phase,
    maxRadius * 0.2,
    0.137 + variation * 0.0037,
    phase * 1.71 + 0.8,
  );
  const rawX = MOTH_WAVE.value;
  const rawVelocityX = MOTH_WAVE.velocity;
  const rawAccelerationX = MOTH_WAVE.acceleration;
  mothSines(
    elapsedSeconds,
    maxRadius * 0.53,
    0.073 + variation * 0.0019,
    phase * 0.83 + 1.4,
    maxRadius * 0.35,
    0.159 + variation * 0.0031,
    phase * 1.37 + 2.3,
  );
  const rawZ = MOTH_WAVE.value;
  const rawVelocityZ = MOTH_WAVE.velocity;
  const rawAccelerationZ = MOTH_WAVE.acceleration;
  const axialMiddle = (nearDistance + farDistance) * 0.5;
  const axialAmplitude = (farDistance - nearDistance) * 0.47;
  mothSines(
    elapsedSeconds,
    axialAmplitude * 0.76,
    0.047 + variation * 0.0013,
    phase * 0.61 + 0.4,
    axialAmplitude * 0.24,
    0.119 + variation * 0.0023,
    phase * 1.93 + 1.7,
  );
  out.y = -(axialMiddle + MOTH_WAVE.value);
  out.velocityY = -MOTH_WAVE.velocity;
  out.accelerationY = -MOTH_WAVE.acceleration;
  const axialRange = Math.max(0.001, farDistance - nearDistance);
  const axialDistance = -out.y;
  const coneWidth =
    0.22 + 0.78 * clamp01((axialDistance - nearDistance) / axialRange);
  const coneWidthVelocity = (0.78 * -out.velocityY) / axialRange;
  const coneWidthAcceleration = (0.78 * -out.accelerationY) / axialRange;
  out.x = rawX * coneWidth;
  out.velocityX = rawVelocityX * coneWidth + rawX * coneWidthVelocity;
  out.accelerationX =
    rawAccelerationX * coneWidth +
    2 * rawVelocityX * coneWidthVelocity +
    rawX * coneWidthAcceleration;
  const localConeRadius = Math.max(0.001, maxRadius * coneWidth);
  const localConeRadiusVelocity = maxRadius * coneWidthVelocity;
  const localConeRadiusAcceleration = maxRadius * coneWidthAcceleration;
  if (openAirXStrength > 0) {
    const symmetricScale = 1 - 0.5 * openAirXStrength;
    const radiusBias = 0.3 * openAirXStrength;
    out.x = out.x * symmetricScale + localConeRadius * radiusBias;
    out.velocityX =
      out.velocityX * symmetricScale + localConeRadiusVelocity * radiusBias;
    out.accelerationX =
      out.accelerationX * symmetricScale +
      localConeRadiusAcceleration * radiusBias;
  }
  const availableForwardRadius = Math.max(
    0.001,
    localConeRadius - MOTH_FORWARD_CLEARANCE,
  );
  const normalizedZ = rawZ / (maxRadius * 0.88);
  const normalizedVelocityZ = rawVelocityZ / (maxRadius * 0.88);
  const normalizedAccelerationZ = rawAccelerationZ / (maxRadius * 0.88);
  const forwardMix = 0.5 + 0.22 * normalizedZ;
  const forwardMixVelocity = 0.22 * normalizedVelocityZ;
  const forwardMixAcceleration = 0.22 * normalizedAccelerationZ;
  out.z = MOTH_FORWARD_CLEARANCE + availableForwardRadius * forwardMix;
  out.velocityZ =
    localConeRadiusVelocity * forwardMix +
    availableForwardRadius * forwardMixVelocity;
  out.accelerationZ =
    localConeRadiusAcceleration * forwardMix +
    2 * localConeRadiusVelocity * forwardMixVelocity +
    availableForwardRadius * forwardMixAcceleration;
  out.illumination = mothIllumination(
    Math.hypot(out.x, out.z),
    localConeRadius,
    axialDistance,
    nearDistance,
    axialRange,
    lampAmount,
  );
  out.scale =
    0.82 + 0.12 * Math.sin(elapsedSeconds * (0.53 + variation * 0.021) + phase);
  out.opacity = clamp01(lampAmount);
  out.yaw = Math.atan2(out.velocityX, out.velocityZ);
  const climb = smoothstep(-0.09, 0.08, out.velocityY);
  const flapPhase = elapsedSeconds * TAU * (6.1 + variation * 0.11) + phase;
  out.flap = (0.38 + 0.62 * climb) * Math.sin(flapPhase);
  return out;
}
