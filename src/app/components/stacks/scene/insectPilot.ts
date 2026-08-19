// Pure, allocation-free flight pilot shared by butterflies and moths.
//
// Rendering supplies a small world adapter. Roam has two modes: butterflies
// integrate their own velocity from the Intent Layer inside a Flight Volume,
// while moths still play back the analytic lamp-cone sampler that was never
// route-like and was never rejected. Everything from the Landing Cycle onward
// is shared, and the pilot owns transition kinematics and phase completion, so
// a timer can never advance an insect past a position it has not actually
// reached.
import { INSECT_ENVELOPES } from "./insectCollision";
import type { InsectContainment } from "./insectContainment";
import type { InsectFlightVolume } from "./insectFlightVolume";
import {
  type InsectLandingPlan,
  type InsectLandingPlanRequest,
  type InsectLandingPlanResult,
  compileInsectLandingPlan,
} from "./insectLanding";
import type { InsectPerchRejectionCode } from "./insectPerchDiagnostic";
import {
  type InsectSteeringProfile,
  type InsectSteeringState,
  advanceInsectSteering,
  createInsectSteeringState,
  integrateInsectRoam,
} from "./insectSteering";

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const FOLDED_WING_ANGLE = Math.PI / 2 - 0.12;
/**
 * Fractions of a refused landing step to retry, shortest last. The obstacle a
 * full step crosses is usually further along it than the tracking error is, so
 * a shorter step through the same air is ordinarily clear.
 */
const LANDING_SLIDE_FRACTIONS = [0.55, 0.24] as const;
/**
 * Consecutive fully-refused steps before a landing is abandoned. At the 1/120 s
 * fixed step this is a fifth of a second of genuinely blocked air — long enough
 * that transient tracking error cannot reach it, short enough that a Perch a
 * prop has actually moved onto is given up promptly.
 */
const LANDING_REFUSAL_STEPS = 24;
const WING_FOLD_RATE = 4.8;
const FIXED_STEP = 1 / 120;
const MAX_FRAME_DELTA = 0.1;
const EPSILON = 1e-9;
/** Displacement from the contact that ends an Escape. Defined on ground made,
 * never on arriving anywhere, so it always resolves. */
const ESCAPE_DISTANCE = 0.25;
/** Try a different way out after this long without progress. */
const ESCAPE_REDIRECT_SECONDS = 1.5;
/** Give up on the corridor entirely and let go of the Perch. */
const ESCAPE_RELEASE_SECONDS = 3;

export type InsectPilotPhase =
  | "roam"
  | "approach"
  | "hover"
  | "touchdown"
  | "rest"
  | "launch"
  | "rejoin";

export type PilotVector = { x: number; y: number; z: number };

export type InsectKinematicSample = {
  position: PilotVector;
  velocity: PilotVector;
  acceleration: PilotVector;
};

export type InsectReservationResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      rejectionCode: Exclude<InsectPerchRejectionCode, "none">;
    }>;

export type InsectLandingTarget = {
  id: string;
  point: PilotVector;
  normal: PilotVector;
  tangent: PilotVector;
  clearance: number;
  /** Distance outward from contact where final braking begins. */
  approachDistance?: number;
  /** Signed tangent offset that gives the arrival a shallow arc. */
  approachLateral?: number;
};

export type InsectPilotProfile = {
  maxSpeed: number;
  maxAcceleration: number;
  maxJerk: number;
  wingRadius: number;
  approachSpeed: number;
  touchdownSpeed: number;
  launchSpeed: number;
  /** Height above contact where the Arrival Curve begins. */
  approachDistance: number;
  /** Starting radius of the Arrival Curve around the Perch normal. */
  approachLateral: number;
  /** Angle below the surface plane the Arrival Curve reaches contact at. */
  arrivalAngle: number;
  /** Turns the Arrival Curve makes around the normal on its way in. */
  arrivalTurns: number;
  launchDistance: number;
  acquireDistance: number;
  positionTolerance: number;
  velocityTolerance: number;
  contactTolerance: number;
  contactVelocityTolerance: number;
  rejoinPositionTolerance: number;
  rejoinVelocityTolerance: number;
  velocityResponse: number;
  roamPositionGain: number;
  roamVelocityGain: number;
  wanderAmplitude: number;
  wanderFrequency: number;
  wanderDecayDistance: number;
  wingFrequency: number;
  restingWingFrequency: number;
  wingAmplitude: number;
  restingWingAmplitude: number;
  /** What a settled insect does with its wings. Presentation only — no
   * translation, which would re-enter collision. */
  restingIdle: InsectRestingIdle;
  wingAmplitudeRate: number;
  wingFrequencyRate: number;
  /** Speed at which the Flap Layer reads as full cruise. Deliberately not
   * `maxSpeed`: the sigmoid is centred on half of this, and ordinary roam sits
   * well under the pilot's ceiling, so measuring against `maxSpeed` would
   * leave every insect permanently in its hover pose. */
  flapReferenceSpeed: number;
  /** Wingbeat rate at hover. Not zero — a hovering butterfly beats slowly and
   * deeply, it does not go still. */
  hoverWingFrequency: number;
  /** Wing amplitude at hover, which is LARGER than the cruise amplitude. This
   * is the decoupling that keeps a slow insect from freezing. */
  hoverWingAmplitude: number;
  /** Thorax pitch, at cruise. Both scale to zero at hover with the wingbeat. */
  bodyPitchAmplitude: number;
  bodyPitchFrequency: number;
  /** Nose-up angle held through the last beat before contact. */
  flarePitch: number;
  /** Distance from contact at which the flare begins. */
  flareDistance: number;
};

/**
 * The perched idle (the Flap Layer, presentation only).
 *
 * What this replaces is a constant ±5.7° at 1.05 Hz, which is not what a
 * settled butterfly does with its wings: it is STILL, for a long time, and
 * then opens and closes them once, slowly, and is still again. A permanent
 * low-amplitude twitch reads as an idling machine, and twenty-one of them
 * twitching at the same rate reads as one machine.
 *
 * `interval` and `depth` are varied per insect from its own seed, and the
 * three wing colours carry deliberately different temperaments, so no two
 * perched residents are ever on the same schedule.
 */
export type InsectRestingIdle = Readonly<{
  /** Seconds of stillness between openings, low and high. */
  interval: readonly [number, number];
  /** Seconds one deliberate open-and-close takes. */
  duration: number;
  /** How far the wings open, as a fraction of the folded angle. */
  depth: number;
}>;

export type InsectRoamConfig = {
  profile: InsectSteeringProfile;
  /** The shape this insect belongs to. Mutable: a migrating butterfly is
   * handed a neighbouring Unit's containment (ADR 0004), which is the whole of
   * what changing Residency means to the pilot. */
  containment: InsectContainment;
  /**
   * The Unit frame the Landing Plan stages its approach through, when the
   * insect has one. Deliberately separate from `containment`: staging is a
   * geometric fact about a shelf, and a moth contained by a Lamp Cone has no
   * Unit frame and keeps the direct connector.
   */
  volume: InsectFlightVolume | null;
  /**
   * World-space unit direction of a directed crossing, or null. Owned by the
   * resident's renderer, which is the only thing that knows where the camera
   * is; the pilot only forwards it to the Intent Layer.
   */
  transit: { x: number; y: number; z: number } | null;
};

export const BUTTERFLY_PILOT_PROFILE: InsectPilotProfile = {
  maxSpeed: 1.55,
  maxAcceleration: 2.8,
  maxJerk: 18,
  wingRadius: INSECT_ENVELOPES.butterfly.sweepRadius,
  approachSpeed: 0.78,
  touchdownSpeed: 0.22,
  launchSpeed: 0.9,
  approachDistance: 0.26,
  approachLateral: 0.15,
  arrivalAngle: 0.436,
  arrivalTurns: 1.2,
  launchDistance: 0.34,
  acquireDistance: 1.45,
  positionTolerance: 0.018,
  velocityTolerance: 0.07,
  contactTolerance: 0.004,
  contactVelocityTolerance: 0.025,
  rejoinPositionTolerance: 0.018,
  rejoinVelocityTolerance: 0.05,
  velocityResponse: 0.24,
  roamPositionGain: 2.4,
  roamVelocityGain: 1.8,
  wanderAmplitude: 0.045,
  wanderFrequency: 1.17,
  wanderDecayDistance: 0.34,
  wingFrequency: 8.8,
  // Not a twitch rate any more: the residual sway a settled insect has while
  // it is doing nothing. The episodic opening is `restingIdle`.
  restingWingFrequency: 0.26,
  wingAmplitude: 1,
  restingWingAmplitude: 0.019,
  restingIdle: {
    interval: [3.4, 9.5],
    duration: 1.15,
    depth: 0.72,
  },
  wingAmplitudeRate: 2.8,
  wingFrequencyRate: 18,
  flapReferenceSpeed: 1.05,
  hoverWingFrequency: 3.4,
  hoverWingAmplitude: 1.3,
  bodyPitchAmplitude: 0.524,
  bodyPitchFrequency: 3,
  flarePitch: 0.56,
  flareDistance: 0.05,
};

export const MOTH_PILOT_PROFILE: InsectPilotProfile = {
  ...BUTTERFLY_PILOT_PROFILE,
  maxSpeed: 1.35,
  maxAcceleration: 2.45,
  maxJerk: 15,
  wingRadius: INSECT_ENVELOPES.moth.sweepRadius,
  approachSpeed: 0.66,
  touchdownSpeed: 0.19,
  launchSpeed: 0.76,
  approachDistance: 0.24,
  approachLateral: 0.13,
  arrivalAngle: 0.436,
  arrivalTurns: 1.1,
  launchDistance: 0.3,
  acquireDistance: 1.15,
  wanderAmplitude: 0.052,
  wanderFrequency: 0.92,
  wingFrequency: 7,
  restingWingFrequency: 0.19,
  restingWingAmplitude: 0.014,
  // A moth at rest holds its wings flatter and moves them less often than a
  // butterfly does. It is also the only one of the two you meet at night,
  // where any motion at all is more conspicuous.
  restingIdle: {
    interval: [5.5, 14],
    duration: 1.6,
    depth: 0.38,
  },
  wingAmplitudeRate: 2.3,
  wingFrequencyRate: 14,
  flapReferenceSpeed: 0.92,
  hoverWingFrequency: 2.6,
  hoverWingAmplitude: 1.22,
  bodyPitchAmplitude: 0.349,
  bodyPitchFrequency: 2.2,
  flarePitch: 0.42,
  flareDistance: 0.05,
};

