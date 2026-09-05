import { describe, expect, it } from "vitest";

import {
  SMOOTHED_AT_REST,
  criticallyDamped,
  smoothedAt,
} from "./visionRideSmoothing";

const config = { omega: 3.2, maxSpeed: 0.7 };

function run(
  from: number,
  target: number,
  seconds: number,
  hz: number,
  cfg = config,
) {
  let state = smoothedAt(from);
  const trace: { t: number; value: number; velocity: number }[] = [];
  for (let frame = 1; frame <= Math.round(seconds * hz); frame += 1) {
    state = criticallyDamped(state, target, cfg, 1 / hz);
    trace.push({ t: frame / hz, ...state });
  }
  return trace;
}

describe("Vision Ride camera smoothing", () => {
  it("starts every move from rest and eases out, never overshooting", () => {
    const trace = run(-1, 1, 8, 60);
    // Ease-in: the first frames barely move and the velocity grows from
    // zero instead of starting at full speed.
    expect(trace[0]!.value).toBeGreaterThan(-1);
    expect(trace[0]!.value - -1).toBeLessThan(0.001);
    expect(trace[0]!.velocity).toBeLessThan(0.1);
    expect(trace[5]!.velocity).toBeGreaterThan(trace[0]!.velocity);
    // Monotone toward the target, never past it.
    let previous = -1;
    for (const point of trace) {
      expect(point.value).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(point.value).toBeLessThanOrEqual(1 + 1e-9);
      previous = point.value;
    }
    // Ease-out: the velocity decays back to zero and the value lands.
    expect(trace[trace.length - 1]!.value).toBe(1);
    expect(trace[trace.length - 1]!.velocity).toBe(0);
  });

  it("caps a full sweep at the pan rate while a nudge stays responsive", () => {
    const sweep = run(-1, 1, 8, 120);
    let fastest = 0;
    let previous = -1;
    for (const point of sweep) {
      fastest = Math.max(fastest, (point.value - previous) * 120);
      previous = point.value;
    }
    expect(fastest).toBeLessThanOrEqual(config.maxSpeed + 1e-6);
    expect(fastest).toBeGreaterThan(config.maxSpeed * 0.95);
    // A side-to-side sweep is a slow pan: roughly three seconds plus the
    // ease at either end, not the half second the exponential took.
    const arrive = (
      trace: typeof sweep,
      fraction: number,
      from: number,
      to: number,
    ) => trace.find((p) => (p.value - from) / (to - from) >= fraction)!.t;
    expect(arrive(sweep, 0.9, -1, 1)).toBeGreaterThan(2.6);
    expect(arrive(sweep, 0.9, -1, 1)).toBeLessThan(3.6);
    // A small nudge is not slowed by the cap and answers within a second.
    const nudge = run(0, 0.1, 3, 120);
    expect(arrive(nudge, 0.5, 0, 0.1)).toBeLessThan(0.7);
    expect(arrive(nudge, 0.9, 0, 0.1)).toBeLessThan(1.4);
  });

  it("is the same at 60 and 120 Hz and after a mid-move reversal", () => {
    const at60 = run(-1, 1, 4, 60);
    const at120 = run(-1, 1, 4, 120);
    for (const point of at60) {
      const twin = at120[Math.round(point.t * 120) - 1]!;
      // The ramp is stepped per frame, so the two differ by well under a
      // hundredth of the range.
      expect(twin.value).toBeCloseTo(point.value, 2);
    }
    // Reversing halfway keeps the velocity continuous: no jump, the value
    // keeps drifting the old way for a beat before turning.
    let state = smoothedAt(0);
    for (let i = 0; i < 30; i += 1)
      state = criticallyDamped(state, 1, config, 1 / 60);
    const before = state;
    const after = criticallyDamped(before, -1, config, 1 / 60);
    expect(after.value).toBeGreaterThan(before.value);
    expect(Math.abs(after.velocity - before.velocity)).toBeLessThan(0.2);
  });

  it("holds still at rest and ignores a zero step", () => {
    expect(criticallyDamped(SMOOTHED_AT_REST, 0, config, 1 / 60)).toEqual(
      SMOOTHED_AT_REST,
    );
    const moving = { value: 0.2, velocity: 0.3, ramp: 0.5 };
    expect(criticallyDamped(moving, 1, config, 0)).toBe(moving);
    const uncapped = run(0, 1, 6, 60, { omega: 3.2, maxSpeed: 0 });
    expect(uncapped[uncapped.length - 1]!.value).toBe(1);
    expect(uncapped[60]!.value).toBeGreaterThan(0.8);
  });
});
