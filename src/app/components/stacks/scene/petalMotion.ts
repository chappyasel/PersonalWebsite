import { MEADOW_WIND, limitMeadowWind } from "./meadowMotion";

const TAU = Math.PI * 2;

export const PETAL_FIXED_STEP = 1 / 30;
export const PETAL_MAX_FRAME_DELTA = 0.1;
export const PETALS_PER_UNIT = 28;
/** Settle among the blade tips rather than on the terrain hidden beneath them. */
export const PETAL_GRASS_CONTACT_LIFT = 0.075;

export type PetalPhase = "waiting" | "loosening" | "airborne" | "settled";

export type PetalPoint = { x: number; y: number; z: number };

export type PetalSource = Readonly<{
  unitIndex: number;
  x: number;
  y: number;
  z: number;
  tint: number;
  depth: "foreground" | "background";
}>;

export type PetalMotion = {
  id: number;
  source: PetalSource;
  phase: PetalPhase;
  phaseStartedAt: number;
  transitionAt: number;
  recycleAt: number;
  flightsFromSource: number;
  position: PetalPoint;
  velocity: PetalPoint;
  rotation: PetalPoint;
  size: number;
  profile: number;
};

export type PetalWind = {
  x: number;
  z: number;
  magnitude: number;
};

export type PetalAdvanceOptions = {
  time: number;
  step: number;
  groundY: number;
  canRelease: boolean;
  windAmplitude?: number;
  /** Camera-side limit imposed by the shelf row at the petal's current x. */
  backstopZ?: number;
  /** Meadow-side limit for petals that start behind the shelf row. */
  frontstopZ?: number;
};

const PROFILES = [
  {
    horizontalResponse: 1.8,
    fallSpeed: 0.024,
    liftTime: 1.15,
    sideSlip: 0.025,
    flutterHz: 0.62,
    spinX: 1.35,
    spinY: 0.52,
  },
  {
    horizontalResponse: 2.35,
    fallSpeed: 0.032,
    liftTime: 0.85,
    sideSlip: 0.04,
    flutterHz: 0.86,
    spinX: 2.1,
    spinY: 0.78,
  },
  {
    horizontalResponse: 2.8,
    fallSpeed: 0.042,
    liftTime: 0.68,
    sideSlip: 0.052,
    flutterHz: 1.08,
    spinX: 3.05,
    spinY: 1.12,
  },
] as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

