/** Pure motion/appearance model for the tea vapor. The renderer supplies a
 * world-space birth point and the shared meadow wind; keeping this free of
 * Three.js makes the physical contract cheap to regression-test. */
export const STEAM_MOTION = {
  life: 2.2,
  rise: 0.27,
  windAdvection: 0.76,
  curl: 0.016,
  inheritedVelocityDecay: 0.34,
} as const;

export type SteamSample = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  opacity: number;
  flowX: number;
  flowY: number;
  flowZ: number;
};

type SteamSampleOptions = {
  originX: number;
  originY: number;
  originZ: number;
  progress: number;
  age: number;
  time: number;
  phase: number;
  windX: number;
  windZ: number;
  inheritedX: number;
  inheritedY: number;
  inheritedZ: number;
  size: number;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Writes one world-space vapor sample into caller-owned storage. The mist is
 * initially coherent and cup-coupled, then drag hands it to the wind before
 * slower coherent curls break it apart. */
export function writeSteamSample(
  target: SteamSample,
  options: SteamSampleOptions,
) {
  const p = clamp01(options.progress);
  const spread = 0.06 + smoothstep(0.14, 0.82, p) * 0.94;
  const curl = STEAM_MOTION.curl * spread;
  const coherentX = Math.sin(options.time * 0.72 + p * 4.2);
  const coherentZ = Math.cos(options.time * 0.58 + p * 3.55);
  const eddyX = Math.sin(options.time * 1.34 + options.phase + p * 6.1);
  const eddyZ = Math.cos(options.time * 1.12 + options.phase * 1.37 + p * 5.45);
  const curlX = coherentX * 0.78 + eddyX * 0.22;
  const curlZ = coherentZ * 0.8 + eddyZ * 0.2;
  // Vapor begins sheltered by the cup, then increasingly follows the air.
  const advection =
    options.age *
    STEAM_MOTION.windAdvection *
    (0.08 + Math.pow(p, 1.35) * 0.92);
  // A puff inherits a little of a moving cup's velocity, then rapidly loses
  // it to air drag. Existing vapor therefore trails a grab without looking
  // frozen in place or being dragged indefinitely with the model.
  const inheritedDistance =
    STEAM_MOTION.inheritedVelocityDecay *
    (1 - Math.exp(-options.age / STEAM_MOTION.inheritedVelocityDecay));

  target.x =
    options.originX +
    options.inheritedX * inheritedDistance +
    options.windX * advection +
    curlX * curl;
  target.y =
    options.originY +
    options.inheritedY * inheritedDistance +
    0.012 +
    STEAM_MOTION.rise * (1 - Math.pow(1 - p, 1.16));
  target.z =
    options.originZ +
    options.inheritedZ * inheritedDistance +
    options.windZ * advection +
    curlZ * curl * 0.68;

  const width = options.size * (0.5 + p * 1.28);
  target.width = width * (1 + Math.sin(options.phase + p * 6.4) * 0.09);
  target.height = width * (1.6 + p * 0.38);
  target.opacity =
    smoothstep(0.025, 0.14, p) * (1 - smoothstep(0.4, 1, p)) * (1 - p * 0.25);

  // Approximate path tangent, used to align the elongated texture with its
  // projected flow direction rather than leaving every sprite dead vertical.
  const riseVelocity =
    (STEAM_MOTION.rise * 1.16 * Math.pow(Math.max(0.001, 1 - p), 0.16)) /
    STEAM_MOTION.life;
  const windCoupling =
    STEAM_MOTION.windAdvection * (0.08 + Math.pow(p, 1.35) * 1.35);
  const inheritedCoupling = Math.exp(
    -options.age / STEAM_MOTION.inheritedVelocityDecay,
  );
  target.flowX =
    options.inheritedX * inheritedCoupling + options.windX * windCoupling;
  target.flowY = options.inheritedY * inheritedCoupling + riseVelocity;
  target.flowZ =
    options.inheritedZ * inheritedCoupling + options.windZ * windCoupling;
  return target;
}
