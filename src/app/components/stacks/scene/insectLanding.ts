// Shared cadence and deterministic staggering for the kinematic Insect Pilot.
// Motion phases live exclusively in insectPilot.ts; keeping a second timed
// state machine here previously let docs/tests describe behavior no renderer
// actually used.
import {
  type InsectFlightVolume,
  insectFlightVolumeLocal,
  insectFlightVolumePoint,
} from "./insectFlightVolume";
import type { InsectPerchRejectionCode } from "./insectPerchDiagnostic";
import type {
  InsectKinematicSample,
  InsectLandingTarget,
  InsectPilotProfile,
  PilotVector,
} from "./insectPilot";

export type InsectLandingPlan = Readonly<{
  perchId: string;
  collisionRevision: number | null;
  /**
   * `approach`, `hover`, and `touchdown` are three contiguous slices of ONE
   * Arrival Curve, not three separately authored routes. They share their
   * boundary points, so the whole descent is C¹ by construction. The split
   * exists because the collision model and the pointer semantics change along
   * the way — open-wing sphere while the insect is still well clear, folded
   * surface-aligned pose once it is spiralling in — not because circling and
   * settling are different gestures.
   */
  approach: readonly PilotVector[];
  hover: readonly PilotVector[];
  touchdown: readonly PilotVector[];
  launch: readonly PilotVector[];
  /** Last launch waypoint reached while the wings remain folded. */
  launchFoldedThrough: number;
  /** Empty for a steering resident, which resumes its Intent Layer instead of
   * flying back onto an analytic flight. */
  rejoin: readonly PilotVector[];
  contact: PilotVector;
  normal: PilotVector;
  tangent: PilotVector;
  rejoinVelocity: PilotVector;
  /** Angle below the surface plane at contact, in radians. */
  arrivalAngle: number;
}>;

export type InsectLandingPlanResult =
  | Readonly<{ ok: true; plan: InsectLandingPlan }>
  | Readonly<{
      ok: false;
      rejectionCode: Exclude<InsectPerchRejectionCode, "none">;
    }>;

type LandingPhase = "approach" | "hover" | "touchdown" | "launch" | "rejoin";

/** Open-air takeoffs rise eagerly; lower-shelf Perches also need a shallow
 * outward option beneath the plank above. Both retain a positive surface-
 * normal component and are swept before selection. */
const LAUNCH_SLOPES = [
  { normal: 0.82, tangent: 0.58 },
  { normal: 0.36, tangent: 0.94 },
] as const;

