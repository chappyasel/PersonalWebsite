/**
 * One allocation-free scene shockwave. Publishers replace the stable snapshot;
 * consumers remember the revision they last handled and then animate locally.
 */

export type SceneImpulsePalette = "coordination";

export type SceneImpulse = {
  sourceId: string | null;
  x: number;
  y: number;
  z: number;
  radius: number;
  strength: number;
  palette: SceneImpulsePalette | null;
  revision: number;
};

export type SceneImpulseMotion = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
};

export type ScenePoint = Readonly<{ x: number; y: number; z: number }>;

const snapshot: SceneImpulse = {
  sourceId: null,
  x: 0,
  y: 0,
  z: 0,
  radius: 0,
  strength: 0,
  palette: null,
  revision: 0,
};

const ZERO_KICK = Object.freeze({ x: 0, y: 0, z: 0 });
const MAX_SCENE_IMPULSE_STRENGTH = 2;
const MOTION_SPRING = 52;
const MOTION_DAMPING = 10;
const MOTION_EPSILON = 0.000_05;
export const SCENE_IMPULSE_LIGHT_DURATION = 1.6;
export const SCENE_IMPULSE_SKY_DURATION = 2.2;

export function getSceneImpulse(): Readonly<SceneImpulse> {
  return snapshot;
}

export function publishSceneImpulse(
  impulse: Omit<SceneImpulse, "revision">,
): Readonly<SceneImpulse> {
  snapshot.sourceId = impulse.sourceId;
  snapshot.x = impulse.x;
  snapshot.y = impulse.y;
  snapshot.z = impulse.z;
  snapshot.radius = Math.max(0, impulse.radius);
  snapshot.strength = Math.max(
    0,
    Math.min(MAX_SCENE_IMPULSE_STRENGTH, impulse.strength),
  );
  snapshot.palette = impulse.palette;
  snapshot.revision += 1;
  return snapshot;
}

export function resetSceneImpulse() {
  snapshot.sourceId = null;
  snapshot.radius = 0;
  snapshot.strength = 0;
  snapshot.palette = null;
  snapshot.revision += 1;
}

/** Scalar falloff for non-directional responses such as lamps and dust. */
export function sceneImpulseStrengthAt(
  impulse: Readonly<SceneImpulse>,
  point: ScenePoint,
): number {
  if (impulse.strength <= 0 || impulse.radius <= 0) return 0;
  const distance = Math.hypot(
    point.x - impulse.x,
    point.y - impulse.y,
    point.z - impulse.z,
  );
  if (distance >= impulse.radius) return 0;
  const proximity = 1 - distance / impulse.radius;
  return impulse.strength * proximity ** 0.65;
}

/** One electrical-looking response: a sharp brownout, a few irregular
 * attempts to relight, then a complete recovery. */
export function sceneImpulseLightScale(age: number, strength: number): number {
  const boundedStrength = Math.max(0, Math.min(1, strength));
  if (boundedStrength === 0 || age < 0 || age >= SCENE_IMPULSE_LIGHT_DURATION)
    return 1;
  const dropout =
    age < 0.08
      ? 0.985
      : age < 0.145
        ? 0.18
        : age < 0.235
          ? 0.94
          : age < 0.325
            ? 0.12
            : age < 0.45
              ? 0.88
              : null;
  if (dropout !== null) return Math.max(0.015, 1 - boundedStrength * dropout);
  const recovery = 1 - (age - 0.45) / (SCENE_IMPULSE_LIGHT_DURATION - 0.45);
  const coarse = 0.5 + 0.5 * Math.sin(age * 91 + 0.8);
  const chatter = 0.5 + 0.5 * Math.sin(age * 211 + 2.1);
  const gatedDropout = coarse * chatter > 0.34 ? 0.78 : 0.08;
  return Math.max(
    0.02,
    Math.min(1, 1 - boundedStrength * recovery * gatedDropout),
  );
}

/** A global, brief failure of the sky rather than a local light brownout.
 * Hard alternating exposures sell the impossible scale of the disturbance;
 * the irregular tail converges exactly to the authored sky. */