/**
 * The renderer implements this against its analytic flight sampler, perch
 * occupancy registry, and conservative scene colliders. All arguments are
 * borrowed for the duration of the call; implementations must not retain
 * them.
 */
export interface InsectFlightWorld {
  sampleCruise(
    flightId: number,
    time: number,
    out: InsectKinematicSample,
  ): void;
  /** Signed distance to the nearest collider with its outward gradient, used
   * by soft-collision roaming. A world that omits it simply has no geometry to
   * steer around; roaming then relies on Flight Volume containment alone. */
  sampleDistanceField?(point: PilotVector, outGradient: PilotVector): number;
  sweepSphere(
    from: PilotVector,
    to: PilotVector,
    radius: number,
    allowReservedSupportContact?: boolean,
    allowPenetrationEscape?: boolean,
  ): boolean;
  /** Surface-aligned folded envelope used only after the hover inspection has
   * closed the wings for touchdown/rest. Older pure worlds may omit this and
   * retain the conservative spherical fallback. */
  sweepFolded?(
    from: PilotVector,
    to: PilotVector,
    normal: PilotVector,
    tangent: PilotVector,
    allowReservedSupportContact?: boolean,
  ): boolean;
  compileLandingPlan?(
    request: Omit<
      InsectLandingPlanRequest,
      "sweep" | "foldedSweep" | "collisionRevision"
    >,
  ): InsectLandingPlanResult;
  tryReserve(
    perchId: string,
    occupantId: string,
    plannedCollisionRevision?: number | null,
  ): boolean | InsectReservationResult;
  release(perchId: string, occupantId: string): void;
}

export type InsectPilotOptions = {
  occupantId: string;
  flightId: number;
  seed: number;
  initialTime: number;
  initial: InsectKinematicSample;
  profile: InsectPilotProfile;
  /** Present for a steering resident. Absent means the pilot plays back the
   * world's analytic cruise sampler during roam, which is what moths do. */
  roam?: InsectRoamConfig;
};

/**
 * What provoked an Escape. Severity is part of a Disturbance's identity, not a
 * strength dial: a grabbed prop yanks the insect off, a dragged neighbour
 * hurries it, and a passing cursor merely moves it along.
 */
export type InsectEscapeCause = "grab" | "drag" | "pointer" | "calm";

/** Acceleration in m/s²; speed as a multiple of the profile's ordinary
 * ceiling. `calm` is the unhurried end-of-rest departure, which is slower than
 * ordinary flight rather than faster. */
const ESCAPE_LIMITS: Record<
  InsectEscapeCause,
  { acceleration: number; speed: number }
> = {
  grab: { acceleration: 9, speed: 1.55 },
  drag: { acceleration: 6, speed: 1.25 },
  pointer: { acceleration: 4, speed: 1 },
  calm: { acceleration: 2.8, speed: 0.7 },
};

export type InsectPilotCommand =
  | { type: "land"; target: InsectLandingTarget; variation?: number }
  | { type: "depart"; away?: PilotVector; cause?: InsectEscapeCause }
  | { type: "cancel" }
  | { type: "update-perch"; target: InsectLandingTarget };

export type InsectPilotEvent =
  | "none"
  | "approach-started"
  | "approach-blocked"
  | "hover"
  | "touchdown"
  | "landed"
  | "launch"
  | "released"
  | "rejoined";

export type InsectPilot = {
  occupantId: string;
  flightId: number;
  profile: InsectPilotProfile;
  phase: InsectPilotPhase;
  event: InsectPilotEvent;
  time: number;
  cruiseTime: number;
  phaseAge: number;
  accumulator: number;
  position: PilotVector;
  velocity: PilotVector;
  acceleration: PilotVector;
  cruise: InsectKinematicSample;
  proposal: PilotVector;
  collisionProbe: PilotVector;
  collisionDirection: PilotVector;
  desiredAcceleration: PilotVector;
  point: PilotVector;
  normal: PilotVector;
  tangent: PilotVector;
  stage: PilotVector;
  contact: PilotVector;
  launchTarget: PilotVector;
  launchDirection: PilotVector;
  rejoinTarget: PilotVector;
  rejoinVelocity: PilotVector;
  rejoinStart: PilotVector;
  rejoinStartVelocity: PilotVector;
  rejoinDuration: number;
  reservedPerchId: string | null;
  landingPlan: InsectLandingPlan | null;
  routeIndex: number;
  routeTargetVelocity: PilotVector;
  plannedLaunch: boolean;
  rejectionCode: InsectPerchRejectionCode;
  wanderPhase: number;
  wingPhase: number;
  wingAmplitude: number;
  wingFrequency: number;
  wingFold: number;
  wingAngle: number;
  /** Seconds of stillness left before the next perched opening. */
  restIdleTimer: number;
  /** Seconds into the current opening, or −1 while still. */
  restIdleAge: number;
  /** How many openings this insect has performed. Only the schedule reads it,
   * so a long rest never repeats an interval. */
  restIdleCount: number;
  /** This insect's own opening depth, as a fraction of the folded angle. */
  restIdleDepth: number;
  /** Kept so the schedule can be re-rolled without the creator's arguments. */
  seed: number;
  /** Consecutive refused steps during a Landing Cycle. One refusal used to
   * end the landing outright (ADR 0005). */
  blockedSteps: number;
  roam: InsectRoamConfig | null;
  steering: InsectSteeringState | null;
  /** Nose-up thorax pitch in radians. Presentation only: the renderer applies
   * it, and it can never move the insect or change what it sweeps against. */
  bodyPitch: number;
  bodyPitchPhase: number;
  /** Where the current Escape started measuring its displacement from. */
  escapeOrigin: PilotVector;
  escapeCause: InsectEscapeCause;
  escapeRedirects: number;
};

function vector(x = 0, y = 0, z = 0): PilotVector {
  return { x, y, z };
}

function sample(): InsectKinematicSample {
  return {
    position: vector(),
    velocity: vector(),
    acceleration: vector(),
  };
}

function copy(out: PilotVector, value: PilotVector) {
  out.x = value.x;
  out.y = value.y;
  out.z = value.z;
}

function magnitude(x: number, y: number, z: number) {
  return Math.hypot(x, y, z);
}

function clampMagnitude(out: PilotVector, maximum: number) {
  const length = magnitude(out.x, out.y, out.z);
  if (length > maximum && length > EPSILON) {
    const scale = maximum / length;
    out.x *= scale;
    out.y *= scale;
    out.z *= scale;
  }
}

function normalize(
  out: PilotVector,
  fallbackX: number,
  fallbackY: number,
  fallbackZ: number,
) {
  const length = magnitude(out.x, out.y, out.z);
  if (length <= EPSILON) {
    out.x = fallbackX;
    out.y = fallbackY;
    out.z = fallbackZ;
    return;
  }
  out.x /= length;
  out.y /= length;
  out.z /= length;
}

