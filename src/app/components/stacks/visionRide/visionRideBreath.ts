/**
 * The ride's environmental breathing cycle.
 *
 * One raised cosine, 30 s from the smallest state to the largest and 30 s
 * back, drives three things at once so they read as a single slow swell:
 * the sun's apparent size, the car's apparent size (the chase camera gains
 * on it as the sun grows and falls back as it shrinks), and the sky's
 * colour balance. Everything starts at phase 0, the authored base frame,
 * and the cosine's slope vanishes there, so the arrival's first seconds are
 * untouched and the swell only becomes readable once the camera has
 * settled. (The first cut, 60 s and a quarter of the size, was too slow to
 * register as breathing at all.)
 *
 * The car's growth is expressed as an apparent-size multiplier, the same
 * currency as the sun's, and converted to metres against the orientation's
 * settled distance to the car's rear face. A fixed 1.1 m closure was the
 * earlier form: at the crest it grew the rear 31 % in landscape and 16 % in
 * portrait against the sun's 50 %, and the two never read as one breath.
 * Matching the sun exactly (1.5x) was the next cut and still read as too
 * little next to the disc, so the car now swells 2.25x. (Scale against the
 * anchor at the car's middle, not the rear face: the rear is 2.4 m nearer,
 * so any fraction of the anchor distance overshoots at the rear.)
 *
 * Pure so the period, symmetry, monotonic halves, and the zero at ride start
 * are all assertable without a renderer.
 */
export const VISION_RIDE_BREATH = {
  /** Seconds from the smallest state to the largest; the cycle is twice this. */
  halfCycleSeconds: 30,
  /** Sun diameter multiplier at the crest (1 + this). */
  sunGrowth: 0.5,
  /** Car apparent-size multiplier at the crest (1 + this), measured at the
   * rear face. 2.25x: the owner found the sun-matched 1.5x too timid and
   * asked for the crest car to fill half again as much of the frame, so it
   * outgrows the sun and the camera tilts to keep its bumper in frame. */
  carGrowth: 1.25,
} as const;

export type VisionRideBreathConfig = Readonly<{
  halfCycleSeconds: number;
  sunGrowth: number;
  carGrowth: number;
}>;

export const VISION_RIDE_BREATH_PERIOD_SECONDS =
  VISION_RIDE_BREATH.halfCycleSeconds * 2;

/** Raised cosine in [0, 1]: 0 at t=0, 1 at the half cycle, 0 again at the
 * full period. Smooth at both turning points so the direction change is
 * never felt. */
export function breathPhase(
  elapsed: number,
  config: VisionRideBreathConfig = VISION_RIDE_BREATH,
) {
  const angle =
    (Math.PI * Math.max(0, elapsed)) / config.halfCycleSeconds;
  return 0.5 - 0.5 * Math.cos(angle);
}

/**
 * Metres the chase camera must close on the car for it to read `scale`
 * times larger than it does from `distance` metres. Apparent size is
 * inverse to distance, so this is distance · (1 / scale − 1): zero at scale
 * 1, negative (toward the car) above it.
 */
export function chaseOffsetForScale(scale: number, distance: number) {
  return distance * (1 / scale - 1);
}

export type EnvironmentBreath = Readonly<{
  /** Cycle position in [0, 1]. */
  phase: number;
  /** Uniform scale for the sun disc; 1 at phase 0. */
  sunScale: number;
  /** Apparent-size multiplier for the car; 1 at phase 0. */
  carScale: number;
  /** Camera z offset toward the car (negative = closer) that delivers
   * `carScale` from the chase distance the cycle was evaluated for; 0 at
   * phase 0. */
  chaseOffset: number;
}>;

export function environmentBreath(
  elapsed: number,
  reducedMotion: boolean,
  chaseDistance: number,
  config: VisionRideBreathConfig = VISION_RIDE_BREATH,
): EnvironmentBreath {
  const phase = reducedMotion ? 0 : breathPhase(elapsed, config);
  const carScale = 1 + config.carGrowth * phase;
  return {
    phase,
    sunScale: 1 + config.sunGrowth * phase,
    carScale,
    chaseOffset: chaseOffsetForScale(carScale, chaseDistance),
  };
}