export function sceneImpulseSkyScale(age: number, strength: number): number {
  const boundedStrength = Math.max(0, Math.min(1, strength));
  if (boundedStrength === 0 || age < 0 || age >= SCENE_IMPULSE_SKY_DURATION)
    return 1;
  const exposure =
    age < 0.045
      ? 0.06
      : age < 0.095
        ? 1.68
        : age < 0.155
          ? 0.1
          : age < 0.235
            ? 1.52
            : age < 0.315
              ? 0.14
              : age < 0.42
                ? 1.38
                : age < 0.54
                  ? 0.28
                  : null;
  if (exposure !== null) return 1 + (exposure - 1) * boundedStrength;
  const recovery = 1 - (age - 0.54) / (SCENE_IMPULSE_SKY_DURATION - 0.54);
  const coarse = 0.5 + 0.5 * Math.sin(age * 67 + 0.4);
  const chatter = 0.5 + 0.5 * Math.sin(age * 173 + 1.7);
  const recoveringExposure =
    coarse * chatter > 0.38 ? 0.24 : coarse > 0.72 ? 1.3 : 0.9;
  return (
    1 +
    (recoveringExposure - 1) * boundedStrength * Math.max(0, recovery) ** 1.2
  );
}

function stableDirection(id: string) {
  let value = 2_166_136_261;
  for (let index = 0; index < id.length; index += 1) {
    value ^= id.charCodeAt(index);
    value = Math.imul(value, 16_777_619);
  }
  return ((value >>> 0) / 4_294_967_295) * Math.PI * 2;
}

/** Resolve the outward direction used to throw an insect off a held support.
 * Unlike prop motion, this is deliberately event-wide: every attached insect
 * must release on the shockwave, including one beyond the visual ring. */
export function sceneImpulseInsectDeparture(
  impulse: Readonly<SceneImpulse>,
  point: ScenePoint,
  targetId: string,
  out: { x: number; y: number; z: number },
): boolean {
  if (impulse.strength <= 0 || impulse.palette === null) return false;
  let dx = point.x - impulse.x;
  let dy = point.y - impulse.y;
  let dz = point.z - impulse.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= 1e-5) {
    const angle = stableDirection(targetId);
    dx = Math.cos(angle);
    dy = 0.25;
    dz = Math.sin(angle);
  }
  const inverseLength = 1 / Math.max(1e-5, Math.hypot(dx, dy, dz));
  out.x = dx * inverseLength;
  out.y = dy * inverseLength;
  out.z = dz * inverseLength;
  return true;
}

/** Resolve the one-time velocity imparted to a nearby prop. */
export function sceneImpulseKick(
  impulse: Readonly<SceneImpulse>,
  point: ScenePoint,
  targetId: string,
): Readonly<{ x: number; y: number; z: number }> {
  if (
    impulse.sourceId === targetId ||
    impulse.strength <= 0 ||
    impulse.radius <= 0
  )
    return ZERO_KICK;
  const dx = point.x - impulse.x;
  const dy = point.y - impulse.y;
  const dz = point.z - impulse.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance >= impulse.radius) return ZERO_KICK;
  const horizontal = Math.hypot(dx, dz);
  const angle = horizontal <= 1e-5 ? stableDirection(targetId) : 0;
  const directionX = horizontal > 1e-5 ? dx / horizontal : Math.cos(angle);
  const directionZ = horizontal > 1e-5 ? dz / horizontal : Math.sin(angle);
  const proximity = 1 - distance / impulse.radius;
  const magnitude = impulse.strength * (0.24 + proximity * proximity * 0.72);
  return {
    x: directionX * magnitude,
    y: magnitude * (0.2 + Math.max(0, dy / Math.max(distance, 1e-5)) * 0.1),
    z: directionZ * magnitude,
  };
}

export function createSceneImpulseMotion(): SceneImpulseMotion {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
}

export function applySceneImpulseKick(
  motion: SceneImpulseMotion,
  kick: Readonly<{ x: number; y: number; z: number }>,
) {
  motion.vx += kick.x;
  motion.vy += kick.y;
  motion.vz += kick.z;
}

/** A critically damped-looking nudge that always returns to the authored pose. */
export function stepSceneImpulseMotion(
  motion: SceneImpulseMotion,
  delta: number,
): SceneImpulseMotion {
  const step = Math.max(0, Math.min(delta, 1 / 30));
  if (step === 0) return motion;
  const damping = Math.exp(-MOTION_DAMPING * step);
  motion.vx = (motion.vx - motion.x * MOTION_SPRING * step) * damping;
  motion.vy = (motion.vy - motion.y * MOTION_SPRING * step) * damping;
  motion.vz = (motion.vz - motion.z * MOTION_SPRING * step) * damping;
  motion.x += motion.vx * step;
  motion.y += motion.vy * step;
  motion.z += motion.vz * step;
  if (
    Math.abs(motion.x) +
      Math.abs(motion.y) +
      Math.abs(motion.z) +
      Math.abs(motion.vx) +
      Math.abs(motion.vy) +
      Math.abs(motion.vz) <
    MOTION_EPSILON
  ) {
    motion.x = 0;
    motion.y = 0;
    motion.z = 0;
    motion.vx = 0;
    motion.vy = 0;
    motion.vz = 0;
  }
  return motion;
}