function normalize(value: PilotVector, fallback: PilotVector) {
  const length = Math.hypot(value.x, value.y, value.z);
  if (length < 1e-8) return { ...fallback };
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

function hermite(
  start: PilotVector,
  startVelocity: PilotVector,
  end: PilotVector,
  endVelocity: PilotVector,
  duration: number,
  count: number,
) {
  const points: PilotVector[] = [];
  for (let index = 0; index <= count; index++) {
    const t = index / count;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    points.push({
      x:
        h00 * start.x +
        h10 * duration * startVelocity.x +
        h01 * end.x +
        h11 * duration * endVelocity.x,
      y:
        h00 * start.y +
        h10 * duration * startVelocity.y +
        h01 * end.y +
        h11 * duration * endVelocity.y,
      z:
        h00 * start.z +
        h10 * duration * startVelocity.z +
        h01 * end.z +
        h11 * duration * endVelocity.z,
    });
  }
  return points;
}

function routeIsClear<Phase extends LandingPhase>(
  phase: Phase,
  points: readonly PilotVector[],
  sweep: (phase: Phase, from: PilotVector, to: PilotVector) => boolean,
) {
  for (let index = 0; index < points.length - 1; index++)
    if (!sweep(phase, points[index]!, points[index + 1]!)) return false;
  return true;
}

/** Compile the whole Landing Cycle before occupancy changes. The caller owns
 * support/contact semantics in `sweep`, letting the Three adapter restrict the
 * intended support exception while pure tests use the identical planner. */
export type InsectLandingPlanRequest = {
  perchId: string;
  collisionRevision: number | null;
  start: InsectKinematicSample;
  target: InsectLandingTarget;
  /** Null for a steering resident: there is no analytic flight to rejoin. */
  rejoin: InsectKinematicSample | null;
  /**
   * The resident's Flight Volume, when it has one. Only the Unit frame is
   * used, to find the open air in front of the furniture — see
   * `approachStagingVia`.
   */
  volume?: InsectFlightVolume | null;
  /**
   * 0..1, one value per landing attempt. Spreads the winding, the size and the
   * entry bearing so successive arrivals are not the same gesture: the search
   * is otherwise deterministic and always takes its first choice, which made
   * every butterfly fly the identical spiral onto every Perch.
   */
  variation?: number;
  profile: InsectPilotProfile;
  sweep: (phase: LandingPhase, from: PilotVector, to: PilotVector) => boolean;
  foldedSweep?: (
    phase: "hover" | "touchdown" | "launch",
    from: PilotVector,
    to: PilotVector,
  ) => boolean;
};

/**
 * The Arrival Curve: a helix around the Perch normal whose radius and height
 * decay together, so the insect meets the surface along the surface rather
 * than descending onto it.
 *
 *   r(s) = R(1 − s)
 *   h(s) = H(1 − s)((1 − s) + κ) / (1 + κ)
 *   θ(s) = θ₀ ± 2π · turns · (1 − (1 − s)³)
 *
 * The winding is FRONT-LOADED: the sweep completes, but its rate 3(1 − s)²
 * vanishes at the contact. A linear θ(s) — what this was — turns at a constant
 * rate all the way in, and while the swirl term of the velocity decays with the
 * radius, the radial term does not: its magnitude stays R while its direction
 * keeps rotating. So the heading swept fastest exactly where the insect was
 * slowest and largest on screen, which read as a corkscrew flipping the
 * insect's facing back and forth as it settled.
 *
 * Cubic rather than quadratic because two effects have to die out, not one: the
 * bearing itself, and the ratio of swirl to radial velocity that sets how far
 * the heading leads the radius. Quadratic left ~24° of yaw in the final quarter
 * of the descent; cubic leaves under 10°, which reads as a settling bank.
 *
 * κ is not a shape preference; it is solved so the terminal slope dh/dr equals
 * the authored arrival angle. A pure quadratic height (κ = 0) arrives exactly
 * tangent to the surface and reads as a slide, while a pure linear one holds
 * the same angle the whole way down and reads as a ramp. The mixture spends
 * most of the curve shedding height and the last of it shallow.
 */
type ArrivalCurve = Readonly<{
  contact: PilotVector;
  normal: PilotVector;
  tangent: PilotVector;
  bitangent: PilotVector;
  /**
   * The direction the curve's height is measured along — the Perch normal
   * tilted toward the entry side by `ARRIVAL_TILTS`.
   *
   * It used to BE the normal, and that is why every landing looked the same.
   * The curve is `contact + normal·height + (disc)·radius`, so on any flat
   * surface the top of the spiral sat directly over the contact point and the
   * eight entry bearings only chose which compass direction the insect
   * descended in — never the elevation. Owner review: "why aren't they allowed
   * to come from more aggressive directions? Looks like it's always this
   * classic floating down from the top."
   *
   * Tilting only this vector, and leaving the radial disc in the surface's own
   * tangent plane, keeps the whole curve on the outer side of the contact
   * plane by construction: every sample's normal component is
   * `height·cos(tilt)`, which cannot go negative. The insect swings in from the
   * side and rises onto the Perch instead of settling onto it from above.
   */
  lift: PilotVector;
  radius: number;
  height: number;
  kappa: number;
  sweepAngle: number;
  startAngle: number;
}>;

function solveArrivalKappa(radius: number, height: number, angle: number) {
  if (height <= 1e-6) return 0;
  const ratio = (Math.tan(angle) * radius) / height;
  if (ratio <= 0) return 0;
  // κ/(1+κ) = tan(angle)·R/H has no solution once the ratio reaches one: the
  // curve cannot both start at H and arrive that steeply from R.
  const bounded = Math.min(0.88, ratio);
  return bounded / (1 - bounded);
}

/** Curve parameter at which the curve first drops to `targetHeight`. */
function arrivalParameterAtHeight(curve: ArrivalCurve, targetHeight: number) {
  if (curve.height <= 1e-6) return 0;
  const scaled = (targetHeight * (1 + curve.kappa)) / curve.height;
  const remaining =
    (-curve.kappa +
      Math.sqrt(curve.kappa * curve.kappa + 4 * Math.max(0, scaled))) /
    2;
  return Math.min(0.94, Math.max(0.04, 1 - remaining));
}

function arrivalHeight(curve: ArrivalCurve, remaining: number) {
  return (
    (curve.height * remaining * (remaining + curve.kappa)) / (1 + curve.kappa)
  );
}

/** Fraction of the total sweep completed at `s`, and its derivative. Both are
 * needed together and must not drift apart. */
function arrivalSweepFraction(s: number) {
  const remaining = 1 - s;
  return 1 - remaining * remaining * remaining;
}

function arrivalSweepRate(remaining: number) {
  return 3 * remaining * remaining;
}

function arrivalPoint(curve: ArrivalCurve, s: number): PilotVector {
  const remaining = 1 - s;
  const radius = curve.radius * remaining;
  const height = arrivalHeight(curve, remaining);
  const angle = curve.startAngle + curve.sweepAngle * arrivalSweepFraction(s);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x:
      curve.contact.x +
      curve.lift.x * height +
      (curve.tangent.x * cos + curve.bitangent.x * sin) * radius,
    y:
      curve.contact.y +
      curve.lift.y * height +
      (curve.tangent.y * cos + curve.bitangent.y * sin) * radius,
    z:
      curve.contact.z +
      curve.lift.z * height +
      (curve.tangent.z * cos + curve.bitangent.z * sin) * radius,
  };
}

