// The Intent Layer: a roaming insect's slow decision about where to be,
// expressed only as forces on its own velocity.
//
// Three contributions, integrated per-insect into its own state:
//
//   wander      a target projected ahead onto a sphere whose surface point
//               random-walks. Reynolds' point is that per-frame randomness is
//               twitchy while a random walk *on the sphere* produces sustained
//               turns, which is what an erratic-but-continuous flight path is.
//   repulsion   the analytic distance field over the same per-Unit collision
//               boxes, sampled at the body and one look-ahead step. Geometry
//               bends the insect; it never forbids anything (see ADR 0002).
//   containment the boundary of whatever shape the insect belongs to, plus
//               that shape's own standing drift. A butterfly's is its Unit's
//               Flight Volume; a moth's is its lamp's cone.
//
// Nothing here produces a position. That is the whole point: two residents
// cannot share a line through the air because there is no line to share.
import type { CollisionPoint } from "./insectCollision";
import type { InsectContainment } from "./insectContainment";

export type InsectSteeringProfile = Readonly<{
  /** Centre of the speed band. Flight is deliberately not held at it. */
  cruiseSpeed: number;
  /** Fraction of `cruiseSpeed` the slow speed modulation swings through. */
  speedVariation: number;
  speedVariationRate: number;
  /** Reynolds wander: sphere projected this far along the heading. Larger than
   * `wanderRadius` on purpose — the ratio is what sets how far a resident
   * commits to a direction, and a short commitment reads as jitter and also
   * mixes so slowly that everyone ends up piled in a corner. */
  wanderDistance: number;
  wanderRadius: number;
  /**
   * Roughly how long a heading stays coherent, in seconds.
   *
   * Authored as a time rather than a per-step displacement because the wander
   * point performs a RANDOM walk: displacements accumulate as √n, not n, so a
   * "radians per second" reading of the same number is wrong by a factor of
   * √(steps), and at 120 Hz that is a fortyfold error. The first version of
   * this held a heading for a hundred seconds, which let a resident settle at
   * whatever height its containment happened to balance and sit there.
   */
  wanderTurnSeconds: number;
  /** Time constant converting a desired velocity into an acceleration. */
  response: number;
  /** Repulsion begins at this clearance and is strongest at the surface. */
  repelDistance: number;
  /** How far the intended heading bends away from nearby geometry. */
  repelBias: number;
  /** Acceleration applied when the body is actually inside a collider. Only
   * penetration is a force; everything else steers. */
  repelEscape: number;
  /** How far ahead the second distance-field sample is taken, in seconds. */
  repelLookAhead: number;
  /** How far the intended heading bends back inside the containment shape. */
  containBias: number;
  /** Seconds of travel ahead the containment boundary is judged from. */
  containLookAhead: number;
  /**
   * Speed band centre while crossing under Transit (ADR 0004). Deliberately
   * only a little above the top of the ordinary speed swing: a crossing has to
   * read as purposeful, and a large multiple reads as a conveyor belt.
   */
  transitSpeed: number;
  /** Fraction of the wander radius that survives a crossing. Not zero — an
   * insect that stops wandering entirely reads as a tracked object. */
  transitWander: number;
  /** How hard the crossing heading dominates the composed intent. */
  transitBias: number;
}>;

export const BUTTERFLY_STEERING_PROFILE: InsectSteeringProfile = {
  cruiseSpeed: 0.56,
  speedVariation: 0.46,
  speedVariationRate: 0.23,
  wanderDistance: 1,
  wanderRadius: 0.5,
  wanderTurnSeconds: 2.6,
  response: 0.42,
  repelDistance: 0.34,
  repelBias: 2.6,
  repelEscape: 6.5,
  repelLookAhead: 0.34,
  containBias: 2.8,
  containLookAhead: 0.75,
  transitSpeed: 1.05,
  transitWander: 0.45,
  transitBias: 2.2,
};

/**
 * Tighter and twitchier than the butterflies (ADR 0007). A moth is not a slow
 * butterfly: it commits to a heading for under a second where a butterfly holds
 * one for two and a half, turns harder, and cruises at about two thirds the
 * speed inside a volume a fraction of the size.
 *
 * Transit is a butterfly concept — a butterfly belongs to a region of the room
 * and may cross between regions, while a moth belongs to a lamp — so the
 * transit fields are inert here rather than tuned.
 */
export const MOTH_STEERING_PROFILE: InsectSteeringProfile = {
  cruiseSpeed: 0.34,
  speedVariation: 0.55,
  speedVariationRate: 0.41,
  wanderDistance: 0.62,
  wanderRadius: 0.55,
  wanderTurnSeconds: 0.85,
  response: 0.26,
  repelDistance: 0.28,
  repelBias: 3,
  repelEscape: 6.5,
  repelLookAhead: 0.26,
  containBias: 3.2,
  containLookAhead: 0.45,
  transitSpeed: 0.34,
  transitWander: 1,
  transitBias: 0,
};

