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
  /**
   * How far the wander point jumps on each completed wingbeat, as a
   * displacement on the unit sphere.
   *
   * The random walk above turns a heading smoothly over seconds. A butterfly's
   * path also changes in steps, because the force each stroke produces is not
   * the force the last one did: it is the beat, not the second, that is the
   * unit of decision. Handing the Intent Layer the beats lets the heading
   * wobble at the stroke rate on top of the slow drift, which is the flitter.
   * The kick is intent like everything else here, so it still goes through
   * `response` and can never shove the body.
   */
  strokeTurn: number;
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
  /**
   * How hard the intended heading bends away from the pointer while roaming.
   *
   * Deliberately of the same order as `containBias` rather than larger: this
   * is meant to read as an insect that keeps not quite being where your cursor
   * is, not as one that flees. A term big enough to see clearly is a term big
   * enough to make the pointer feel like a weapon, and the room stops being a
   * place with wildlife in it and becomes a toy.
   */
  evadeBias: number;
  /** Fraction of the speed band gained at full evasion. A small quickening is
   * most of what "startled" reads as; without it a strong bend just looks like
   * a wide turn. */
  evadeSpeed: number;
}>;

export const BUTTERFLY_STEERING_PROFILE: InsectSteeringProfile = {
  cruiseSpeed: 0.56,
  speedVariation: 0.46,
  speedVariationRate: 0.23,
  wanderDistance: 1,
  wanderRadius: 0.5,
  wanderTurnSeconds: 2.6,
  strokeTurn: 0.22,
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
  evadeBias: 2.4,
  evadeSpeed: 0.45,
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
  strokeTurn: 0.14,
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
  // Harder than the butterflies, on the owner's call ("can we make moths evade
  // even more aggressively?").
  //
  // This was 0, reasoning that a moth is bound to a lamp cone a fraction of a
  // Flight Volume's size and that the lamp is a prop the visitor is invited to
  // pick up, so evasion would fight the interaction it decorates. The cone
  // still argues that case — but it argues it as containment, which is the
  // right place for it: a moth that bolts from the cursor is pulled back into
  // the light rather than escaping the room, so a strong lean here reads as
  // startled and cannot become flight. Above `containBias` (3.2) the cursor
  // would win that argument and drive moths out of the beam, so it sits just
  // under it.
  evadeBias: 3,
  evadeSpeed: 0.85,
};

/**
 * Where the pointer is, expressed the only way the Intent Layer can read it: a
 * world-space direction to lean away from, and how much.
 *
 * Screen distance is the honest measure of "near the cursor" — the pointer is a
 * ray, not a point in the room — so the conversion happens in the component
 * that owns the camera, and the agent is handed a direction like any other.
 */