/** d/ds of the curve, normalized and scaled to `speed`. */
function arrivalVelocity(curve: ArrivalCurve, s: number, speed: number) {
  const remaining = 1 - s;
  const angle = curve.startAngle + curve.sweepAngle * arrivalSweepFraction(s);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const radialRate = -curve.radius;
  const heightRate =
    (-curve.height * (2 * remaining + curve.kappa)) / (1 + curve.kappa);
  // r(s) · dθ/ds. Front-loaded winding makes this fall off as the square of the
  // remaining parameter rather than linearly, so the last of the arc is a
  // straight radial run-in and the heading is settled before contact.
  const swirl =
    curve.radius * remaining * curve.sweepAngle * arrivalSweepRate(remaining);
  const x =
    curve.lift.x * heightRate +
    (curve.tangent.x * cos + curve.bitangent.x * sin) * radialRate +
    (-curve.tangent.x * sin + curve.bitangent.x * cos) * swirl;
  const y =
    curve.lift.y * heightRate +
    (curve.tangent.y * cos + curve.bitangent.y * sin) * radialRate +
    (-curve.tangent.y * sin + curve.bitangent.y * cos) * swirl;
  const z =
    curve.lift.z * heightRate +
    (curve.tangent.z * cos + curve.bitangent.z * sin) * radialRate +
    (-curve.tangent.z * sin + curve.bitangent.z * cos) * swirl;
  const length = Math.hypot(x, y, z);
  if (length < 1e-8) return { x: 0, y: 0, z: 0 };
  return {
    x: (x / length) * speed,
    y: (y / length) * speed,
    z: (z / length) * speed,
  };
}

/** Angle below the surface plane where the curve reaches contact. */
export function insectArrivalAngle(curve: {
  radius: number;
  height: number;
  kappa: number;
}) {
  if (curve.radius <= 1e-8) return Math.PI / 2;
  return Math.atan(
    (curve.height * curve.kappa) / ((1 + curve.kappa) * curve.radius),
  );
}

/** Sample count across the whole curve. Thirty keeps every chord well under a
 * centimetre near contact, which is what the folded sweep needs to be honest. */
const ARRIVAL_SAMPLES = 30;

/** Sizes the Arrival Curve is tried at, largest first. The smallest is for
 * Perches with a neighbour inside arm's reach — the About collective mark
 * stands about a hand from the desk lamp, and every larger arc sweeps into it.
 * Shrinking is free of character cost: radius and height scale together, so
 * κ and the arrival angle are identical at every size. */
const ARRIVAL_SCALES = [1, 0.68, 0.46, 0.32] as const;

/**
 * Fractions of the authored winding the curve is tried at, fullest first.
 *
 * Without this the entry bearing search is close to useless on a tight site:
 * at the authored 1.2 turns the arc orbits the Perch completely, so it sweeps
 * every side no matter which one it started on, and rotating the entry cannot
 * escape a blocked neighbour. The About collective mark stands in a six
 * centimetre gap between the desk lamp and the TJ medallion, and no rotation
 * and no size of a full orbit fits between them.
 *
 * A part-turn arrival is a real butterfly gesture rather than a degraded one —
 * it curves in from the open side and settles instead of circling first — and
 * it is only reached for after every full-winding candidate has failed.
 */
const ARRIVAL_TURN_FRACTIONS = [1, 0.45, 0.25] as const;

/**
 * Tilts of the curve's lift axis away from the Perch normal, in radians.
 *
 * Zero is the old behaviour — the spiral sits directly over the contact point
 * and the insect descends onto it. At 0.95 rad the axis is 54° off the normal,
 * so the arc's high end is out to the SIDE and the insect comes in almost
 * level, banking up onto the Perch at the last moment.
 *
 * Which tilt an attempt uses comes from that attempt's `variation`, so a Perch
 * gets a genuinely different arrival each time rather than one house style with
 * jitter. Zero leads the list deliberately: it is both the fallback pass and
 * what a caller that supplies no variation gets, so a cramped site that can
 * only be reached from directly above still can be, and every non-varying
 * caller keeps the arrival it already had.
 */