export type InsectSteeringState = {
  /** Unit vector: the current point on the wander sphere. */
  wanderX: number;
  wanderY: number;
  wanderZ: number;
  speedPhase: number;
  /** Deterministic per-insect stream. No shared PRNG, so mount order can
   * never correlate two residents or reshuffle them between reloads. */
  random: number;
  /** Reported by the HUD, not consumed by the model. */
  clearance: number;
  containment: number;
};

const TAU = Math.PI * 2;

function hash(seed: number) {
  const value = Math.sin((seed + 1) * 127.117) * 43758.5453;
  return value - Math.floor(value);
}

export function createInsectSteeringState(seed: number): InsectSteeringState {
  const theta = hash(seed) * TAU;
  const cosPhi = hash(seed + 31) * 2 - 1;
  const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
  return {
    wanderX: Math.cos(theta) * sinPhi,
    wanderY: cosPhi,
    wanderZ: Math.sin(theta) * sinPhi,
    speedPhase: hash(seed + 71) * TAU,
    random: Math.floor(hash(seed + 113) * 0xffffffff) >>> 0 || 1,
    clearance: Number.POSITIVE_INFINITY,
    containment: 0,
  };
}

/** mulberry32. Deterministic, fast, and independent per insect. */
function nextRandom(state: InsectSteeringState) {
  state.random = (state.random + 0x6d2b79f5) >>> 0;
  let value = state.random;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

const GRADIENT = { x: 0, y: 0, z: 0 };
const PROBE = { x: 0, y: 0, z: 0 };
const DESIRED = { x: 0, y: 0, z: 0 };
const DRIFT = { x: 0, y: 0, z: 0 };
const CONTAIN = { x: 0, y: 0, z: 0 };
const ESCAPE = { x: 0, y: 0, z: 0 };

/** Bend the intended heading away from whatever `GRADIENT` currently points
 * out of, weighted by how close it is. */
function accumulateAvoidance(
  profile: InsectSteeringProfile,
  distance: number,
  scale: number,
) {
  if (distance >= profile.repelDistance) return;
  const proximity = Math.max(
    0,
    1 - Math.max(0, distance) / profile.repelDistance,
  );
  const weight = profile.repelBias * proximity * proximity * scale;
  DESIRED.x += GRADIENT.x * weight;
  DESIRED.y += GRADIENT.y * weight;
  DESIRED.z += GRADIENT.z * weight;
}

export type InsectSteeringStep = {
  state: InsectSteeringState;
  profile: InsectSteeringProfile;
  /** The shape the insect belongs to — a Unit's Flight Volume for a butterfly,
   * a Lamp Cone for a moth. The agent never asks which. */
  containment: InsectContainment;
  /** World-space unit direction of a directed crossing, or absent for ordinary
   * roaming. Containment and repulsion still apply while it is set: Transit
   * raises the speed and suppresses the wander, it does not suspend the model. */
  transit?: CollisionPoint | null;
  position: CollisionPoint;
  velocity: CollisionPoint;
  step: number;
  /** Absent for a world with no geometry adapter; roaming then relies on
   * containment alone, which is still a complete model. */
  sampleDistanceField?: (
    point: CollisionPoint,
    outGradient: { x: number; y: number; z: number },
  ) => number;
  out: { x: number; y: number; z: number };
};

/** Advance one insect's intent by `step` seconds and write its desired
 * acceleration into `out`. Allocation-free; the caller owns all vectors. */
export function advanceInsectSteering(options: InsectSteeringStep) {
  const { state, profile, containment, position, velocity, step, out } =
    options;
  const transit = options.transit ?? null;

  // Random-walk the point on the wander sphere, then renormalize. Displacing
  // and reprojecting is what keeps a turn going for several seconds instead of
  // cancelling itself out every frame. The √step scaling is what makes the
  // authored turn time mean the same thing at any substep size.
  const jitter = Math.sqrt(
    (1.5 * step) / Math.max(1e-6, profile.wanderTurnSeconds),
  );
  state.wanderX += (nextRandom(state) * 2 - 1) * jitter;
  state.wanderY += (nextRandom(state) * 2 - 1) * jitter;
  state.wanderZ += (nextRandom(state) * 2 - 1) * jitter;
  const wanderLength =
    Math.hypot(state.wanderX, state.wanderY, state.wanderZ) || 1;
  state.wanderX /= wanderLength;
  state.wanderY /= wanderLength;
  state.wanderZ /= wanderLength;

  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  let headingX = state.wanderX;
  let headingY = state.wanderY;
  let headingZ = state.wanderZ;
  if (speed > 1e-4) {
    headingX = velocity.x / speed;
    headingY = velocity.y / speed;
    headingZ = velocity.z / speed;
  }

  state.speedPhase =
    (state.speedPhase + TAU * profile.speedVariationRate * step) % TAU;
  // A crossing keeps a trace of the speed swing rather than holding one rate:
  // a constant speed is the single most machine-like thing an insect can do.
  const desiredSpeed =
    (transit ? profile.transitSpeed : profile.cruiseSpeed) *
    (1 +
      profile.speedVariation *
        (transit ? 0.35 : 1) *
        Math.sin(state.speedPhase));

  // The camera-side bias is a lean on the wander sphere. See
  // `insectFlightVolumeResidencyDrift` for why it is intent and not a shove.
  const lean =
    containment.residencyDrift(position, DRIFT) * profile.wanderRadius;
  const wanderRadius =
    profile.wanderRadius * (transit ? profile.transitWander : 1);

  // Everything below composes ONE intended heading. The wander target is only
  // ever used as a direction; it is never a place, so no two residents can be
  // handed the same line through the air.
  DESIRED.x =
    headingX * profile.wanderDistance +
    state.wanderX * wanderRadius +
    DRIFT.x * lean;
  DESIRED.y =
    headingY * profile.wanderDistance +
    state.wanderY * wanderRadius +
    DRIFT.y * lean;
  DESIRED.z =
    headingZ * profile.wanderDistance +
    state.wanderZ * wanderRadius +
    DRIFT.z * lean;
  if (transit) {
    DESIRED.x += transit.x * profile.transitBias;
    DESIRED.y += transit.y * profile.transitBias;
    DESIRED.z += transit.z * profile.transitBias;
  }

  state.clearance = Number.POSITIVE_INFINITY;
  let penetration = 0;
  const sampleDistanceField = options.sampleDistanceField;
  if (sampleDistanceField) {
    const here = sampleDistanceField(position, GRADIENT);
    state.clearance = here;
    accumulateAvoidance(profile, here, 1);
    if (here < 0) {
      // The one genuine force in the model. A prop that moves onto an insect
      // has to eject it whatever the insect currently intends.
      penetration = profile.repelEscape;
      ESCAPE.x = GRADIENT.x;
      ESCAPE.y = GRADIENT.y;
      ESCAPE.z = GRADIENT.z;
    }
    // The look-ahead is what turns the insect before it arrives rather than
    // after. It is deliberately weaker than the body sample so a prop it is
    // already flying past cannot dominate the heading.
    PROBE.x = position.x + velocity.x * profile.repelLookAhead;
    PROBE.y = position.y + velocity.y * profile.repelLookAhead;
    PROBE.z = position.z + velocity.z * profile.repelLookAhead;
    const ahead = sampleDistanceField(PROBE, GRADIENT);
    accumulateAvoidance(profile, ahead, 0.62);
    if (ahead < state.clearance) state.clearance = ahead;
  }

  // Containment is judged from where the insect is GOING, not where it is, and
  // it bends the heading rather than adding a force — see
  // `insectFlightVolumeContainment` for why the force version fails.
  CONTAIN.x = position.x + velocity.x * profile.containLookAhead;
  CONTAIN.y = position.y + velocity.y * profile.containLookAhead;
  CONTAIN.z = position.z + velocity.z * profile.containLookAhead;
  state.containment = containment.containment(CONTAIN, CONTAIN);
  if (state.containment > 1e-6) {
    const inward = Math.hypot(CONTAIN.x, CONTAIN.y, CONTAIN.z) || 1;
    const weight = (profile.containBias * state.containment) / inward;
    DESIRED.x += CONTAIN.x * weight;
    DESIRED.y += CONTAIN.y * weight;
    DESIRED.z += CONTAIN.z * weight;
  }

  const desiredLength = Math.hypot(DESIRED.x, DESIRED.y, DESIRED.z) || 1;
  const scale = desiredSpeed / desiredLength;
  out.x =
    (DESIRED.x * scale - velocity.x) / profile.response +
    ESCAPE.x * penetration;
  out.y =
    (DESIRED.y * scale - velocity.y) / profile.response +
    ESCAPE.y * penetration;
  out.z =
    (DESIRED.z * scale - velocity.z) / profile.response +
    ESCAPE.z * penetration;
}

/** Integrate one roaming step with no sweep gate: geometry has already bent
 * the acceleration, and a rare shallow clip is an accepted outcome. The volume
 * clamp is a backstop, not part of the model. */
export function integrateInsectRoam(options: {
  containment: InsectContainment;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  acceleration: CollisionPoint;
  maxSpeed: number;
  step: number;
}) {
  const { position, velocity, acceleration, step } = options;
  velocity.x += acceleration.x * step;
  velocity.y += acceleration.y * step;
  velocity.z += acceleration.z * step;
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (speed > options.maxSpeed && speed > 1e-9) {
    const scale = options.maxSpeed / speed;
    velocity.x *= scale;
    velocity.y *= scale;
    velocity.z *= scale;
  }
  position.x += velocity.x * step;
  position.y += velocity.y * step;
  position.z += velocity.z * step;
  options.containment.clamp(position, velocity, 0.05);
}