function distance(a: PilotVector, b: PilotVector) {
  return magnitude(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * How long this insect stays still before its next opening.
 *
 * Deterministic per insect AND per opening, so two residents of the same
 * shelf never fall into step and neither of them repeats a cycle.
 */
export function restingIdleInterval(
  profile: Pick<InsectPilotProfile, "restingIdle">,
  seed: number,
  count: number,
) {
  const [low, high] = profile.restingIdle.interval;
  return low + (high - low) * stableNoise(seed * 7 + count * 131 + 53);
}

/** The wing opening at `age` seconds into one, as a fraction 0..1 of the
 * authored depth. One smooth open and close, never a cycle. */
export function restingIdleOpening(
  profile: Pick<InsectPilotProfile, "restingIdle">,
  age: number,
) {
  const duration = Math.max(EPSILON, profile.restingIdle.duration);
  if (age <= 0 || age >= duration) return 0;
  return Math.sin(Math.PI * (age / duration));
}

function stableNoise(seed: number) {
  const value = Math.sin((seed + 1) * 91.733) * 43758.5453;
  return value - Math.floor(value);
}

function enter(
  pilot: InsectPilot,
  phase: InsectPilotPhase,
  event: InsectPilotEvent,
) {
  pilot.phase = phase;
  pilot.phaseAge = 0;
  pilot.event = event;
}

function releaseReservation(pilot: InsectPilot, world: InsectFlightWorld) {
  if (!pilot.reservedPerchId) return;
  world.release(pilot.reservedPerchId, pilot.occupantId);
  pilot.reservedPerchId = null;
  pilot.event = "released";
}

/** Return to ordinary roam. A steering resident has nothing to rejoin: its
 * Intent Layer picks up from whatever state the departure left it in, which is
 * both simpler and impossible to block. Only a sampler-driven insect has to
 * fly back onto an analytic flight it was copied from. */
function beginRejoin(pilot: InsectPilot, event: InsectPilotEvent) {
  if (pilot.roam) {
    pilot.landingPlan = null;
    enter(pilot, "roam", event);
    return;
  }
  copy(pilot.rejoinStart, pilot.position);
  copy(pilot.rejoinStartVelocity, pilot.velocity);
  pilot.routeIndex = 1;
  if (!pilot.landingPlan) {
    copy(pilot.rejoinTarget, pilot.cruise.position);
    copy(pilot.rejoinVelocity, pilot.cruise.velocity);
  }
  pilot.rejoinDuration = Math.max(
    4,
    distance(pilot.rejoinStart, pilot.rejoinTarget) /
      Math.max(0.2, pilot.profile.launchSpeed * 0.45),
  );
  enter(pilot, "rejoin", event);
}

function copyTarget(pilot: InsectPilot, target: InsectLandingTarget) {
  copy(pilot.point, target.point);
  copy(pilot.normal, target.normal);
  normalize(pilot.normal, 0, 1, 0);

  copy(pilot.tangent, target.tangent);
  const tangentNormalDot =
    pilot.tangent.x * pilot.normal.x +
    pilot.tangent.y * pilot.normal.y +
    pilot.tangent.z * pilot.normal.z;
  pilot.tangent.x -= pilot.normal.x * tangentNormalDot;
  pilot.tangent.y -= pilot.normal.y * tangentNormalDot;
  pilot.tangent.z -= pilot.normal.z * tangentNormalDot;
  if (magnitude(pilot.tangent.x, pilot.tangent.y, pilot.tangent.z) <= EPSILON) {
    if (Math.abs(pilot.normal.y) < 0.9) {
      pilot.tangent.x = pilot.normal.z;
      pilot.tangent.y = 0;
      pilot.tangent.z = -pilot.normal.x;
    } else {
      pilot.tangent.x = 1;
      pilot.tangent.y = 0;
      pilot.tangent.z = 0;
    }
  }
  normalize(pilot.tangent, 1, 0, 0);

  pilot.contact.x = target.point.x + pilot.normal.x * target.clearance;
  pilot.contact.y = target.point.y + pilot.normal.y * target.clearance;
  pilot.contact.z = target.point.z + pilot.normal.z * target.clearance;

  const approachDistance =
    target.approachDistance ?? pilot.profile.approachDistance;
  const approachLateral =
    target.approachLateral ?? pilot.profile.approachLateral;
  pilot.stage.x =
    pilot.contact.x +
    pilot.normal.x * approachDistance +
    pilot.tangent.x * approachLateral;
  pilot.stage.y =
    pilot.contact.y +
    pilot.normal.y * approachDistance +
    pilot.tangent.y * approachLateral;
  pilot.stage.z =
    pilot.contact.z +
    pilot.normal.z * approachDistance +
    pilot.tangent.z * approachLateral;
}

export function createInsectPilot(options: InsectPilotOptions): InsectPilot {
  const pilot: InsectPilot = {
    occupantId: options.occupantId,
    flightId: options.flightId,
    profile: options.profile,
    phase: "roam",
    event: "none",
    time: options.initialTime,
    cruiseTime: options.initialTime,
    phaseAge: 0,
    accumulator: 0,
    position: vector(),
    velocity: vector(),
    acceleration: vector(),
    cruise: sample(),
    proposal: vector(),
    collisionProbe: vector(),
    collisionDirection: vector(),
    desiredAcceleration: vector(),
    point: vector(),
    normal: vector(0, 1, 0),
    tangent: vector(1, 0, 0),
    stage: vector(),
    contact: vector(),
    launchTarget: vector(),
    launchDirection: vector(0, 1, 0),
    rejoinTarget: vector(),
    rejoinVelocity: vector(),
    rejoinStart: vector(),
    rejoinStartVelocity: vector(),
    rejoinDuration: 0,
    reservedPerchId: null,
    landingPlan: null,
    routeIndex: 1,
    routeTargetVelocity: vector(),
    plannedLaunch: false,
    rejectionCode: "none",
    wanderPhase: stableNoise(options.seed) * TAU,
    wingPhase: stableNoise(options.seed + 17) * TAU,
    wingAmplitude: options.profile.wingAmplitude,
    wingFrequency: options.profile.wingFrequency,
    wingFold: 0,
    wingAngle: 0,
    restIdleTimer: restingIdleInterval(options.profile, options.seed, 0),
    restIdleAge: -1,
    restIdleCount: 0,
    // Depth varies per insect around the authored temperament, so two
    // residents of the same colour still open their wings differently.
    restIdleDepth:
      options.profile.restingIdle.depth *
      (0.72 + 0.56 * stableNoise(options.seed + 211)),
    seed: options.seed,
    blockedSteps: 0,
    roam: options.roam ?? null,
    steering: options.roam ? createInsectSteeringState(options.seed) : null,
    bodyPitch: 0,
    // Seeded a quarter cycle behind the wingbeat, which is the phase relation
    // the flight literature reports. The two oscillators then run at their own
    // speed-coupled rates and drift apart, exactly as two different frequencies
    // physically must.
    bodyPitchPhase: stableNoise(options.seed + 17) * TAU - HALF_PI,
    escapeOrigin: vector(),
    escapeCause: "calm",
    escapeRedirects: 0,
  };
  copy(pilot.position, options.initial.position);
  copy(pilot.velocity, options.initial.velocity);
  copy(pilot.acceleration, options.initial.acceleration);
  copy(pilot.cruise.position, options.initial.position);
  copy(pilot.cruise.velocity, options.initial.velocity);
  copy(pilot.cruise.acceleration, options.initial.acceleration);
  clampMagnitude(pilot.velocity, options.profile.maxSpeed);
  clampMagnitude(pilot.acceleration, options.profile.maxAcceleration);
  pilot.wingAngle = pilot.wingAmplitude * Math.sin(pilot.wingPhase);
  return pilot;
}

/** Revalidate the two differently-shaped portions of a compiled departure.
 * A direct spherical check from contact would reject every narrow object top:
 * the fully spread wings overlap the support before the insect has risen far
 * enough to open them. */
function compiledLaunchIsClear(
  pilot: InsectPilot,
  world: InsectFlightWorld,
): boolean {
  const plan = pilot.landingPlan;
  if (!plan || plan.launch.length < 2) return false;
  const foldedThrough = Math.max(
    1,
    Math.min(plan.launchFoldedThrough, plan.launch.length - 1),
  );
  const foldedEnd = plan.launch[foldedThrough]!;
  const foldedClear = world.sweepFolded
    ? world.sweepFolded(
        pilot.position,
        foldedEnd,
        pilot.normal,
        pilot.tangent,
        true,
      )
    : world.sweepSphere(
        pilot.position,
        foldedEnd,
        pilot.profile.wingRadius,
        true,
      );
  if (!foldedClear) return false;

  for (let index = foldedThrough; index < plan.launch.length - 1; index++) {
    if (
      !world.sweepSphere(
        plan.launch[index]!,
        plan.launch[index + 1]!,
        pilot.profile.wingRadius,
        true,
      )
    )
      return false;
  }
  const endpoint = plan.launch.at(-1)!;
  return world.sweepSphere(endpoint, endpoint, pilot.profile.wingRadius);
}

/** Occasional state command. Frame-by-frame motion belongs to advance. */
export function commandInsectPilot(
  pilot: InsectPilot,
  command: InsectPilotCommand,
  world: InsectFlightWorld,
): boolean {
  pilot.event = "none";
  pilot.rejectionCode = "none";
  if (command.type === "land") {
    if (pilot.phase !== "roam" && pilot.phase !== "rejoin") return false;
    copyTarget(pilot, command.target);
    const request = {
      perchId: command.target.id,
      start: {
        position: { ...pilot.position },
        velocity: { ...pilot.velocity },
        acceleration: { ...pilot.acceleration },
      },
      target: command.target,
      rejoin: pilot.roam
        ? null
        : {
            position: { ...pilot.cruise.position },
            velocity: { ...pilot.cruise.velocity },
            acceleration: { ...pilot.cruise.acceleration },
          },
      // The Unit frame the approach connector stages through. A moth roaming a
      // lamp cone has none and keeps the direct connector.
      volume: pilot.roam?.volume ?? null,
      variation: command.variation,
      profile: pilot.profile,
    };
    const compiled = world.compileLandingPlan
      ? world.compileLandingPlan(request)
      : compileInsectLandingPlan({
          ...request,
          collisionRevision: null,
          foldedSweep: world.sweepFolded
            ? (_phase, from, to) =>
                world.sweepFolded!(
                  from,
                  to,
                  command.target.normal,
                  command.target.tangent,
                  true,
                )
            : undefined,
          sweep: (phase, from, to) =>
            world.sweepSphere(
              from,
              to,
              pilot.profile.wingRadius + pilot.profile.wanderAmplitude,
              phase === "hover" || phase === "touchdown" || phase === "launch",
            ),
        });
    if (!compiled.ok) {
      pilot.rejectionCode = compiled.rejectionCode;
      pilot.event = "approach-blocked";
      return false;
    }
    const reservation = world.tryReserve(
      command.target.id,
      pilot.occupantId,
      compiled.plan.collisionRevision,
    );
    if (
      reservation === false ||
      (typeof reservation === "object" && !reservation.ok)
    ) {
      pilot.rejectionCode =
        typeof reservation === "object"
          ? reservation.rejectionCode
          : "occupied";
      return false;
    }
    pilot.reservedPerchId = command.target.id;
    pilot.landingPlan = compiled.plan;
    pilot.routeIndex = 1;
    pilot.plannedLaunch = false;
    copy(pilot.stage, compiled.plan.approach.at(-1)!);
    copy(pilot.contact, compiled.plan.contact);
    copy(pilot.normal, compiled.plan.normal);
    copy(pilot.tangent, compiled.plan.tangent);
    copy(pilot.launchTarget, compiled.plan.launch.at(-1)!);
    // A steering resident compiles no rejoin, so there is no target to copy.
    const plannedRejoin = compiled.plan.rejoin.at(-1);
    if (plannedRejoin) copy(pilot.rejoinTarget, plannedRejoin);
    copy(pilot.rejoinVelocity, compiled.plan.rejoinVelocity);
    enter(pilot, "approach", "approach-started");
    return true;
  }

  if (command.type === "update-perch") {
    if (!pilot.reservedPerchId || pilot.reservedPerchId !== command.target.id)
      return false;
    const previousContact = { ...pilot.contact };
    copyTarget(pilot, command.target);
    const dx = pilot.contact.x - previousContact.x;
    const dy = pilot.contact.y - previousContact.y;
    const dz = pilot.contact.z - previousContact.z;
    if (pilot.landingPlan) {
      const translated = new Set<PilotVector>();
      for (const route of [
        pilot.landingPlan.approach,
        pilot.landingPlan.hover,
        pilot.landingPlan.touchdown,
        pilot.landingPlan.launch,
      ])
        for (const point of route) {
          if (translated.has(point)) continue;
          translated.add(point);
          point.x += dx;
          point.y += dy;
          point.z += dz;
        }
      // `contact` is deliberately shared by touchdown and launch in plans
      // produced by the pure compiler. Custom world adapters are allowed to
      // return an equivalent value without sharing the object, so translate
      // that case exactly once as well.
      if (!translated.has(pilot.landingPlan.contact)) {
        pilot.landingPlan.contact.x += dx;
        pilot.landingPlan.contact.y += dy;
        pilot.landingPlan.contact.z += dz;
      }
      copy(pilot.landingPlan.normal, pilot.normal);
      copy(pilot.landingPlan.tangent, pilot.tangent);
      copy(pilot.stage, pilot.landingPlan.approach.at(-1)!);
      copy(pilot.contact, pilot.landingPlan.touchdown.at(-1)!);
      copy(pilot.launchTarget, pilot.landingPlan.launch.at(-1)!);
    }
    return true;
  }

  if (command.type === "cancel") {
    if (pilot.phase === "roam" || pilot.phase === "rejoin") return false;
    // Once the body is at the support, releasing straight into rejoin makes
    // the support a collider around the pilot's starting point and can pin it
    // forever. Leave through the validated outward launch corridor first.
    if (
      pilot.phase === "approach" ||
      pilot.phase === "hover" ||
      pilot.phase === "touchdown" ||
      pilot.phase === "rest"
    )
      return commandInsectPilot(pilot, { type: "depart" }, world);
    if (pilot.phase === "launch") return false;
    releaseReservation(pilot, world);
    beginRejoin(pilot, "released");
    return true;
  }

  if (command.type === "depart") {
    if (
      pilot.phase !== "approach" &&
      pilot.phase !== "hover" &&
      pilot.phase !== "touchdown" &&
      pilot.phase !== "rest"
    )
      return false;
    const cause = command.cause ?? (command.away ? "pointer" : "calm");
    if (
      !command.away &&
      pilot.landingPlan &&
      (pilot.phase === "touchdown" || pilot.phase === "rest")
    ) {
      const plannedTarget = pilot.landingPlan.launch.at(-1)!;
      copy(pilot.launchTarget, plannedTarget);
      pilot.launchDirection.x = plannedTarget.x - pilot.position.x;
      pilot.launchDirection.y = plannedTarget.y - pilot.position.y;
      pilot.launchDirection.z = plannedTarget.z - pilot.position.z;
      normalize(
        pilot.launchDirection,
        pilot.normal.x,
        pilot.normal.y,
        pilot.normal.z,
      );
      if (compiledLaunchIsClear(pilot, world)) {
        beginEscape(pilot, cause, true);
        return true;
      }
    }
    if (command.away) copy(pilot.launchDirection, command.away);
    else copy(pilot.launchDirection, pilot.normal);
    chooseEscapeDirection(pilot, world, 0);
    beginEscape(pilot, cause, false);
    return true;
  }
  return false;
}

/**
 * Point the Escape somewhere with room in it.
 *
 * A disturbance vector can aim straight at a sibling prop, so a small outward
 * hemisphere is searched with the ordinary swept test first. What it will
 * never do is refuse: the previous implementation returned false when no
 * corridor was clear, which meant a startled insect could simply keep resting
 * on the thing that had just been grabbed. With soft collision there is always
 * a direction available, so an unswept best-effort heading — the one whose
 * target has the most clearance — is strictly better than staying put.
 *
 * `rotation` offsets the candidate fan so a retry cannot re-pick the heading
 * that has already failed to make ground.
 */
function chooseEscapeDirection(
  pilot: InsectPilot,
  world: InsectFlightWorld,
  rotation: number,
) {
  // A disturbance can point through the supporting surface. Preserve its
  // lateral intent but require a meaningful outward component.
  const outward =
    pilot.launchDirection.x * pilot.normal.x +
    pilot.launchDirection.y * pilot.normal.y +
    pilot.launchDirection.z * pilot.normal.z;
  if (outward < 0.35) {
    pilot.launchDirection.x += pilot.normal.x * (0.35 - outward);
    pilot.launchDirection.y += pilot.normal.y * (0.35 - outward);
    pilot.launchDirection.z += pilot.normal.z * (0.35 - outward);
  }
  normalize(
    pilot.launchDirection,
    pilot.normal.x,
    pilot.normal.y,
    pilot.normal.z,
  );
  const setTarget = () => {
    pilot.launchTarget.x =
      pilot.position.x + pilot.launchDirection.x * pilot.profile.launchDistance;
    pilot.launchTarget.y =
      pilot.position.y + pilot.launchDirection.y * pilot.profile.launchDistance;
    pilot.launchTarget.z =
      pilot.position.z + pilot.launchDirection.z * pilot.profile.launchDistance;
  };
  setTarget();
  if (
    rotation === 0 &&
    world.sweepSphere(
      pilot.position,
      pilot.launchTarget,
      pilot.profile.wingRadius,
      true,
      true,
    ) &&
    world.sweepSphere(
      pilot.launchTarget,
      pilot.launchTarget,
      pilot.profile.wingRadius,
    )
  )
    return;

  const bx =
    pilot.normal.y * pilot.tangent.z - pilot.normal.z * pilot.tangent.y;
  const by =
    pilot.normal.z * pilot.tangent.x - pilot.normal.x * pilot.tangent.z;
  const bz =
    pilot.normal.x * pilot.tangent.y - pilot.normal.y * pilot.tangent.x;
  let bestClearance = Number.NEGATIVE_INFINITY;
  let bestX = pilot.normal.x;
  let bestY = pilot.normal.y;
  let bestZ = pilot.normal.z;
  for (let index = 0; index < 8; index++) {
    const angle = ((index + rotation * 0.5) / 8) * TAU;
    pilot.launchDirection.x =
      pilot.normal.x * 0.82 +
      pilot.tangent.x * Math.cos(angle) * 0.58 +
      bx * Math.sin(angle) * 0.58;
    pilot.launchDirection.y =
      pilot.normal.y * 0.82 +
      pilot.tangent.y * Math.cos(angle) * 0.58 +
      by * Math.sin(angle) * 0.58;
    pilot.launchDirection.z =
      pilot.normal.z * 0.82 +
      pilot.tangent.z * Math.cos(angle) * 0.58 +
      bz * Math.sin(angle) * 0.58;
    normalize(
      pilot.launchDirection,
      pilot.normal.x,
      pilot.normal.y,
      pilot.normal.z,
    );
    setTarget();
    if (
      world.sweepSphere(
        pilot.position,
        pilot.launchTarget,
        pilot.profile.wingRadius,
        true,
        true,
      ) &&
      world.sweepSphere(
        pilot.launchTarget,
        pilot.launchTarget,
        pilot.profile.wingRadius,
      )
    )
      return;
    const clearance = world.sampleDistanceField
      ? world.sampleDistanceField(pilot.launchTarget, pilot.collisionDirection)
      : 0;
    if (clearance <= bestClearance) continue;
    bestClearance = clearance;
    bestX = pilot.launchDirection.x;
    bestY = pilot.launchDirection.y;
    bestZ = pilot.launchDirection.z;
  }
  pilot.launchDirection.x = bestX;
  pilot.launchDirection.y = bestY;
  pilot.launchDirection.z = bestZ;
  setTarget();
}

function beginEscape(
  pilot: InsectPilot,
  cause: InsectEscapeCause,
  plannedLaunch: boolean,
) {
  copy(pilot.escapeOrigin, pilot.position);
  pilot.escapeCause = cause;
  pilot.escapeRedirects = 0;
  pilot.routeIndex = 1;
  pilot.plannedLaunch = plannedLaunch;
  enter(pilot, "launch", "launch");
}

function desiredStationaryAcceleration(
  pilot: InsectPilot,
  target: PilotVector,
  phaseSpeed: number,
  wander: boolean,
) {
  let tx = target.x;
  let ty = target.y;
  let tz = target.z;
  let dx = tx - pilot.position.x;
  let dy = ty - pilot.position.y;
  let dz = tz - pilot.position.z;
  let dist = magnitude(dx, dy, dz);
  if (wander && dist > EPSILON) {
    const fade = Math.min(1, dist / pilot.profile.wanderDecayDistance);
    const offset =
      pilot.profile.wanderAmplitude * fade * Math.sin(pilot.wanderPhase);
    tx += pilot.tangent.x * offset;
    ty += pilot.tangent.y * offset;
    tz += pilot.tangent.z * offset;
    dx = tx - pilot.position.x;
    dy = ty - pilot.position.y;
    dz = tz - pilot.position.z;
    dist = magnitude(dx, dy, dz);
  }
  const stoppingSpeed = Math.sqrt(
    Math.max(0, 2 * pilot.profile.maxAcceleration * dist),
  );
  const desiredSpeed = Math.min(phaseSpeed, stoppingSpeed);
  const scale = dist > EPSILON ? desiredSpeed / dist : 0;
  pilot.desiredAcceleration.x =
    (dx * scale - pilot.velocity.x) / pilot.profile.velocityResponse;
  pilot.desiredAcceleration.y =
    (dy * scale - pilot.velocity.y) / pilot.profile.velocityResponse;
  pilot.desiredAcceleration.z =
    (dz * scale - pilot.velocity.z) / pilot.profile.velocityResponse;
}

function setSegmentVelocity(
  out: PilotVector,
  from: PilotVector | undefined,
  to: PilotVector | undefined,
  speed: number,
) {
  if (!from || !to) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return;
  }
  out.x = to.x - from.x;
  out.y = to.y - from.y;
  out.z = to.z - from.z;
  normalize(out, 0, 0, 0);
  out.x *= speed;
  out.y *= speed;
  out.z *= speed;
}

function routeWaypointCanAdvance(
  pilot: InsectPilot,
  route: readonly PilotVector[],
  index: number,
  phaseSpeed: number,
) {
  const previous = route[index - 1];
  const target = route[index];
  if (!previous || !target) return false;
  const sx = target.x - previous.x;
  const sy = target.y - previous.y;
  const sz = target.z - previous.z;
  const segmentLengthSquared = sx * sx + sy * sy + sz * sz;
  const projection =
    segmentLengthSquared > EPSILON
      ? ((pilot.position.x - previous.x) * sx +
          (pilot.position.y - previous.y) * sy +
          (pilot.position.z - previous.z) * sz) /
        segmentLengthSquared
      : 1;
  const switchDistance = Math.max(
    pilot.profile.positionTolerance,
    phaseSpeed * FIXED_STEP * 2,
  );
  return (
    distance(pilot.position, target) <= switchDistance || projection >= 0.9
  );
}

function desiredPlannedRouteAcceleration(
  pilot: InsectPilot,
  route: readonly PilotVector[],
  phaseSpeed: number,
  endVelocity: PilotVector,
) {
  if (route.length < 2) {
    const target = route.at(-1) ?? pilot.position;
    desiredStationaryAcceleration(pilot, target, phaseSpeed, false);
    return;
  }
  const lastIndex = route.length - 1;
  pilot.routeIndex = Math.max(1, Math.min(pilot.routeIndex, lastIndex));
  while (
    pilot.routeIndex < lastIndex &&
    routeWaypointCanAdvance(pilot, route, pilot.routeIndex, phaseSpeed)
  )
    pilot.routeIndex++;

  const target = route[pilot.routeIndex]!;
  if (pilot.routeIndex === lastIndex) {
    if (magnitude(endVelocity.x, endVelocity.y, endVelocity.z) <= EPSILON) {
      desiredStationaryAcceleration(pilot, target, phaseSpeed, false);
      return;
    }
    pilot.desiredAcceleration.x =
      (target.x - pilot.position.x) * 5.2 +
      (endVelocity.x - pilot.velocity.x) * 3.6;
    pilot.desiredAcceleration.y =
      (target.y - pilot.position.y) * 5.2 +
      (endVelocity.y - pilot.velocity.y) * 3.6;
    pilot.desiredAcceleration.z =
      (target.z - pilot.position.z) * 5.2 +
      (endVelocity.z - pilot.velocity.z) * 3.6;
    return;
  }

  const previous = route[pilot.routeIndex - 1]!;
  const next = route[Math.min(lastIndex, pilot.routeIndex + 1)]!;
  setSegmentVelocity(pilot.routeTargetVelocity, previous, next, phaseSpeed);
  pilot.desiredAcceleration.x =
    (target.x - pilot.position.x) * 6.2 +
    (pilot.routeTargetVelocity.x - pilot.velocity.x) /
      pilot.profile.velocityResponse;
  pilot.desiredAcceleration.y =
    (target.y - pilot.position.y) * 6.2 +
    (pilot.routeTargetVelocity.y - pilot.velocity.y) /
      pilot.profile.velocityResponse;
  pilot.desiredAcceleration.z =
    (target.z - pilot.position.z) * 6.2 +
    (pilot.routeTargetVelocity.z - pilot.velocity.z) /
      pilot.profile.velocityResponse;
}

function reachedMovingRouteEnd(
  pilot: InsectPilot,
  route: readonly PilotVector[],
) {
  if (route.length < 2) return true;
  const lastIndex = route.length - 1;
  if (pilot.routeIndex < lastIndex) return false;
  const previous = route[lastIndex - 1]!;
  const target = route[lastIndex]!;
  const sx = target.x - previous.x;
  const sy = target.y - previous.y;
  const sz = target.z - previous.z;
  const segmentLengthSquared = sx * sx + sy * sy + sz * sz;
  const projection =
    segmentLengthSquared > EPSILON
      ? ((pilot.position.x - previous.x) * sx +
          (pilot.position.y - previous.y) * sy +
          (pilot.position.z - previous.z) * sz) /
        segmentLengthSquared
      : 1;
  return (
    distance(pilot.position, target) <=
      Math.max(0.025, pilot.profile.positionTolerance * 1.5) || projection >= 1
  );
}

function desiredMovingAcceleration(pilot: InsectPilot, rejoining: boolean) {
  const cruise = pilot.cruise;
  const dx = cruise.position.x - pilot.position.x;
  const dy = cruise.position.y - pilot.position.y;
  const dz = cruise.position.z - pilot.position.z;
  if (!rejoining) {
    pilot.desiredAcceleration.x =
      cruise.acceleration.x +
      dx * pilot.profile.roamPositionGain +
      (cruise.velocity.x - pilot.velocity.x) * pilot.profile.roamVelocityGain;
    pilot.desiredAcceleration.y =
      cruise.acceleration.y +
      dy * pilot.profile.roamPositionGain +
      (cruise.velocity.y - pilot.velocity.y) * pilot.profile.roamVelocityGain;
    pilot.desiredAcceleration.z =
      cruise.acceleration.z +
      dz * pilot.profile.roamPositionGain +
      (cruise.velocity.z - pilot.velocity.z) * pilot.profile.roamVelocityGain;
    return;
  }

  const duration = Math.max(0.75, pilot.rejoinDuration);
  const t = Math.min(1, pilot.phaseAge / duration);
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const dh00 = (6 * t2 - 6 * t) / duration;
  const dh10 = 3 * t2 - 4 * t + 1;
  const dh01 = -dh00;
  const dh11 = 3 * t2 - 2 * t;
  const ddh00 = (12 * t - 6) / (duration * duration);
  const ddh10 = (6 * t - 4) / duration;
  const ddh01 = -ddh00;
  const ddh11 = (6 * t - 2) / duration;
  const axis = (
    start: number,
    startVelocity: number,
    end: number,
    endVelocity: number,
    position: number,
    velocity: number,
  ) => {
    const targetPosition =
      h00 * start +
      h10 * duration * startVelocity +
      h01 * end +
      h11 * duration * endVelocity;
    const targetVelocity =
      dh00 * start + dh10 * startVelocity + dh01 * end + dh11 * endVelocity;
    const targetAcceleration =
      ddh00 * start + ddh10 * startVelocity + ddh01 * end + ddh11 * endVelocity;
    return (
      targetAcceleration +
      (targetPosition - position) * 5.2 +
      (targetVelocity - velocity) * 3.6
    );
  };
  pilot.desiredAcceleration.x = axis(
    pilot.rejoinStart.x,
    pilot.rejoinStartVelocity.x,
    pilot.rejoinTarget.x,
    pilot.rejoinVelocity.x,
    pilot.position.x,
    pilot.velocity.x,
  );
  pilot.desiredAcceleration.y = axis(
    pilot.rejoinStart.y,
    pilot.rejoinStartVelocity.y,
    pilot.rejoinTarget.y,
    pilot.rejoinVelocity.y,
    pilot.position.y,
    pilot.velocity.y,
  );
  pilot.desiredAcceleration.z = axis(
    pilot.rejoinStart.z,
    pilot.rejoinStartVelocity.z,
    pilot.rejoinTarget.z,
    pilot.rejoinVelocity.z,
    pilot.position.z,
    pilot.velocity.z,
  );
}

/**
 * Look far enough ahead to bend before the wing envelope reaches a prop. The
 * collision adapter deliberately returns only clear/blocked, keeping scene
 * geometry out of the pilot; a small deterministic probe fan selects an open
 * climbing or lateral heading and the normal acceleration/jerk limits do the
 * actual steering. If every probe is blocked, braking is safer than freezing
 * against the same obstacle at full commanded speed.
 */
function applyObstacleAvoidance(
  pilot: InsectPilot,
  world: InsectFlightWorld,
  allowReservedSupportContact = false,
) {
  const profile = pilot.profile;
  const speed = magnitude(pilot.velocity.x, pilot.velocity.y, pilot.velocity.z);
  const horizon = 0.65;
  const desiredLength = magnitude(
    pilot.desiredAcceleration.x,
    pilot.desiredAcceleration.y,
    pilot.desiredAcceleration.z,
  );
  const probeAccelerationScale =
    desiredLength > profile.maxAcceleration
      ? profile.maxAcceleration / desiredLength
      : 1;
  pilot.collisionProbe.x =
    pilot.position.x +
    pilot.velocity.x * horizon +
    0.5 *
      pilot.desiredAcceleration.x *
      probeAccelerationScale *
      horizon *
      horizon;
  pilot.collisionProbe.y =
    pilot.position.y +
    pilot.velocity.y * horizon +
    0.5 *
      pilot.desiredAcceleration.y *
      probeAccelerationScale *
      horizon *
      horizon;
  pilot.collisionProbe.z =
    pilot.position.z +
    pilot.velocity.z * horizon +
    0.5 *
      pilot.desiredAcceleration.z *
      probeAccelerationScale *
      horizon *
      horizon;
  if (
    world.sweepSphere(
      pilot.position,
      pilot.collisionProbe,
      profile.wingRadius,
      allowReservedSupportContact,
    )
  )
    return;
  const recoveringFromPenetration = !world.sweepSphere(
    pilot.position,
    pilot.position,
    profile.wingRadius,
    allowReservedSupportContact,
  );

  // A steering resident has no analytic flight to aim back at, so its own
  // velocity is the only meaningful forward.
  let fx = pilot.roam ? 0 : pilot.cruise.position.x - pilot.position.x;
  let fy = pilot.roam ? 0 : pilot.cruise.position.y - pilot.position.y;
  let fz = pilot.roam ? 0 : pilot.cruise.position.z - pilot.position.z;
  const forwardLength = magnitude(fx, fy, fz);
  if (forwardLength > EPSILON) {
    fx /= forwardLength;
    fy /= forwardLength;
    fz /= forwardLength;
  } else if (speed > EPSILON) {
    fx = pilot.velocity.x / speed;
    fy = pilot.velocity.y / speed;
    fz = pilot.velocity.z / speed;
  } else {
    fx = 1;
    fy = 0;
    fz = 0;
  }
  let sx = -fz;
  let sz = fx;
  const sideLength = Math.hypot(sx, sz);
  if (sideLength > EPSILON) {
    sx /= sideLength;
    sz /= sideLength;
  } else {
    sx = 1;
    sz = 0;
  }
  const preferredSide = Math.sin(pilot.wanderPhase) >= 0 ? 1 : -1;
  const probeDistance = Math.max(0.32, Math.min(0.82, speed * horizon + 0.3));
  const desiredSpeed = Math.max(0.45, Math.min(profile.maxSpeed, speed));
  const candidateCount = recoveringFromPenetration ? 18 : 11;
  for (let candidate = 0; candidate < candidateCount; candidate++) {
    const side = candidate % 2 === 0 ? preferredSide : -preferredSide;
    if (recoveringFromPenetration) {
      if (candidate === 0 || candidate === 17) {
        pilot.collisionDirection.x = 0;
        pilot.collisionDirection.y = candidate === 0 ? 1 : -1;
        pilot.collisionDirection.z = 0;
      } else {
        const escapeAngle = (((candidate - 1) % 8) / 8) * TAU;
        pilot.collisionDirection.x = Math.cos(escapeAngle) * 0.65;
        pilot.collisionDirection.y = candidate <= 8 ? 1 : -1;
        pilot.collisionDirection.z = Math.sin(escapeAngle) * 0.65;
      }
    } else if (candidate < 2) {
      pilot.collisionDirection.x = fx * 0.35 + sx * side * 0.9;
      pilot.collisionDirection.y = Math.max(0, fy) * 0.2 + 0.55;
      pilot.collisionDirection.z = fz * 0.35 + sz * side * 0.9;
    } else if (candidate < 10) {
      const escapeAngle = ((candidate - 2) / 8) * TAU;
      pilot.collisionDirection.x = Math.cos(escapeAngle) * 0.65;
      pilot.collisionDirection.y = 1;
      pilot.collisionDirection.z = Math.sin(escapeAngle) * 0.65;
    } else {
      pilot.collisionDirection.x = 0;
      pilot.collisionDirection.y = 1;
      pilot.collisionDirection.z = 0;
    }
    normalize(pilot.collisionDirection, 0, 1, 0);
    pilot.collisionProbe.x =
      pilot.position.x + pilot.collisionDirection.x * probeDistance;
    pilot.collisionProbe.y =
      pilot.position.y + pilot.collisionDirection.y * probeDistance;
    pilot.collisionProbe.z =
      pilot.position.z + pilot.collisionDirection.z * probeDistance;
    let candidateIsClear = world.sweepSphere(
      pilot.position,
      pilot.collisionProbe,
      profile.wingRadius,
      allowReservedSupportContact,
      true,
    );
    if (!candidateIsClear && recoveringFromPenetration) {
      // A long look-ahead can cross a separate prop even when a few
      // centimetres of valid air are available through the nearest face.
      // Use that short step to peel out of the current overlap, then resume
      // normal long-horizon avoidance on the next fixed step.
      const recoveryDistance = profile.wingRadius * 0.5;
      pilot.collisionProbe.x =
        pilot.position.x + pilot.collisionDirection.x * recoveryDistance;
      pilot.collisionProbe.y =
        pilot.position.y + pilot.collisionDirection.y * recoveryDistance;
      pilot.collisionProbe.z =
        pilot.position.z + pilot.collisionDirection.z * recoveryDistance;
      candidateIsClear = world.sweepSphere(
        pilot.position,
        pilot.collisionProbe,
        profile.wingRadius,
        allowReservedSupportContact,
        true,
      );
    }
    if (!candidateIsClear) continue;
    pilot.desiredAcceleration.x =
      (pilot.collisionDirection.x * desiredSpeed - pilot.velocity.x) /
      profile.velocityResponse;
    pilot.desiredAcceleration.y =
      (pilot.collisionDirection.y * desiredSpeed - pilot.velocity.y) /
      profile.velocityResponse;
    pilot.desiredAcceleration.z =
      (pilot.collisionDirection.z * desiredSpeed - pilot.velocity.z) /
      profile.velocityResponse;
    return;
  }

  pilot.desiredAcceleration.x = -pilot.velocity.x / profile.velocityResponse;
  pilot.desiredAcceleration.y = -pilot.velocity.y / profile.velocityResponse;
  pilot.desiredAcceleration.z = -pilot.velocity.z / profile.velocityResponse;
}

/**
 * Kinematic ceiling for the current phase. An Escape is allowed to exceed
 * ordinary flight because severity is part of a Disturbance's identity: a
 * grabbed prop throws the insect off, a passing cursor only moves it along.
 * Scaling the jerk with the acceleration keeps the ratio — and therefore the
 * shape of the departure — the same at every severity.
 */
export function insectPilotPhaseLimits(pilot: InsectPilot) {
  if (pilot.phase !== "launch")
    return {
      acceleration: pilot.profile.maxAcceleration,
      speed: pilot.profile.maxSpeed,
      jerk: pilot.profile.maxJerk,
    };
  const limit = ESCAPE_LIMITS[pilot.escapeCause];
  const acceleration = Math.max(
    pilot.profile.maxAcceleration,
    limit.acceleration,
  );
  return {
    acceleration,
    speed: pilot.profile.maxSpeed * limit.speed,
    jerk:
      (pilot.profile.maxJerk * acceleration) / pilot.profile.maxAcceleration,
  };
}

function applyAccelerationLimits(pilot: InsectPilot, step: number) {
  const limits = insectPilotPhaseLimits(pilot);
  clampMagnitude(pilot.desiredAcceleration, limits.acceleration);
  let dx = pilot.desiredAcceleration.x - pilot.acceleration.x;
  let dy = pilot.desiredAcceleration.y - pilot.acceleration.y;
  let dz = pilot.desiredAcceleration.z - pilot.acceleration.z;
  const jerkStep = limits.jerk * step;
  const deltaLength = magnitude(dx, dy, dz);
  if (deltaLength > jerkStep && deltaLength > EPSILON) {
    const scale = jerkStep / deltaLength;
    dx *= scale;
    dy *= scale;
    dz *= scale;
  }
  pilot.acceleration.x += dx;
  pilot.acceleration.y += dy;
  pilot.acceleration.z += dz;
  clampMagnitude(pilot.acceleration, limits.acceleration);
}

/**
 * How much of the Flap Layer's cruise character is switched on at this speed.
 * The published butterfly model uses a logistic in |u|/|u_max|; the steepness
 * is softened here because this is a presentation blend, not a gait switch,
 * and `flapReferenceSpeed` stands in for the ceiling because ordinary roam
 * never approaches the pilot's absolute limit.
 */
export function insectFlapActivation(speed: number, referenceSpeed: number) {
  if (referenceSpeed <= EPSILON) return 1;
  return 1 / (1 + Math.exp(-8 * (speed / referenceSpeed - 0.5)));
}

/** Wingbeat rate in Hz at a given airspeed. */
export function insectWingFrequencyForSpeed(
  profile: InsectPilotProfile,
  speed: number,
) {
  const activation = insectFlapActivation(speed, profile.flapReferenceSpeed);
  return (
    profile.hoverWingFrequency +
    (profile.wingFrequency - profile.hoverWingFrequency) * activation
  );
}

/**
 * Wing half-amplitude in radians at a given airspeed. This runs OPPOSITE the
 * frequency on purpose: tying depth and rate to speed together would leave a
 * hovering insect's wings nearly still, which is backwards. A butterfly that
 * stops going anywhere beats deep and slow.
 */
export function insectWingAmplitudeForSpeed(
  profile: InsectPilotProfile,
  speed: number,
) {
  const activation = insectFlapActivation(speed, profile.flapReferenceSpeed);
  return (
    profile.hoverWingAmplitude +
    (profile.wingAmplitude - profile.hoverWingAmplitude) * activation
  );
}

/** Thorax pitch amplitude in radians at a given airspeed. */
export function insectBodyPitchForSpeed(
  profile: InsectPilotProfile,
  speed: number,
) {
  return (
    profile.bodyPitchAmplitude *
    insectFlapActivation(speed, profile.flapReferenceSpeed)
  );
}

/**
 * The Flap Layer. Thorax pitch oscillating a quarter cycle behind the
 * wingbeat, at its own slower speed-coupled rate, plus the nose-up flare held
 * through the last beat before contact.
 *
 * This matters more than its size suggests: the body is a flat cut-out seen at
 * a 9–12° elevation, so it is always near edge-on, and thirty degrees of pitch
 * swings the whole silhouette toward the camera. It is what makes the insect
 * appear at all.
 *
 * Presentation only. It writes one angle and can never move the insect or
 * change what it collides with.
 */
/**
 * During touchdown and rest the body may approach the contact plane but never
 * cross it.
 *
 * The Arrival Curve comes in at 25 degrees with real tangential speed and the
 * terminal controller aims at the contact with zero target velocity, so it
 * overshoots — and because the reserved support is deliberately exempt from
 * collision at this range, nothing stopped the overshoot. The insect sank into
 * the prop and then floated back out as the position hold recovered, which is
 * exactly the "goes under the object and then floats up" the TJ medallion
 * shows. One projection makes it impossible rather than merely unlikely.
 */
function holdAboveContactPlane(pilot: InsectPilot) {
  if (pilot.phase !== "touchdown" && pilot.phase !== "rest") return;
  const depth =
    (pilot.position.x - pilot.contact.x) * pilot.normal.x +
    (pilot.position.y - pilot.contact.y) * pilot.normal.y +
    (pilot.position.z - pilot.contact.z) * pilot.normal.z;
  if (depth >= 0) return;
  pilot.position.x -= pilot.normal.x * depth;
  pilot.position.y -= pilot.normal.y * depth;
  pilot.position.z -= pilot.normal.z * depth;
  // Remove only the component still driving it inward; the tangential glide
  // onto the surface is the part that reads as a landing.
  const inward =
    pilot.velocity.x * pilot.normal.x +
    pilot.velocity.y * pilot.normal.y +
    pilot.velocity.z * pilot.normal.z;
  if (inward >= 0) return;
  pilot.velocity.x -= pilot.normal.x * inward;
  pilot.velocity.y -= pilot.normal.y * inward;
  pilot.velocity.z -= pilot.normal.z * inward;
}

function advanceFlap(pilot: InsectPilot, step: number) {
  const profile = pilot.profile;
  const speed = magnitude(pilot.velocity.x, pilot.velocity.y, pilot.velocity.z);
  if (pilot.phase === "touchdown" || pilot.phase === "rest") {
    // Flare: pitch up into the surface over the last few centimetres, then
    // settle flat once the feet are down.
    const remaining = distance(pilot.position, pilot.contact);
    const target =
      pilot.phase === "rest"
        ? 0
        : profile.flarePitch *
          Math.max(
            0,
            Math.min(
              1,
              1 - remaining / Math.max(EPSILON, profile.flareDistance),
            ),
          );
    pilot.bodyPitch += (target - pilot.bodyPitch) * Math.min(1, step * 9);
    return;
  }
  // Phase-locked to the wingbeat, a quarter cycle behind it, because that is
  // what causes it. Running the thorax on its own slower oscillator — 1.5 Hz
  // against a 6 Hz wing — reads as the whole insect rocking fore and aft
  // independently of its wings, which is a bob, not a flap.
  const amplitude = insectBodyPitchForSpeed(profile, speed);
  pilot.bodyPitchPhase = pilot.wingPhase - HALF_PI;
  pilot.bodyPitch = amplitude * Math.sin(pilot.bodyPitchPhase);
}

function advanceWing(pilot: InsectPilot, step: number) {
  const folded =
    pilot.phase === "touchdown" ||
    pilot.phase === "rest" ||
    (pilot.phase === "launch" &&
      pilot.plannedLaunch &&
      pilot.landingPlan !== null &&
      pilot.routeIndex <= pilot.landingPlan.launchFoldedThrough);
  // Presentation does NOT fold during the inspection hover, even though the
  // hover arc is swept with the folded kernel. Folding there is what made the
  // arrival read as a paper dart: the wings shut a second out from the Perch
  // and the insect covered the last stretch as a rigid glide. A settling
  // butterfly does the opposite — it beats DEEPER and SLOWER as it slows down,
  // which is what `hoverWingAmplitude` and `hoverWingFrequency` are for, and
  // it is the difference between braking and coasting. The wings shut on
  // touchdown, where contact explains the change.
  const foldedPresentation = folded;
  const speed = magnitude(pilot.velocity.x, pilot.velocity.y, pilot.velocity.z);
  const targetAmplitude = foldedPresentation
    ? pilot.profile.restingWingAmplitude
    : insectWingAmplitudeForSpeed(pilot.profile, speed) *
      // A committed dive through open air reads as a short glide. During a
      // landing it reads as a stall, so the arrival keeps its full stroke: the
      // whole point of the approach is that the insect is working to shed
      // speed, not falling with its wings half shut.
      (pilot.phase === "roam" && pilot.velocity.y < -0.12
        ? Math.max(0.48, 1 + pilot.velocity.y * 1.8)
        : 1);
  const targetFrequency = foldedPresentation
    ? pilot.profile.restingWingFrequency
    : insectWingFrequencyForSpeed(pilot.profile, speed);
  const amplitudeDelta = Math.max(
    -pilot.profile.wingAmplitudeRate * step,
    Math.min(
      pilot.profile.wingAmplitudeRate * step,
      targetAmplitude - pilot.wingAmplitude,
    ),
  );
  const frequencyDelta = Math.max(
    -pilot.profile.wingFrequencyRate * step,
    Math.min(
      pilot.profile.wingFrequencyRate * step,
      targetFrequency - pilot.wingFrequency,
    ),
  );
  pilot.wingAmplitude += amplitudeDelta;
  pilot.wingFrequency += frequencyDelta;
  const targetFold = foldedPresentation ? 1 : 0;
  pilot.wingFold += Math.max(
    -WING_FOLD_RATE * step,
    Math.min(WING_FOLD_RATE * step, targetFold - pilot.wingFold),
  );
  pilot.wingPhase = (pilot.wingPhase + TAU * pilot.wingFrequency * step) % TAU;
  pilot.wingAngle =
    pilot.wingFold * FOLDED_WING_ANGLE +
    pilot.wingAmplitude * Math.sin(pilot.wingPhase) -
    pilot.wingFold * FOLDED_WING_ANGLE * advanceRestingIdle(pilot, step);
}

/**
 * The episodic perched opening, 0..1 of the folded angle.
 *
 * A settled insect is still — and then, every several seconds, opens and
 * closes its wings once, deliberately. This is entirely presentational: the
 * body does not move, because moving it is translation and translation
 * re-enters collision.
 */
function advanceRestingIdle(pilot: InsectPilot, step: number) {
  if (pilot.phase !== "rest") {
    // Whatever the insect was doing while perched does not survive takeoff,
    // and the next perch starts its own schedule.
    pilot.restIdleAge = -1;
    return 0;
  }
  if (pilot.restIdleAge >= 0) {
    pilot.restIdleAge += step;
    if (pilot.restIdleAge >= pilot.profile.restingIdle.duration) {
      pilot.restIdleAge = -1;
      pilot.restIdleCount += 1;
      pilot.restIdleTimer = restingIdleInterval(
        pilot.profile,
        pilot.seed,
        pilot.restIdleCount,
      );
      return 0;
    }
    return (
      restingIdleOpening(pilot.profile, pilot.restIdleAge) * pilot.restIdleDepth
    );
  }
  pilot.restIdleTimer -= step;
  if (pilot.restIdleTimer <= 0) pilot.restIdleAge = 0;
  return 0;
}

/**
 * Try progressively shorter versions of a refused step, taking the first that
 * is clear. True when the pilot moved.
 */
function slideLandingStep(
  pilot: InsectPilot,
  world: InsectFlightWorld,
  foldedPhase: boolean,
) {
  const fullX = pilot.proposal.x - pilot.position.x;
  const fullY = pilot.proposal.y - pilot.position.y;
  const fullZ = pilot.proposal.z - pilot.position.z;
  for (const fraction of LANDING_SLIDE_FRACTIONS) {
    pilot.proposal.x = pilot.position.x + fullX * fraction;
    pilot.proposal.y = pilot.position.y + fullY * fraction;
    pilot.proposal.z = pilot.position.z + fullZ * fraction;
    const clear =
      foldedPhase && world.sweepFolded
        ? world.sweepFolded(
            pilot.position,
            pilot.proposal,
            pilot.normal,
            pilot.tangent,
            true,
          )
        : world.sweepSphere(
            pilot.position,
            pilot.proposal,
            pilot.profile.wingRadius,
            true,
            false,
          );
    if (!clear) continue;
    copy(pilot.position, pilot.proposal);
    holdAboveContactPlane(pilot);
    return true;
  }
  return false;
}

function reached(
  pilot: InsectPilot,
  target: PilotVector,
  positionTolerance: number,
  velocityTolerance: number,
) {
  return (
    distance(pilot.position, target) <= positionTolerance &&
    magnitude(pilot.velocity.x, pilot.velocity.y, pilot.velocity.z) <=
      velocityTolerance
  );
}

function advanceFixed(pilot: InsectPilot, world: InsectFlightWorld) {
  const profile = pilot.profile;
  if (pilot.phase === "rejoin" && pilot.rejoinDuration <= 0)
    beginRejoin(pilot, "none");
  pilot.time += FIXED_STEP;
  if (pilot.phase === "roam") pilot.cruiseTime += FIXED_STEP;
  pilot.phaseAge += FIXED_STEP;
  pilot.wanderPhase =
    (pilot.wanderPhase + TAU * profile.wanderFrequency * FIXED_STEP) % TAU;
  if (!pilot.roam)
    world.sampleCruise(pilot.flightId, pilot.cruiseTime, pilot.cruise);
  // Capture this before route following can advance from the lift waypoint to
  // the open-wing leg. The crossing step remains folded; the next step begins
  // only after the full sphere starts from the already-clear unfold point.
  const foldedLaunchStep = Boolean(
    pilot.phase === "launch" &&
      pilot.plannedLaunch &&
      pilot.landingPlan &&
      pilot.routeIndex <= pilot.landingPlan.launchFoldedThrough,
  );

  if (pilot.phase === "roam") {
    // The Intent Layer supplies a preferred acceleration and nothing else. No
    // sweep gate, no corridor, no position to copy — which is precisely why no
    // two residents can share a line through the air (ADR 0002, ADR 0003).
    if (pilot.roam && pilot.steering) {
      advanceInsectSteering({
        state: pilot.steering,
        profile: pilot.roam.profile,
        containment: pilot.roam.containment,
        transit: pilot.roam.transit,
        position: pilot.position,
        velocity: pilot.velocity,
        step: FIXED_STEP,
        sampleDistanceField: world.sampleDistanceField
          ? (point, outGradient) =>
              world.sampleDistanceField!(point, outGradient)
          : undefined,
        out: pilot.desiredAcceleration,
      });
      applyAccelerationLimits(pilot, FIXED_STEP);
      integrateInsectRoam({
        containment: pilot.roam.containment,
        position: pilot.position,
        velocity: pilot.velocity,
        acceleration: pilot.acceleration,
        maxSpeed: profile.maxSpeed,
        step: FIXED_STEP,
      });
      advanceWing(pilot, FIXED_STEP);
      advanceFlap(pilot, FIXED_STEP);
      return;
    }
    // A sampler-driven insect (the moths' lamp cone) copies only a route that
    // was compiled against the current collision revision. Presentation
    // flap/bank is applied by the renderer and can never alter this position.
    copy(pilot.position, pilot.cruise.position);
    copy(pilot.velocity, pilot.cruise.velocity);
    copy(pilot.desiredAcceleration, pilot.cruise.acceleration);
    applyAccelerationLimits(pilot, FIXED_STEP);
    advanceWing(pilot, FIXED_STEP);
    advanceFlap(pilot, FIXED_STEP);
    return;
  }

  if (pilot.phase === "approach") {
    const approach = pilot.landingPlan?.approach;
    const hover = pilot.landingPlan?.hover;
    if (approach && hover) {
      setSegmentVelocity(
        pilot.routeTargetVelocity,
        hover[0],
        hover[1],
        profile.touchdownSpeed * 1.35,
      );
      desiredPlannedRouteAcceleration(
        pilot,
        approach,
        profile.approachSpeed,
        pilot.routeTargetVelocity,
      );
    } else
      desiredStationaryAcceleration(
        pilot,
        pilot.stage,
        profile.approachSpeed,
        true,
      );
  } else if (pilot.phase === "hover") {
    const hover = pilot.landingPlan?.hover;
    const touchdown = pilot.landingPlan?.touchdown;
    if (hover && touchdown) {
      setSegmentVelocity(
        pilot.routeTargetVelocity,
        touchdown[0],
        touchdown[1],
        profile.touchdownSpeed,
      );
      desiredPlannedRouteAcceleration(
        pilot,
        hover,
        profile.touchdownSpeed * 1.35,
        pilot.routeTargetVelocity,
      );
    } else
      desiredStationaryAcceleration(
        pilot,
        pilot.stage,
        profile.touchdownSpeed * 1.35,
        false,
      );
  } else if (pilot.phase === "touchdown" || pilot.phase === "rest") {
    const touchdown = pilot.landingPlan?.touchdown;
    if (pilot.phase === "touchdown" && touchdown) {
      pilot.routeTargetVelocity.x = 0;
      pilot.routeTargetVelocity.y = 0;
      pilot.routeTargetVelocity.z = 0;
      desiredPlannedRouteAcceleration(
        pilot,
        touchdown,
        profile.touchdownSpeed,
        pilot.routeTargetVelocity,
      );
    } else
      desiredStationaryAcceleration(
        pilot,
        pilot.contact,
        profile.touchdownSpeed,
        false,
      );
  } else if (
    pilot.phase === "launch" &&
    pilot.plannedLaunch &&
    pilot.landingPlan
  ) {
    setSegmentVelocity(
      pilot.routeTargetVelocity,
      pilot.landingPlan.rejoin[0],
      pilot.landingPlan.rejoin[1],
      profile.launchSpeed,
    );
    desiredPlannedRouteAcceleration(
      pilot,
      pilot.landingPlan.launch,
      profile.launchSpeed,
      pilot.routeTargetVelocity,
    );
  } else if (pilot.phase === "launch") {
    desiredStationaryAcceleration(
      pilot,
      pilot.launchTarget,
      profile.launchSpeed,
      false,
    );
    // Dynamic disturbance/penetration departures do not own a compiled
    // polyline. Keep steering toward their validated target in normal air,
    // but use the bounded probe fan if moved geometry currently encloses the
    // insect so residual touchdown velocity cannot pin it on the wrong side.
    applyObstacleAvoidance(pilot, world, true);
  } else if (pilot.phase === "rejoin" && pilot.landingPlan) {
    if (pilot.routeIndex >= pilot.landingPlan.rejoin.length) {
      desiredMovingAcceleration(pilot, true);
    } else {
      copy(pilot.routeTargetVelocity, pilot.landingPlan.rejoinVelocity);
      desiredPlannedRouteAcceleration(
        pilot,
        pilot.landingPlan.rejoin,
        profile.maxSpeed,
        pilot.routeTargetVelocity,
      );
    }
  } else {
    desiredMovingAcceleration(pilot, pilot.phase === "rejoin");
    applyObstacleAvoidance(pilot, world);
  }

  applyAccelerationLimits(pilot, FIXED_STEP);
  pilot.proposal.x =
    pilot.position.x +
    pilot.velocity.x * FIXED_STEP +
    0.5 * pilot.acceleration.x * FIXED_STEP * FIXED_STEP;
  pilot.proposal.y =
    pilot.position.y +
    pilot.velocity.y * FIXED_STEP +
    0.5 * pilot.acceleration.y * FIXED_STEP * FIXED_STEP;
  pilot.proposal.z =
    pilot.position.z +
    pilot.velocity.z * FIXED_STEP +
    0.5 * pilot.acceleration.z * FIXED_STEP * FIXED_STEP;

  // `hover` is a folded phase for collision exactly as it is for presentation.
  // The Arrival Curve spirals inward instead of holding station at a fixed
  // standoff, so the planner validates the hover arc with the folded pose AND
  // the reserved-support exception — and the pilot has to fly it under the
  // same rule it was planned under.
  //
  // Leaving hover out here is why nothing ever landed: every hover step was
  // measured with the open-wing sphere against a support the planner had
  // already forgiven, the step was refused, and the landing bailed to
  // `hover-blocked`. Twenty-one residents spent ninety seconds approaching
  // Perches and reached zero of them.
  const foldedPhase =
    pilot.phase === "hover" ||
    pilot.phase === "touchdown" ||
    pilot.phase === "rest" ||
    foldedLaunchStep;
  const proposalIsClear =
    foldedPhase && world.sweepFolded
      ? world.sweepFolded(
          pilot.position,
          pilot.proposal,
          pilot.normal,
          pilot.tangent,
          true,
        )
      : world.sweepSphere(
          pilot.position,
          pilot.proposal,
          profile.wingRadius,
          foldedPhase || pilot.phase === "launch",
          pilot.phase === "launch" || pilot.phase === "rejoin",
        );

  const speedLimit = insectPilotPhaseLimits(pilot).speed;
  if (proposalIsClear) {
    copy(pilot.position, pilot.proposal);
    holdAboveContactPlane(pilot);
    pilot.blockedSteps = 0;
    pilot.velocity.x += pilot.acceleration.x * FIXED_STEP;
    pilot.velocity.y += pilot.acceleration.y * FIXED_STEP;
    pilot.velocity.z += pilot.acceleration.z * FIXED_STEP;
    clampMagnitude(pilot.velocity, speedLimit);
  } else {
    // The collision constraint holds position, but kinematics must keep
    // integrating so a jerk-limited pilot can turn an inward residual velocity
    // into a valid outward escape. Freezing velocity here made every candidate
    // proposal repeat the same penetrating direction forever.
    pilot.velocity.x += pilot.acceleration.x * FIXED_STEP;
    pilot.velocity.y += pilot.acceleration.y * FIXED_STEP;
    pilot.velocity.z += pilot.acceleration.z * FIXED_STEP;
    clampMagnitude(pilot.velocity, speedLimit);
    // Slide before abandoning (ADR 0005). The pilot TRACKS the planned
    // polyline rather than replaying it, so near tight geometry it deviates by
    // a centimetre or two and a step gets refused; ending the whole landing on
    // one refusal is what made the arrival read as a butterfly repeatedly
    // changing its mind. Measured before this: of ten attempts, seven reached
    // hover, seven touched down, four rested.
    const sliding =
      pilot.phase === "approach" ||
      pilot.phase === "hover" ||
      pilot.phase === "touchdown";
    const slid = sliding && slideLandingStep(pilot, world, foldedPhase);
    if (slid) pilot.blockedSteps = 0;
    // A phase with nothing to abandon — launch, rejoin — keeps its existing
    // behaviour: record the code and keep integrating.
    const abandon =
      !slid && (!sliding || ++pilot.blockedSteps >= LANDING_REFUSAL_STEPS);
    if (abandon) pilot.blockedSteps = 0;
    if (abandon && (pilot.phase === "approach" || pilot.phase === "hover")) {
      pilot.rejectionCode =
        pilot.phase === "approach" ? "approach-blocked" : "hover-blocked";
      releaseReservation(pilot, world);
      pilot.landingPlan = null;
      beginRejoin(pilot, "approach-blocked");
    } else if (abandon && pilot.phase === "touchdown") {
      pilot.rejectionCode = "touchdown-blocked";
      // At touchdown the support is intentionally inside the spherical flight
      // envelope. Releasing it before moving outward would turn that support
      // back into a collider around the pilot and permanently pin rejoin.
      if (commandInsectPilot(pilot, { type: "depart" }, world)) {
        pilot.rejectionCode = "touchdown-blocked";
        pilot.event = "approach-blocked";
      }
    } else if (abandon && pilot.phase === "launch") {
      pilot.rejectionCode = "launch-blocked";
    } else if (abandon && pilot.phase === "rejoin") {
      pilot.rejectionCode = "rejoin-blocked";
    }
  }

  if (
    pilot.phase === "approach" &&
    (pilot.landingPlan
      ? reachedMovingRouteEnd(pilot, pilot.landingPlan.approach)
      : reached(
          pilot,
          pilot.stage,
          profile.positionTolerance,
          profile.velocityTolerance,
        ))
  ) {
    pilot.routeIndex = 1;
    enter(pilot, "hover", "hover");
  } else if (pilot.phase === "hover" && pilot.landingPlan) {
    if (reachedMovingRouteEnd(pilot, pilot.landingPlan.hover)) {
      pilot.routeIndex = 1;
      enter(pilot, "touchdown", "touchdown");
    }
  } else if (
    pilot.phase === "touchdown" &&
    reached(
      pilot,
      pilot.contact,
      profile.contactTolerance,
      profile.contactVelocityTolerance,
    )
  ) {
    enter(pilot, "rest", "landed");
  } else if (pilot.phase === "launch") {
    // An Escape is defined by making ground away from the Perch. It is never
    // defined by arriving anywhere, and specifically not by coming to a halt:
    // the previous exit required stopping dead within eighteen millimetres of
    // a point one launch-length out, which made hovering above the site an
    // insect had just fled the literal exit condition.
    const escaped = distance(pilot.position, pilot.escapeOrigin);
    if (
      escaped >= ESCAPE_DISTANCE ||
      pilot.phaseAge >= ESCAPE_RELEASE_SECONDS ||
      (pilot.plannedLaunch &&
        pilot.landingPlan &&
        reachedMovingRouteEnd(pilot, pilot.landingPlan.launch))
    ) {
      releaseReservation(pilot, world);
      beginRejoin(pilot, "released");
    } else if (
      pilot.phaseAge >=
      ESCAPE_REDIRECT_SECONDS * (pilot.escapeRedirects + 1)
    ) {
      // No progress on this heading. Try another one rather than pressing on;
      // the forced release above still bounds the whole attempt.
      pilot.escapeRedirects++;
      pilot.plannedLaunch = false;
      copy(pilot.launchDirection, pilot.normal);
      chooseEscapeDirection(pilot, world, pilot.escapeRedirects);
      pilot.routeIndex = 1;
    }
  } else if (pilot.phase === "rejoin") {
    const rejoinPosition =
      pilot.landingPlan?.rejoin.at(-1) ?? pilot.cruise.position;
    const rejoinVelocity =
      pilot.landingPlan?.rejoinVelocity ?? pilot.cruise.velocity;
    const positionError = distance(pilot.position, rejoinPosition);
    const velocityError = magnitude(
      pilot.velocity.x - rejoinVelocity.x,
      pilot.velocity.y - rejoinVelocity.y,
      pilot.velocity.z - rejoinVelocity.z,
    );
    if (
      pilot.landingPlan &&
      pilot.routeIndex < pilot.landingPlan.rejoin.length &&
      reachedMovingRouteEnd(pilot, pilot.landingPlan.rejoin)
    ) {
      // The polyline controls the complete collision-validated corridor. A
      // short terminal Hermite then satisfies position and non-zero route
      // velocity simultaneously instead of chasing a velocity at a fixed
      // point and orbiting it forever.
      copy(pilot.rejoinStart, pilot.position);
      copy(pilot.rejoinStartVelocity, pilot.velocity);
      copy(pilot.rejoinTarget, rejoinPosition);
      copy(pilot.rejoinVelocity, rejoinVelocity);
      pilot.rejoinDuration = Math.max(
        4,
        distance(pilot.rejoinStart, pilot.rejoinTarget) /
          Math.max(0.2, profile.launchSpeed * 0.45),
      );
      pilot.routeIndex = pilot.landingPlan.rejoin.length;
      pilot.phaseAge = 0;
    } else if (
      (!pilot.landingPlan ||
        pilot.routeIndex >= pilot.landingPlan.rejoin.length) &&
      positionError <= profile.rejoinPositionTolerance * 1.5 &&
      velocityError <= profile.rejoinVelocityTolerance
    ) {
      pilot.landingPlan = null;
      enter(pilot, "roam", "rejoined");
    } else if (
      pilot.landingPlan &&
      pilot.routeIndex >= pilot.landingPlan.rejoin.length &&
      pilot.phaseAge >= pilot.rejoinDuration
    ) {
      // Acceleration/jerk limits can leave a long connector a few centimetres
      // outside its cubic boundary at the nominal duration. Refit only this
      // terminal correction from the current state; the collision-validated
      // polyline has already governed the actual corridor.
      copy(pilot.rejoinStart, pilot.position);
      copy(pilot.rejoinStartVelocity, pilot.velocity);
      pilot.rejoinDuration = Math.max(
        4,
        distance(pilot.rejoinStart, pilot.rejoinTarget) /
          Math.max(0.2, profile.launchSpeed * 0.45),
      );
      pilot.phaseAge = 0;
    }
  }

  advanceWing(pilot, FIXED_STEP);
  advanceFlap(pilot, FIXED_STEP);
}

/**
 * Advance by wall-clock delta using deterministic 120 Hz fixed substeps.
 * Returns the same state object for renderer convenience; no per-frame object
 * or array is created.
 */
export function advanceInsectPilot(
  pilot: InsectPilot,
  delta: number,
  world: InsectFlightWorld,
): InsectPilot {
  pilot.event = "none";
  if (!Number.isFinite(delta) || delta <= 0) return pilot;
  // A backgrounded tab must not replay minutes of hidden flight on resume.
  // Twelve fixed steps cover a real 100 ms hitch while keeping frame work
  // bounded; the live cruise sampler then becomes a moving rejoin target.
  pilot.accumulator += Math.min(delta, MAX_FRAME_DELTA);
  while (pilot.accumulator + EPSILON >= FIXED_STEP) {
    advanceFixed(pilot, world);
    pilot.accumulator -= FIXED_STEP;
  }
  if (pilot.accumulator < 0 && pilot.accumulator > -EPSILON)
    pilot.accumulator = 0;
  return pilot;
}