export type InsectEvasion = {
  x: number;
  y: number;
  z: number;
  /** 0..1. Clamped here, so a caller cannot turn this into a force. */
  strength: number;
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
  evasion: number;
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
    evasion: 0,
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

/**
 * Break a steering fixed point, and report the direction chosen.
 *
 * The Intent Layer is a controller summing containment, geometry repulsion,
 * residency drift and wander, and nothing forbids those from cancelling: a
 * resident that drifts into a corner where the inward push exactly balances
 * the outward one has found a stable equilibrium and will sit in it. Owner
 * review: "butterflies still sometimes freeze in midair which I'd rather
 * avoid." `updateButterflyStallState` has always been able to SEE this — it
 * just had nowhere to report it except the dev HUD.
 *
 * Jumping the wander point is what actually resolves it. The wander is a real
 * term in the sum, so moving it moves the equilibrium; the caller additionally
 * kicks the velocity along the returned direction, because a balance point
 * that took a while to fall into can take just as long to leave.
 */
export function nudgeInsectSteering(
  state: InsectSteeringState,
  out: { x: number; y: number; z: number },
) {
  const theta = nextRandom(state) * TAU;
  const cosPhi = nextRandom(state) * 2 - 1;
  const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
  state.wanderX = Math.cos(theta) * sinPhi;
  // Biased upward: a stalled insect is usually wedged against something below
  // or beside it, and up is the one direction a shelf never blocks.
  state.wanderY = Math.abs(cosPhi) * 0.65 + 0.35;
  state.wanderZ = Math.sin(theta) * sinPhi;
  state.speedPhase = (state.speedPhase + TAU * 0.37) % TAU;
  const length = Math.hypot(state.wanderX, state.wanderY, state.wanderZ) || 1;
  out.x = state.wanderX / length;
  out.y = state.wanderY / length;
  out.z = state.wanderZ / length;
  return out;
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
  /** Pointer avoidance for this frame, or absent when nothing is near. */
  evade?: InsectEvasion | null;
  position: CollisionPoint;
  velocity: CollisionPoint;
  /** Wingbeats the Flap Layer completed since the last step, usually 0 or 1.
   * Absent for a caller with no wings to count. */
  strokes?: number;
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
  const evade = options.evade ?? null;
  const evasion = evade ? Math.min(1, Math.max(0, evade.strength)) : 0;
  state.evasion = evasion;

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
  // Plus one discrete jump per wingbeat: the stroke that just happened threw
  // the body a little differently from the one before. Drawn only on a beat,
  // so the per-insect stream stays in step with the fixed-rate walk above.
  const strokes = options.strokes ?? 0;
  if (strokes > 0 && profile.strokeTurn > 0) {
    const kick = profile.strokeTurn * Math.sqrt(strokes);
    state.wanderX += (nextRandom(state) * 2 - 1) * kick;
    state.wanderY += (nextRandom(state) * 2 - 1) * kick * 0.5;
    state.wanderZ += (nextRandom(state) * 2 - 1) * kick;
  }
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
        Math.sin(state.speedPhase)) *
    (1 + profile.evadeSpeed * evasion);

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
  // Evasion is a bias on intent, exactly like containment and repulsion, and
  // for the same reason: as a force it would produce a visible shove away from
  // the cursor, and the insect would stop looking like it had decided
  // anything. Composed here it competes with the wander, so a resident that is
  // already turning toward you sometimes keeps coming — which is what makes
  // the ones that slide away read as elusive rather than as repelled.
  if (evasion > 0) {
    const weight = profile.evadeBias * evasion;
    DESIRED.x += evade!.x * weight;
    DESIRED.y += evade!.y * weight;
    DESIRED.z += evade!.z * weight;
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
  // The projection is a backstop for a pathological force stack, never a way
  // to move an insect. A resident released far outside its volume (leaving a
  // prop held up at the camera, four units from the shelf) used to be
  // projected home in one frame, which the owner saw as the butterfly
  // vanishing. Past a short reach the return is FLOWN: the velocity is pointed at the
  // projection at the roam's own top speed and the next steps carry it
  // there; containment steering takes over once it is back inside.
  LEASH_POSITION.x = position.x;
  LEASH_POSITION.y = position.y;
  LEASH_POSITION.z = position.z;
  LEASH_VELOCITY.x = velocity.x;
  LEASH_VELOCITY.y = velocity.y;
  LEASH_VELOCITY.z = velocity.z;
  if (!options.containment.clamp(LEASH_POSITION, LEASH_VELOCITY, 0.05)) return;
  const dx = LEASH_POSITION.x - position.x;
  const dy = LEASH_POSITION.y - position.y;
  const dz = LEASH_POSITION.z - position.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= INSECT_CONTAINMENT_REACH) {
    position.x = LEASH_POSITION.x;
    position.y = LEASH_POSITION.y;
    position.z = LEASH_POSITION.z;
    velocity.x = LEASH_VELOCITY.x;
    velocity.y = LEASH_VELOCITY.y;
    velocity.z = LEASH_VELOCITY.z;
    return;
  }
  // Only the velocity: the steps that follow carry it there at the ceiling,
  // never faster than a butterfly can fly.
  velocity.x = (dx / distance) * options.maxSpeed;
  velocity.y = (dy / distance) * options.maxSpeed;
  velocity.z = (dz / distance) * options.maxSpeed;
}

/** How far outside its volume an insect may be put straight back, in units.
 * Anything further is flown home at top speed rather than moved. */
export const INSECT_CONTAINMENT_REACH = 0.08;
const LEASH_POSITION = { x: 0, y: 0, z: 0 };
const LEASH_VELOCITY = { x: 0, y: 0, z: 0 };
