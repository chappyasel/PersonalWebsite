/**
 * Smoothing for the ride camera's pointer swing and lift: a rate-limited
 * target followed by a critically damped spring.
 *
 * An exponential filter starts every move at full speed, which read as a
 * snap once the swing grew from a 17 degree truck to a 90 degree pan with
 * four metres of dolly. The spring starts from rest and eases out, so the
 * velocity is continuous; the ramp caps how fast the target can run away,
 * so a full sweep is a slow pan rather than a whip while a small nudge
 * still answers within a second. Tracking a ramp, a critically damped
 * spring lags by exactly speed / omega and never overshoots when the ramp
 * stops, so the camera settles without a bounce.
 *
 * The spring step is the closed form for a constant target over the
 * frame, exact at any frame rate. Pure so the ease-in, the cap, the
 * no-overshoot and the frame-rate independence are all assertable.
 */
export type SmoothedValue = Readonly<{
  /** The smoothed output. */
  value: number;
  /** Its velocity, in units per second. */
  velocity: number;
  /** The rate-limited target the spring is following. */
  ramp: number;
}>;

export type SmoothingConfig = Readonly<{
  /** Natural frequency of the critically damped spring, per second. */
  omega: number;
  /** Fastest the target may move, units per second; 0 for no cap. */
  maxSpeed: number;
}>;

export const SMOOTHED_AT_REST: SmoothedValue = Object.freeze({
  value: 0,
  velocity: 0,
  ramp: 0,
});

export function smoothedAt(value: number): SmoothedValue {
  return { value, velocity: 0, ramp: value };
}

export function criticallyDamped(
  state: SmoothedValue,
  target: number,
  config: SmoothingConfig,
  delta: number,
): SmoothedValue {
  const dt = Math.max(0, delta);
  if (dt === 0) return state;
  const step = config.maxSpeed > 0 ? config.maxSpeed * dt : Infinity;
  const ramp =
    state.ramp + Math.max(-step, Math.min(step, target - state.ramp));
  const omega = config.omega;
  const a = state.value - ramp;
  const b = state.velocity + omega * a;
  const decay = Math.exp(-omega * dt);
  const value = ramp + (a + b * dt) * decay;
  const velocity = (b - omega * (a + b * dt)) * decay;
  if (
    ramp === target &&
    Math.abs(value - target) < 1e-6 &&
    Math.abs(velocity) < 1e-6
  )
    return { value: target, velocity: 0, ramp: target };
  return { value, velocity, ramp };
}
