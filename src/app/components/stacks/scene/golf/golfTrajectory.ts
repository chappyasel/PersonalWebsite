import { GOLF_GRAVITY } from "./golfPhysics";
import type { GolfRandom } from "./golfShotBag";
import type { GolfShotOutcome, GolfVec3 } from "./golfTypes";

export type GolfTrajectory = {
  landing: GolfVec3;
  velocity: GolfVec3;
  variant: "standard" | "close-roll" | "lip-out" | "flagstick";
};

export function planGolfTrajectory(
  start: GolfVec3,
  cup: GolfVec3,
  outcome: GolfShotOutcome,
  random: GolfRandom,
  terrainHeight: (x: number, z: number) => number,
): GolfTrajectory {
  const toCup = { x: cup.x - start.x, z: cup.z - start.z };
  const distance = Math.max(0.001, Math.hypot(toCup.x, toCup.z));
  const direction = { x: toCup.x / distance, z: toCup.z / distance };
  const side = { x: -direction.z, z: direction.x };
  let along = 1.05;
  let across = 0;
  let variant: GolfTrajectory["variant"] = "standard";

  if (outcome === "hole-bound") {
    // Carry beyond the cup so a protected winner has to show a real wedge
    // bounce, backspin check and reverse roll. Direct fly-ins are deliberately
    // excluded from the normal winning cadence.
    // Give the checked ball enough green to lose its reverse-roll speed in
    // view. A landing too close to the flag needs an obvious last-second brake.
    along = 1.175 + random() * 0.08;
    // Clear the in-cup flagstick on the way down while staying inside the
    // capture radius on the reverse roll.
    across = -0.07;
  } else if (outcome === "near-miss") {
    const choice = Math.floor(random() * 3);
    variant =
      choice === 0 ? "lip-out" : choice === 1 ? "flagstick" : "close-roll";
    // Flagstick misses arrive on the pole in the air; ground-running them at
    // the centre line lets the outer cup lip intercept the ball first, making
    // a physical pole tap impossible.
    along = variant === "flagstick" ? -0.1 : 0.92 + random() * 0.24;
    if (variant !== "flagstick") {
      const missSide = random() < 0.5 ? -1 : 1;
      // The close roll uses the opposite break from the lip-out so the
      // terrain guides it past the cup instead of turning it into a winner.
      across =
        (variant === "close-roll" ? -missSide : missSide) *
        (variant === "close-roll" ? 0.16 : 0.075);
    }
  } else if (outcome === "ordinary-green") {
    along = 0.35 + random() * 1.45;
    across = (random() - 0.5) * 2.6;
  } else {
    along = -0.15 + random() * 2.3;
    across = (random() < 0.5 ? -1 : 1) * (3.25 + random() * 0.7);
  }

  const landing = {
    x: cup.x - direction.x * along + side.x * across,
    y: 0,
    z: cup.z - direction.z * along + side.z * across,
  };
  landing.y = terrainHeight(landing.x, landing.z) + 0.05;
  const horizontalDistance = Math.hypot(
    landing.x - start.x,
    landing.z - start.z,
  );
  // A short wedge still climbs decisively. With real 9.81 m/s² gravity this
  // produces a roughly 4.5–5.5 m apex, rather than using a low launch that
  // reads like reduced gravity even though its acceleration is correct.
  const flightTime = Math.min(2.25, Math.max(1.85, horizontalDistance / 8.8));
  const velocity = {
    // Compensate the solver's measured aerodynamic loss while keeping the
    // landing physical. This is launch calibration, not a mid-flight snap.
    x: ((landing.x - start.x) / flightTime) * 1.12,
    y:
      (landing.y - start.y + 0.5 * GOLF_GRAVITY * flightTime * flightTime) /
      flightTime,
    z: ((landing.z - start.z) / flightTime) * 1.12,
  };
  velocity.y += 0.22;
  return { landing, velocity, variant };
}