const ARRIVAL_TILTS = [0, 0.45, 0.75, 1.02, 1.24] as const;

/** Absolute bearing difference between entry slot `step` and where the insect
 * actually is, wrapped into [0, π]. */
function entryBearingCost(step: number, bearing: number) {
  const delta = (step / 8) * Math.PI * 2 - bearing;
  return Math.abs(
    (((delta % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI,
  );
}

/**
 * How far out in front of the Unit the approach connector stages, as candidate
 * depths tried in order. The via itself is derived per candidate — see
 * `approachStagingVia`.
 */
const APPROACH_STAGING_DEPTHS = [0.55, 1.05] as const;

const STAGING_LOCAL = { x: 0, y: 0, z: 0 };

/**
 * A via point for the approach connector: straight out in front of the Unit
 * from the mouth of the Arrival Curve, at the mouth's own height.
 *
 * The connector is otherwise a single Hermite from wherever the insect is to
 * that mouth, and a single Hermite cannot go around anything. That was
 * survivable while roaming happened in the 21 cm slab between the shelf
 * planks, because a Perch and a roaming insect were always on the same side of
 * every plank. It stopped being survivable when the Flight Volume opened to
 * the full 2.2 m of air (ADR 0003): a resident now spends most of its life
 * ABOVE the top plank while most of its Perches sit UNDER one, with an
 * unbroken 2.7 m board in between. Measured on the About shelf, that rejected
 * every candidate for three of its four Perches.
 *
 * Taking the height from the ENTRY rather than from the contact is the whole
 * trick. An earlier version lifted a fixed fraction of the arrival height off
 * the contact, which let the via sit ABOVE a plank whose Perch was below it —
 * so the second leg had to descend back through the board, and the About desk
 * lamp stayed unreachable at every size and winding. A via level with the
 * mouth can only fly the crossing the arrival already proved it can make.
 */
function approachStagingVia(
  volume: InsectFlightVolume,
  entry: PilotVector,
  depth: number,
  out: PilotVector,
) {
  insectFlightVolumeLocal(volume, entry, STAGING_LOCAL);
  insectFlightVolumePoint(
    volume,
    {
      x: STAGING_LOCAL.x,
      y: STAGING_LOCAL.y,
      z: Math.max(STAGING_LOCAL.z + depth, volume.extent.frontZ + depth),
    },
    out,
  );
}

/**
 * A connector that goes out to `via` and then turns in to the curve mouth, as
 * two Hermites sharing a velocity at the join so the whole thing stays one
 * continuous gesture rather than a corner. The via velocity points at the
 * entry, which turns the insect on the way past instead of stopping it there.
 */
function connectorVia(
  via: PilotVector,
  start: InsectKinematicSample,
  entry: PilotVector,
  entryVelocity: PilotVector,
  speed: number,
): PilotVector[] {
  const heading = normalize(
    { x: entry.x - via.x, y: entry.y - via.y, z: entry.z - via.z },
    { x: 0, y: -1, z: 0 },
  );
  const viaVelocity = {
    x: heading.x * speed,
    y: heading.y * speed,
    z: heading.z * speed,
  };
  const outbound = Math.max(
    0.7,
    Math.hypot(
      via.x - start.position.x,
      via.y - start.position.y,
      via.z - start.position.z,
    ) / speed,
  );
  const inbound = Math.max(
    0.6,
    Math.hypot(entry.x - via.x, entry.y - via.y, entry.z - via.z) / speed,
  );
  const first = hermite(
    start.position,
    start.velocity,
    via,
    viaVelocity,
    outbound,
    Math.max(10, Math.ceil(outbound * 12)),
  );
  const second = hermite(
    via,
    viaVelocity,
    entry,
    entryVelocity,
    inbound,
    Math.max(10, Math.ceil(inbound * 12)),
  );
  first.push(...second.slice(1));
  return first;
}

export function compileInsectLandingPlan(
  options: InsectLandingPlanRequest,
): InsectLandingPlanResult {
  const normal = normalize({ ...options.target.normal }, { x: 0, y: 1, z: 0 });
  const tangentInput = { ...options.target.tangent };
  const tangentDot =
    tangentInput.x * normal.x +
    tangentInput.y * normal.y +
    tangentInput.z * normal.z;
  const tangent = normalize(
    {
      x: tangentInput.x - normal.x * tangentDot,
      y: tangentInput.y - normal.y * tangentDot,
      z: tangentInput.z - normal.z * tangentDot,
    },
    Math.abs(normal.y) < 0.9
      ? { x: normal.z, y: 0, z: -normal.x }
      : { x: 1, y: 0, z: 0 },
  );
  const bitangent = normalize(
    {
      x: normal.y * tangent.z - normal.z * tangent.y,
      y: normal.z * tangent.x - normal.x * tangent.z,
      z: normal.x * tangent.y - normal.y * tangent.x,
    },
    { x: 0, y: 0, z: 1 },
  );
  const contact = {
    x: options.target.point.x + normal.x * options.target.clearance,
    y: options.target.point.y + normal.y * options.target.clearance,
    z: options.target.point.z + normal.z * options.target.clearance,
  };
  // The authored Perch clearance can ask for more room than the curve's own
  // designed height, never less: a squat helix has nowhere to shed height and
  // degenerates back into the vertical drop this replaced.
  const height = Math.max(
    options.profile.approachDistance,
    options.target.approachDistance ?? 0,
  );
  const radius = Math.max(
    options.profile.approachLateral,
    options.target.approachLateral ?? 0,
  );
  const kappa = solveArrivalKappa(radius, height, options.profile.arrivalAngle);
  // Scale-invariant: shrinking radius and height together leaves R/H, and
  // therefore κ and the arrival angle, exactly where they were authored.
  const arrivalAngle = insectArrivalAngle({ radius, height, kappa });
  const foldedSweep = options.foldedSweep ?? options.sweep;
  // Where the open-wing sphere stops fitting between the curve and the
  // support, and where the folded pose is close enough to be a settle.
  const openWingHeight =
    options.profile.wingRadius + options.profile.wanderAmplitude;

  // Bearing of the insect around the Perch normal, so the candidate entries can
  // be tried nearest-first. Entering the spiral on the side you arrived from is
  // both the shortest connector — and therefore the least likely to cut a
  // corner through a plank — and the more legible gesture.
  const toStart = {
    x: options.start.position.x - contact.x,
    y: options.start.position.y - contact.y,
    z: options.start.position.z - contact.z,
  };
  const startBearing = Math.atan2(
    toStart.x * bitangent.x + toStart.y * bitangent.y + toStart.z * bitangent.z,
    toStart.x * tangent.x + toStart.y * tangent.y + toStart.z * tangent.z,
  );
  const variation = Math.min(1, Math.max(0, options.variation ?? 0));
  // Nearest-first is still the default order — entering on the side you
  // arrived from is the shortest connector and the most legible gesture — but
  // the bias is only strong enough to rank ties. A quarter turn of jitter is
  // enough that two residents landing on the same Perch do not fly the same
  // line onto it.
  const bearingJitter = (variation - 0.5) * 2;
  const ENTRY_BEARINGS = Array.from({ length: 8 }, (_, step) => step).sort(
    (a, b) =>
      entryBearingCost(a, startBearing) -
      entryBearingCost(b, startBearing) +
      (bearingJitter * (((a * 2654435761) % 97) - ((b * 2654435761) % 97))) /
        97,
  );
  // Some arrivals orbit once and a half, some barely curve in at all.
  const turnScale = 0.72 + variation * 0.78;

  let approach: PilotVector[] | null = null;
  let hover: PilotVector[] | null = null;
  let touchdown: PilotVector[] | null = null;
  let foundClearApproach = false;
  let foundClearHover = false;
  // A direct connector is the shorter, better-looking arrival, so it is always
  // tried first — unless the straight line from the insect to the Perch is
  // already obstructed, in which case staging is what will work and trying
  // forty-eight direct candidates first is forty-eight wasted sweeps.
  const staging = options.volume ? APPROACH_STAGING_DEPTHS : [];
  const apex = {
    x: contact.x + normal.x * height,
    y: contact.y + normal.y * height,
    z: contact.z + normal.z * height,
  };
  const directLooksOpen = options.sweep(
    "approach",
    options.start.position,
    apex,
  );
  const vias: (number | null)[] = directLooksOpen
    ? [null, ...staging]
    : [...staging, null];
  const via = { x: 0, y: 0, z: 0 };
  // Eight entry bearings, each winding direction, at four sizes and three
  // windings. Rotating the entry escapes a blocked side of a Perch, shortening
  // the winding is what makes that rotation mean anything, and shrinking the
  // whole curve is what lets the same gesture fit under the plank above a
  // lower-shelf Perch, where there is barely thirty centimetres of headroom.
  // Radius and height shrink together, so the arrival angle is identical at
  // every size.
  const CANDIDATES_PER_SCALE = 16;
  const CANDIDATES_PER_TURN = ARRIVAL_SCALES.length * CANDIDATES_PER_SCALE;
  // One slant per attempt, chosen by that attempt's own variation, with the
  // overhead descent as the fallback pass. Searching every tilt against every
  // bearing, winding and size would be four times the sweeps for a Perch that
  // is usually solved by the first candidate — and the fallback is what
  // guarantees a cramped site keeps the arrival it already had.
  const chosenTilt =
    ARRIVAL_TILTS[
      Math.min(
        ARRIVAL_TILTS.length - 1,
        Math.floor(variation * ARRIVAL_TILTS.length),
      )
    ]!;
  const tiltPasses = chosenTilt === 0 ? [0] : [chosenTilt, 0];
  const lift = { x: 0, y: 0, z: 0 };
  for (const tilt of tiltPasses) {
    if (approach) break;
    const tiltCos = Math.cos(tilt);
    const tiltSin = Math.sin(tilt);
    for (const viaDepth of vias) {
      if (approach) break;
      for (
        let candidate = 0;
        candidate < ARRIVAL_TURN_FRACTIONS.length * CANDIDATES_PER_TURN &&
        !approach;
        candidate++
      ) {
        const turnFraction =
          ARRIVAL_TURN_FRACTIONS[Math.floor(candidate / CANDIDATES_PER_TURN)]!;
        const withinTurn = candidate % CANDIDATES_PER_TURN;
        const scale = ARRIVAL_SCALES[Math.floor(withinTurn / 16)]!;
        const preferred = variation < 0.5 ? 1 : -1;
        const winding = withinTurn % 2 === 0 ? preferred : -preferred;
        const startAngle =
          (ENTRY_BEARINGS[Math.floor(withinTurn / 2) % 8]! / 8) * Math.PI * 2;
        // Lean the lift axis toward the side the spiral starts on, so the high
        // end of the arc is where the insect is coming from. Leaning it the
        // other way would make the insect cross over the Perch and come back.
        const entryCos = Math.cos(startAngle);
        const entrySin = Math.sin(startAngle);
        lift.x =
          normal.x * tiltCos +
          (tangent.x * entryCos + bitangent.x * entrySin) * tiltSin;
        lift.y =
          normal.y * tiltCos +
          (tangent.y * entryCos + bitangent.y * entrySin) * tiltSin;
        lift.z =
          normal.z * tiltCos +
          (tangent.z * entryCos + bitangent.z * entrySin) * tiltSin;
        const liftLength = Math.hypot(lift.x, lift.y, lift.z) || 1;
        lift.x /= liftLength;
        lift.y /= liftLength;
        lift.z /= liftLength;
        const curve: ArrivalCurve = {
          contact,
          normal,
          tangent,
          bitangent,
          lift: { ...lift },
          radius: radius * scale,
          height: height * scale,
          kappa,
          sweepAngle:
            winding *
            options.profile.arrivalTurns *
            turnFraction *
            turnScale *
            Math.PI *
            2,
          startAngle,
        };
        const points: PilotVector[] = [];
        for (let index = 0; index <= ARRIVAL_SAMPLES; index++)
          points.push(arrivalPoint(curve, index / ARRIVAL_SAMPLES));
        // Force the last sample onto the exact contact object: the pilot's
        // terminal tolerance is four millimetres and floating point should not
        // spend it, and sharing the object with `launch[0]` keeps a moved Perch
        // translating one point once.
        points[ARRIVAL_SAMPLES] = contact;

        const hoverIndex = Math.min(
          ARRIVAL_SAMPLES - 2,
          Math.max(
            1,
            Math.round(
              arrivalParameterAtHeight(curve, openWingHeight) * ARRIVAL_SAMPLES,
            ),
          ),
        );
        const touchdownIndex = Math.min(
          ARRIVAL_SAMPLES - 1,
          Math.max(
            hoverIndex + 1,
            Math.round(
              arrivalParameterAtHeight(curve, curve.height * 0.2) *
                ARRIVAL_SAMPLES,
            ),
          ),
        );

        // Fly in from wherever the insect actually is. Matching the curve's own
        // tangent at the join is what keeps the whole descent one continuous
        // gesture instead of a connector followed by a spiral.
        const entry = points[0]!;
        const entryVelocity = arrivalVelocity(
          curve,
          0,
          options.profile.approachSpeed,
        );
        const entryDuration = Math.max(
          0.8,
          Math.hypot(
            entry.x - options.start.position.x,
            entry.y - options.start.position.y,
            entry.z - options.start.position.z,
          ) / options.profile.approachSpeed,
        );
        const stagingVolume = options.volume ?? null;
        const staged = viaDepth !== null && stagingVolume !== null;
        if (viaDepth !== null && stagingVolume !== null)
          approachStagingVia(stagingVolume, entry, viaDepth, via);
        const candidateApproach = staged
          ? connectorVia(
              via,
              options.start,
              entry,
              entryVelocity,
              options.profile.approachSpeed,
            )
          : hermite(
              options.start.position,
              options.start.velocity,
              entry,
              entryVelocity,
              entryDuration,
              Math.max(12, Math.ceil(entryDuration * 12)),
            );
        candidateApproach.push(...points.slice(1, hoverIndex + 1));
        if (!routeIsClear("approach", candidateApproach, options.sweep))
          continue;
        foundClearApproach = true;

        const candidateHover = points.slice(hoverIndex, touchdownIndex + 1);
        if (!routeIsClear("hover", candidateHover, foldedSweep)) continue;
        foundClearHover = true;

        const candidateTouchdown = points.slice(touchdownIndex);
        if (!routeIsClear("touchdown", candidateTouchdown, foldedSweep))
          continue;

        approach = candidateApproach;
        hover = candidateHover;
        touchdown = candidateTouchdown;
      }
    }
  }
  if (!approach)
    return {
      ok: false,
      rejectionCode: foundClearHover
        ? "touchdown-blocked"
        : foundClearApproach
          ? "hover-blocked"
          : "approach-blocked",
    };
  if (!hover) return { ok: false, rejectionCode: "hover-blocked" };
  if (!touchdown) return { ok: false, rejectionCode: "touchdown-blocked" };

  let launch: PilotVector[] | null = null;
  let rejoin: PilotVector[] | null = options.rejoin ? null : [];
  for (const slope of LAUNCH_SLOPES) {
    for (let candidate = 0; candidate < 8; candidate++) {
      const angle = (candidate / 8) * Math.PI * 2;
      const direction = normalize(
        {
          x:
            normal.x * slope.normal +
            tangent.x * Math.cos(angle) * slope.tangent +
            bitangent.x * Math.sin(angle) * slope.tangent,
          y:
            normal.y * slope.normal +
            tangent.y * Math.cos(angle) * slope.tangent +
            bitangent.y * Math.sin(angle) * slope.tangent,
          z:
            normal.z * slope.normal +
            tangent.z * Math.cos(angle) * slope.tangent +
            bitangent.z * Math.sin(angle) * slope.tangent,
        },
        normal,
      );
      const launchTarget = {
        x: contact.x + direction.x * options.profile.launchDistance,
        y: contact.y + direction.y * options.profile.launchDistance,
        z: contact.z + direction.z * options.profile.launchDistance,
      };
      // Rise normally with closed wings until the complete flying sphere can
      // open above the contacted object. Only the second leg uses the ordinary
      // full-envelope launch sweep.
      const unfoldDistance =
        options.profile.wingRadius + options.profile.wanderAmplitude + 0.012;
      const unfold = {
        x: contact.x + normal.x * unfoldDistance,
        y: contact.y + normal.y * unfoldDistance,
        z: contact.z + normal.z * unfoldDistance,
      };
      if (!foldedSweep("launch", contact, unfold)) continue;
      if (!options.sweep("launch", unfold, launchTarget)) continue;
      const candidateLaunch = [contact, unfold, launchTarget];
      if (!options.rejoin) {
        launch = candidateLaunch;
        break;
      }
      const rejoinDuration = Math.max(
        1,
        Math.hypot(
          options.rejoin.position.x - launchTarget.x,
          options.rejoin.position.y - launchTarget.y,
          options.rejoin.position.z - launchTarget.z,
        ) / options.profile.launchSpeed,
      );
      const candidateRejoin = hermite(
        launchTarget,
        {
          x: direction.x * options.profile.launchSpeed,
          y: direction.y * options.profile.launchSpeed,
          z: direction.z * options.profile.launchSpeed,
        },
        options.rejoin.position,
        options.rejoin.velocity,
        rejoinDuration,
        Math.max(12, Math.ceil(rejoinDuration * 12)),
      );
      if (!routeIsClear("rejoin", candidateRejoin, options.sweep)) continue;
      launch = candidateLaunch;
      rejoin = candidateRejoin;
      break;
    }
    if (launch) break;
  }
  if (!launch && !options.rejoin) {
    // A steering resident's departure is governed by Escape, which by decision
    // 2.7 can never fail to take off: it redirects at 1.5 s and force-releases
    // at 3 s, and its direction search proceeds on the highest-clearance
    // candidate rather than giving up. Refusing to LAND somewhere we cannot
    // pre-prove a launch corridor is therefore a stricter rule than departure
    // actually obeys, and it costs real sites: the About collective mark sits
    // under the desk lamp's arch, whose bounding box swallows the air above
    // the mark, so all sixteen launch candidates fail on a Perch that is
    // otherwise reachable, landable, and clear to rest on.
    //
    // Emit the outward normal as a best-effort launch instead. If a step is
    // refused in flight the pilot records `launch-blocked` and keeps
    // integrating, which is precisely the dynamic Escape it would have used
    // anyway. A Perch whose ARRIVAL cannot be proven is still refused.
    const unfoldDistance =
      options.profile.wingRadius + options.profile.wanderAmplitude + 0.012;
    launch = [
      contact,
      {
        x: contact.x + normal.x * unfoldDistance,
        y: contact.y + normal.y * unfoldDistance,
        z: contact.z + normal.z * unfoldDistance,
      },
      {
        x: contact.x + normal.x * options.profile.launchDistance,
        y: contact.y + normal.y * options.profile.launchDistance,
        z: contact.z + normal.z * options.profile.launchDistance,
      },
    ];
  }
  if (!launch) return { ok: false, rejectionCode: "launch-blocked" };
  if (!rejoin) return { ok: false, rejectionCode: "rejoin-blocked" };

  return {
    ok: true,
    plan: {
      perchId: options.perchId,
      collisionRevision: options.collisionRevision,
      approach,
      hover,
      touchdown,
      launch,
      launchFoldedThrough: 1,
      rejoin,
      contact,
      normal,
      tangent,
      rejoinVelocity: options.rejoin
        ? { ...options.rejoin.velocity }
        : { x: 0, y: 0, z: 0 },
      arrivalAngle,
    },
  };
}

/**
 * Full width of the resting-yaw spread, in radians, about the contact normal.
 *
 * Facing comes from the direction the insect arrived, which is the honest
 * source — but residents approach a given shelf from broadly the same side, so
 * on its own it still produced a row of near-parallel perched insects. Owner
 * review, on being asked about landing variation: "I more meant like rotation."
 *
 * A full turn would be wrong: real insects on a ledge do broadly face out from
 * it, and a butterfly pointing into the shelf reads as a mistake rather than as
 * variety. Two thirds of a turn keeps every arrival plausible while making no
 * two of them line up.
 */
export const INSECT_LANDING_YAW = Math.PI * 0.66;

export const LANDING_TIMING = {
  // Occupancy should rise from insects staying, not from more traffic, and
  // the target is two to three settled on the shelf you are looking at. With
  // three residents per Unit that needs each of them perched about two thirds
  // of the time, so rest has to dominate the cycle rather than punctuate it:
  // a 12-25 s rest against a 15-30 s flight gap averaged barely one.
  //
  // Live measurement then said 20-40 s still was not enough: across a walk of
  // the whole room, samples came out 23% approaching and 6% resting. An
  // approach that is abandoned costs the whole cycle and leaves nothing on the
  // shelf, so the ratio has to be bought at both ends — a longer stay, and a
  // shorter wait between tries.
  // ...and then the owner watched it: "how long can butterflies dwell? seems
  // like too long — shouldn't be more than like 15 seconds."
  //
  // He is right, and the reasoning above had the causality backwards. A long
  // rest buys occupancy by making each landing LAST rather than by making
  // landings HAPPEN, and with three slots per shelf a 46-second average meant
  // the same three Perches were held for a minute at a time. Measured over
  // 40 s on five shelves, that is exactly what the room looked like: three
  // sites occupied and every other site 100% ready and never once visited —
  // which is the real content of "I still haven't seen a butterfly land on the
  // boat" and "can we let them land on the barbell". The sites were fine. They
  // were simply never free at the moment anyone was choosing.
  //
  // Shorter rests cost some standing occupancy and buy turnover, arrivals, and
  // coverage of the whole shelf. The gaps come down with it so the slot refills
  // promptly, and `BUTTERFLY_OCCUPANCY.engaged` goes up by one to hold the
  // headline number closer to where it was.
  butterflyRest: [9, 15],
  mothRest: [2, 6],
  flight: [2, 5],
  retryBackoff: [2, 3.5],
  pointerDepartPx: 70,
  pointerCancelPx: 100,
  pointerConfirm: [0.08, 0.12],
} as const;

export function pointerDisturbanceIsConfirmed(options: {
  pointerType: string;
  recentActivity: boolean;
  phase: "approach" | "hover" | "touchdown" | "rest";
  distancePx: number;
  nearFor: number;
  confirmation: number;
}) {
  if (options.pointerType === "touch" || !options.recentActivity) return false;
  const threshold =
    options.phase === "approach"
      ? LANDING_TIMING.pointerCancelPx
      : LANDING_TIMING.pointerDepartPx;
  return (
    options.distancePx < threshold && options.nearFor >= options.confirmation
  );
}

/** Stable 0..1 noise. No shared PRNG means mount order cannot synchronize or
 * reshuffle wildlife. */
export function landingNoise(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 91.733 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
}