/** Deterministic scalar used only for authored variation, never per frame. */
export function petalNoise(id: number, salt: number) {
  const value = Math.sin(id * 127.1 + salt * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function hash2(x: number, z: number, salt: number) {
  const value = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function valueNoise2(x: number, z: number, salt: number) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, salt) * (1 - sx) + hash2(ix + 1, iz, salt) * sx;
  const b =
    hash2(ix, iz + 1, salt) * (1 - sx) + hash2(ix + 1, iz + 1, salt) * sx;
  return a * (1 - sz) + b * sz;
}

/**
 * CPU companion to the meadow shader's traveling wind field. It intentionally
 * shares the shader's spatial scales, direction range, gust cadence, and hard
 * limiter; matching individual noise texels is unnecessary because a loose
 * petal responds to the local air mass rather than copying a stem tip.
 */
export function samplePetalWind(
  x: number,
  z: number,
  time: number,
  amplitude: number = MEADOW_WIND.amplitude,
): PetalWind {
  const windTime = time * MEADOW_WIND.speed;
  const angle =
    (valueNoise2(x * 0.035 + windTime * 0.025, z * 0.035, 17) - 0.5) * 1.2 -
    2.35;
  const directionX = Math.cos(angle);
  const directionZ = Math.sin(angle);
  let gust = valueNoise2(
    x * 0.22 - directionX * windTime * 0.55,
    z * 0.22 - directionZ * windTime * 0.55,
    31,
  );
  gust *= gust;
  const breeze = valueNoise2(
    x * 0.85 - directionX * windTime * 1.1,
    z * 0.85 - directionZ * windTime * 1.1,
    47,
  );
  const magnitude = limitMeadowWind(
    amplitude * (0.35 + 0.85 * gust + 0.25 * breeze),
  );
  return {
    x: directionX * magnitude,
    z: directionZ * magnitude,
    magnitude,
  };
}

function waitingDelay(motion: PetalMotion, cycle: number) {
  return 5 + petalNoise(motion.id, 41 + cycle * 13) * 14;
}

function beginWaiting(motion: PetalMotion, time: number) {
  motion.phase = "waiting";
  motion.phaseStartedAt = time;
  motion.transitionAt = time + waitingDelay(motion, motion.flightsFromSource);
  motion.recycleAt = Number.POSITIVE_INFINITY;
  motion.flightsFromSource = 0;
  motion.position.x = motion.source.x;
  motion.position.y = motion.source.y;
  motion.position.z = motion.source.z;
  motion.velocity.x = 0;
  motion.velocity.y = 0;
  motion.velocity.z = 0;
}

export function releasePetal(
  motion: PetalMotion,
  time: number,
  impulseX = 0,
  impulseZ = 0,
  strength = 0,
) {
  motion.phase = "airborne";
  motion.phaseStartedAt = time;
  motion.transitionAt = Number.POSITIVE_INFINITY;
  motion.recycleAt = Number.POSITIVE_INFINITY;
  motion.flightsFromSource += 1;
  const wind = samplePetalWind(motion.position.x, motion.position.z, time);
  const jitter = petalNoise(motion.id, motion.flightsFromSource * 29) - 0.5;
  motion.velocity.x = wind.x * 0.65 + impulseX * strength + jitter * 0.025;
  motion.velocity.y = 0.105 + strength * 0.16 + Math.abs(jitter) * 0.035;
  motion.velocity.z = wind.z * 0.65 + impulseZ * strength - jitter * 0.018;
}

function settlePetal(motion: PetalMotion, time: number, groundY: number) {
  motion.phase = "settled";
  motion.phaseStartedAt = time;
  motion.position.y = groundY + PETAL_GRASS_CONTACT_LIFT;
  motion.velocity.x = 0;
  motion.velocity.y = 0;
  motion.velocity.z = 0;
  motion.rotation.x =
    -Math.PI / 2 +
    (petalNoise(motion.id, motion.flightsFromSource * 53) - 0.5) * 0.24;
  motion.rotation.y = petalNoise(motion.id, 59) * TAU;
  motion.rotation.z = (petalNoise(motion.id, 61) - 0.5) * 0.3;
  const rest = 10 + petalNoise(motion.id, 67 + motion.flightsFromSource) * 12;
  motion.transitionAt = time + rest;
  motion.recycleAt = motion.transitionAt + 7;
}

export function createPetalMotion(
  id: number,
  source: PetalSource,
  time = 0,
  initialActivePerUnit = 2,
): PetalMotion {
  const motion: PetalMotion = {
    id,
    source,
    phase: "waiting",
    phaseStartedAt: time,
    transitionAt: time,
    recycleAt: Number.POSITIVE_INFINITY,
    flightsFromSource: 0,
    position: { x: source.x, y: source.y, z: source.z },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: {
      x: petalNoise(id, 3) * TAU,
      y: petalNoise(id, 5) * TAU,
      z: petalNoise(id, 7) * TAU,
    },
    size: 0.82 + petalNoise(id, 11) * 0.34,
    profile: id % PROFILES.length,
  };

  const slot = id % PETALS_PER_UNIT;
  const depthDirection = source.depth === "foreground" ? 1 : -1;
  if (slot === 0) {
    motion.position.x += (petalNoise(id, 71) - 0.5) * 0.16;
    motion.position.y += 0.09 + petalNoise(id, 73) * 0.05;
    motion.position.z += petalNoise(id, 79) * 0.12 * depthDirection;
    releasePetal(motion, time - 0.8);
  } else if (slot === 1) {
    motion.phase = "loosening";
    motion.phaseStartedAt = time;
    motion.transitionAt = time + 0.7 + petalNoise(id, 83) * 0.5;
  } else if (slot < initialActivePerUnit) {
    motion.position.x += (petalNoise(id, 71) - 0.5) * 0.24;
    motion.position.y += 0.06 + petalNoise(id, 73) * 0.1;
    motion.position.z += petalNoise(id, 79) * 0.2 * depthDirection;
    releasePetal(motion, time - petalNoise(id, 91) * 2.5);
  } else {
    motion.transitionAt = time + 3 + petalNoise(id, 89) * 12;
  }
  return motion;
}

export function advancePetal(
  motion: PetalMotion,
  options: PetalAdvanceOptions,
) {
  const { time, step, groundY, canRelease } = options;
  const profile = PROFILES[motion.profile]!;

  if (motion.phase === "waiting") {
    if (canRelease && time >= motion.transitionAt) {
      motion.phase = "loosening";
      motion.phaseStartedAt = time;
      motion.transitionAt = time + 0.65 + petalNoise(motion.id, 97) * 0.45;
    }
    return;
  }

  if (motion.phase === "loosening") {
    const duration = Math.max(
      0.001,
      motion.transitionAt - motion.phaseStartedAt,
    );
    const progress = clamp01((time - motion.phaseStartedAt) / duration);
    const wind = samplePetalWind(
      motion.source.x,
      motion.source.z,
      time,
      options.windAmplitude,
    );
    const wave = Math.sin(time * 8.5 + motion.id * 2.3);
    motion.position.x = motion.source.x + wind.x * progress * 0.12;
    motion.position.y = motion.source.y + progress * 0.012 + wave * 0.002;
    motion.position.z = motion.source.z + wind.z * progress * 0.12;
    motion.rotation.x += profile.spinX * step * 0.16;
    motion.rotation.y += profile.spinY * step * 0.12;
    if (time >= motion.transitionAt) releasePetal(motion, time);
    return;
  }

  if (motion.phase === "settled") {
    const wind = samplePetalWind(
      motion.position.x,
      motion.position.z,
      time,
      options.windAmplitude,
    );
    if (
      canRelease &&
      motion.flightsFromSource < 2 &&
      time >= motion.transitionAt &&
      wind.magnitude >= MEADOW_WIND.amplitude * 0.82
    ) {
      releasePetal(motion, time, wind.x, wind.z, 0.55);
    } else if (time >= motion.recycleAt) {
      beginWaiting(motion, time);
    }
    return;
  }

  const age = Math.max(0, time - motion.phaseStartedAt);
  const wind = samplePetalWind(
    motion.position.x,
    motion.position.z,
    time,
    options.windAmplitude,
  );
  const flutter = Math.sin(time * TAU * profile.flutterHz + motion.id * 1.731);
  const perpendicularX = -wind.z / Math.max(1e-5, wind.magnitude);
  const perpendicularZ = wind.x / Math.max(1e-5, wind.magnitude);
  const targetX = wind.x * 1.28 + perpendicularX * profile.sideSlip * flutter;
  const targetZ = wind.z * 1.28 + perpendicularZ * profile.sideSlip * flutter;
  motion.velocity.x +=
    (targetX - motion.velocity.x) * profile.horizontalResponse * step;
  motion.velocity.z +=
    (targetZ - motion.velocity.z) * profile.horizontalResponse * step;

  const lift = clamp01(1 - age / profile.liftTime);
  const broadside = 0.5 + 0.5 * Math.cos(motion.rotation.x);
  const targetY =
    0.055 * lift - profile.fallSpeed * (0.45 + 0.55 * (1 - broadside));
  motion.velocity.y += (targetY - motion.velocity.y) * 1.35 * step;
  motion.velocity.y += flutter * 0.006 * step;

  motion.position.x += motion.velocity.x * step;
  motion.position.y += motion.velocity.y * step;
  motion.position.z += motion.velocity.z * step;
  if (
    options.backstopZ !== undefined &&
    motion.position.z < options.backstopZ
  ) {
    motion.position.z = options.backstopZ;
    motion.velocity.z = Math.max(0.015, -motion.velocity.z * 0.22);
  }
  if (
    options.frontstopZ !== undefined &&
    motion.position.z > options.frontstopZ
  ) {
    motion.position.z = options.frontstopZ;
    motion.velocity.z = Math.min(-0.015, -motion.velocity.z * 0.22);
  }
  motion.rotation.x += profile.spinX * (0.72 + wind.magnitude * 2.2) * step;
  motion.rotation.y += profile.spinY * (0.8 + Math.abs(flutter) * 0.35) * step;
  motion.rotation.z = flutter * 0.24;

  if (
    (motion.position.y <= groundY + PETAL_GRASS_CONTACT_LIFT && age > 1.1) ||
    age > 18
  ) {
    settlePetal(motion, time, groundY);
  }
}

export function disturbPetal(
  motion: PetalMotion,
  time: number,
  x: number,
  z: number,
  radius: number,
  directionX: number,
  directionZ: number,
  strength: number,
) {
  const dx = motion.position.x - x;
  const dz = motion.position.z - z;
  const distance = Math.hypot(dx, dz);
  if (distance > radius || strength <= 0) return false;
  const falloff = smoothstep(1 - distance / Math.max(radius, 1e-5));
  const impulse = strength * falloff;
  const outwardX = distance > 1e-5 ? dx / distance : directionX;
  const outwardZ = distance > 1e-5 ? dz / distance : directionZ;
  const pushX = directionX * 0.65 + outwardX * 0.35;
  const pushZ = directionZ * 0.65 + outwardZ * 0.35;

  return impulsePetal(motion, time, pushX, pushZ, impulse);
}

/** A point impulse with no preferred world direction, used by click rings. */
export function burstPetal(
  motion: PetalMotion,
  time: number,
  x: number,
  z: number,
  radius: number,
  strength: number,
) {
  const dx = motion.position.x - x;
  const dz = motion.position.z - z;
  const distance = Math.hypot(dx, dz);
  if (distance > radius || strength <= 0) return false;
  const falloff = smoothstep(1 - distance / Math.max(radius, 1e-5));
  const angle =
    petalNoise(motion.id, motion.flightsFromSource * 37 + 109) * TAU;
  return impulsePetal(
    motion,
    time,
    distance > 1e-5 ? dx / distance : Math.cos(angle),
    distance > 1e-5 ? dz / distance : Math.sin(angle),
    strength * falloff,
  );
}

/** Apply an already spatially-filtered gust, shockwave, or impact impulse. */
export function impulsePetal(
  motion: PetalMotion,
  time: number,
  directionX: number,
  directionZ: number,
  strength: number,
) {
  if (strength <= 0) return false;
  const directionLength = Math.hypot(directionX, directionZ);
  const pushX = directionLength > 1e-5 ? directionX / directionLength : 0;
  const pushZ = directionLength > 1e-5 ? directionZ / directionLength : -1;

  if (motion.phase !== "airborne") {
    if (motion.phase === "waiting" || motion.phase === "loosening") {
      motion.position.x = motion.source.x;
      motion.position.y = motion.source.y;
      motion.position.z = motion.source.z;
    }
    releasePetal(motion, time, pushX, pushZ, 0.35 + strength * 1.4);
  } else {
    motion.velocity.x += pushX * strength * 0.65;
    motion.velocity.y += strength * 0.18;
    motion.velocity.z += pushZ * strength * 0.65;
  }
  return true;
}

export function petalShockwaveImpulse(
  distance: number,
  waveRadius: number,
  band: number,
  waveStrength: number,
) {
  const distanceFromWave = Math.abs(distance - waveRadius);
  if (band <= 0 || distanceFromWave > band || waveStrength <= 0) return 0;
  return waveStrength * (1 - distanceFromWave / band) * 1.35;
}

export function petalRenderScale(motion: PetalMotion, time: number) {
  if (motion.phase === "waiting") return 0;
  if (motion.phase === "loosening") {
    const duration = Math.max(
      0.001,
      motion.transitionAt - motion.phaseStartedAt,
    );
    return motion.size * smoothstep((time - motion.phaseStartedAt) / duration);
  }
  if (motion.phase === "settled" && Number.isFinite(motion.recycleAt)) {
    return motion.size * smoothstep((motion.recycleAt - time) / 1.4);
  }
  return motion.size;
}
