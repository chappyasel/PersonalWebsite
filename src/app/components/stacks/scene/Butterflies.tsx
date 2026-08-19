"use client";

// Three world-resident butterflies per shelf over the flower field, day only.
//
// The meadow has weather, wind and drifting light but nothing else in it that
// chooses where to go. Each resident steers itself through its Unit's Flight
// Volume — a drifting wander heading, repulsion from nearby geometry, and a
// containment boundary — while the existing acceleration-limited pilot owns
// the Landing Cycle, the Escape, and the return to roaming.
//
// One Flight Volume is anchored to each unit, and they TILE, so Residency is
// something a resident can lose: it migrates across a shared face, transits
// when redistribution has to beat drift, and is re-homed outright while it is
// provably off screen. Population follows the camera; no insect ever does
// (see `insectResidency.ts` and ADR 0004).
import { UNIT_COUNT } from "../data";
import { useStacks } from "../store";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { INSECT_ENVELOPES } from "./insectCollision";
import {
  type InsectFlightVolume,
  insectFlightVolumePoint,
  insectFlightVolumeRegion,
} from "./insectFlightVolume";
import {
  ThreeInsectFlightWorld,
  diagnoseInsectPerch,
  insectCollisionIndexRevision,
  prepareInsectLandingTarget,
} from "./insectFlightWorld";
import {
  INSECT_LANDING_YAW,
  LANDING_TIMING,
  landingNoise,
  pointerDisturbanceIsConfirmed,
} from "./insectLanding";
import { insectDiagnosticsController } from "./insectPerchDiagnostic";
import {
  getInsectPerch,
  getInsectPerches,
  insectPerchOccupant,
  insectPerchOwnerId,
} from "./insectPerches";
import {
  BUTTERFLY_PILOT_PROFILE,
  type InsectEscapeCause,
  type InsectKinematicSample,
  type InsectLandingTarget,
  type InsectPilot,
  type InsectPilotProfile,
  advanceInsectPilot,
  commandInsectPilot,
  createInsectPilot,
} from "./insectPilot";
import {
  BUTTERFLY_RESIDENCY,
  UNIT_FLIGHT_CONTAINMENTS,
  UNIT_FLIGHT_VOLUMES,
  butterflyIsOutOfFrame,
  butterflyMigrationBias,
  butterflyMigrationCandidate,
  butterflyMigrationIsPermitted,
  butterflyRehomingMargin,
  butterflyResidencyDemand,
  butterflyTransitDestination,
  butterflyTransitDirection,
  relocateInsectBetweenUnits,
} from "./insectResidency";
import {
  BUTTERFLY_STEERING_PROFILE,
  nudgeInsectSteering,
} from "./insectSteering";
import {
  type InsectTrail,
  clearInsectTrail,
  createInsectTrail,
  insectTrailPoints,
  recordInsectTrail,
} from "./insectTrail";
import { MEADOW_GROUND_BASE } from "./meadowField";

const TAU = Math.PI * 2;

/** ~11 cm total wingspan at the meadow's scale, which is a large real
 * swallowtail. The outline below keeps that footprint while replacing the
 * old rectangles with distinct forewing and hindwing lobes. */
const WING_SPAN = 0.05;

function createWingGeometry() {
  const wing = new THREE.Shape();
  // Shape-space +y becomes world -z after the mesh is laid flat. The upper
  // run is therefore the swept-back forewing; the lower lobe is the smaller,
  // rounder hindwing. Both meet at the thorax rather than at a square edge.
  wing.moveTo(0.002, -0.014);
  wing.bezierCurveTo(0.018, -0.03, 0.043, -0.033, WING_SPAN, -0.021);
  wing.bezierCurveTo(0.057, -0.006, 0.047, 0.009, 0.034, 0.012);
  wing.bezierCurveTo(0.044, 0.024, 0.038, 0.038, 0.023, 0.035);
  wing.bezierCurveTo(0.011, 0.031, 0.004, 0.017, 0.002, 0.008);
  wing.closePath();
  const geometry = new THREE.ShapeGeometry(wing, 5);

  // A low-cost root-to-tip value gradient suggests wing membranes and a dark
  // thoracic joint without another mesh, texture, or draw call. Vertex colour
  // multiplies each butterfly's authored species colour.
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const across = THREE.MathUtils.clamp(position.getX(i) / WING_SPAN, 0, 1);
    const shade = 0.62 + 0.38 * Math.sqrt(across);
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createBodyGeometry() {
  const body = new THREE.Shape();
  body.moveTo(-0.006, -0.012);
  body.bezierCurveTo(-0.007, 0.002, -0.0045, 0.028, 0, 0.037);
  body.bezierCurveTo(0.0045, 0.028, 0.007, 0.002, 0.006, -0.012);
  body.closePath();

  const head = new THREE.Shape();
  head.absarc(0, -0.019, 0.0065, 0, TAU, false);

  // Antennae are narrow tapered membranes rather than Lines: native WebGL
  // line width is inconsistent, while these remain visible as a one-pixel
  // silhouette on every device and can merge into the same body draw.
  const antenna = (side: 1 | -1) => {
    const shape = new THREE.Shape();
    shape.moveTo(side * 0.0015, -0.022);
    shape.lineTo(side * 0.014, -0.045);
    shape.lineTo(side * 0.0124, -0.046);
    shape.lineTo(side * 0.0005, -0.024);
    shape.closePath();
    return shape;
  };
  return new THREE.ShapeGeometry([body, head, antenna(-1), antenna(1)], 5);
}

/** Body heading eases toward the travel direction rather than snapping to it:
 * where the two wander sines briefly cancel, the instantaneous heading is
 * undefined and would flick. */
const YAW_LAMBDA = 4.0;
const ROLL_LAMBDA = 5.0;
const BANK_K = 0.55;
const BANK_MAX = 0.45;
/**
 * Tangential speed below which travel direction stops being evidence of where
 * the insect is pointing, in m/s.
 *
 * The pilot TRACKS the Arrival Curve with a position controller rather than
 * replaying it, so over the last centimetres its velocity is no longer travel —
 * it is convergence correction, and a damped controller settling on a target
 * oscillates. Rebuilding the facing from that vector each frame turned the
 * settle into a back-and-forth spin. Nothing about the curve caused it, which is
 * why flattening the winding did not help.
 *
 * Real insects do not re-derive their heading from their instantaneous velocity,
 * least of all while stopping: orientation carries its own momentum. So the
 * heading is captured while the insect is still genuinely travelling and then
 * HELD. 0.08 sits well under the 0.22 m/s touchdown speed and well over the
 * controller's residual noise.
 */
const REST_HEADING_HOLD_SPEED = 0.08;
/** Airspeed above the hold speed over which bank authority returns, in m/s. */
const BANK_FADE_SPEED = 0.22;
/** Theme crossfade, matching the meadow's own uDark damp. */
const DARK_LAMBDA = 3.5;

// Wing colours are the meadow's three flower species (Meadow.tsx COLORS:
// #5b76d6 cornflower, #e0862f poppy, #ece0c6 cream) lifted toward the light,
// because these are unlit MeshBasicMaterial against a field whose flowers are
// shaded — authored at the flower hexes they printed as three dark flecks.
//
// `flapHz` is now the CRUISE wingbeat rather than a constant: the Flap Layer
// interpolates between a slow deep hover beat and this rate with airspeed. The
// three values stay distinct on purpose — a shared frequency is what makes
// three insects read as one flock of clones.
// `restingIdle` is a temperament, not a tuning: three insects perched on the
// same shelf opening their wings on the same schedule read as three copies of
// one insect, which is the same failure the shared `flapHz` had. The cream one
// is restless and shallow, the blue one rare and deep, the orange one somewhere
// between with a quicker gesture.
//
// The intervals came down with the stay (`LANDING_TIMING.butterflyRest`, now
// 9-15 s rather than 30-62). At the old spacing the blue one would have opened
// its wings roughly once per visit and often not at all, and the temperament
// that was supposed to read as "rare and deep" would simply have read as dead.
// `bob` is the thorax rock through the same episode, in radians — the deeper
// the opening, the more the insect shifts with it.
const FLIGHTS = [
  {
    color: "#f2e8d2",
    flapHz: 9.3,
    restingIdle: { interval: [1.3, 3.2], duration: 0.8, depth: 0.6, bob: 0.07 },
  },
  {
    color: "#8b9be0",
    flapHz: 8.2,
    restingIdle: {
      interval: [2.8, 6.4],
      duration: 1.25,
      depth: 0.9,
      bob: 0.12,
    },
  },
  {
    color: "#e8a25e",
    flapHz: 10.1,
    restingIdle: {
      interval: [1.9, 4.5],
      duration: 0.65,
      depth: 0.72,
      bob: 0.09,
    },
  },
] as const;
/** Metres the renderer drops the body below the collision datum once its
 * wings are shut. See `InsectEnvelope.renderLift`. */
const BUTTERFLY_RENDER_SINK =
  INSECT_ENVELOPES.butterfly.contactLift -
  INSECT_ENVELOPES.butterfly.renderLift;

/**
 * How many butterflies the room holds.
 *
 * It was `UNIT_COUNT * 3` — an arrangement, from when a resident had one shelf
 * for the life of the page. Residency migrates now, so the count is no longer
 * a statement about any shelf; it is a statement about the FRAME, and the frame
 * shows about one Unit. Owner review of 21: "no more than 5 on screen otherwise
 * feels spammy. 3-5 at all times feels ideal." Eighteen against a cap of four
 * (`BUTTERFLY_RESIDENCY.maxPerUnit`) puts four on the Unit in view, three on
 * each side, and two at the far end.
 *
 * Cutting three also cuts traffic: demand now swings by at most two per Unit as
 * the camera passes, so a redistribution is a couple of crossings rather than a
 * shelf emptying.
 */
export const BUTTERFLY_COUNT = 18;

// Three translucent wing poses across a fixed shutter interval read as
// rotational motion blur rather than a duplicate wing. All 126 samples are
// submitted in one InstancedMesh, so the entire population costs one draw call.
const WING_BLUR_SAMPLES = 5;
const WING_BLUR_INSTANCE_COUNT = BUTTERFLY_COUNT * 2 * WING_BLUR_SAMPLES;
/** Fixed middle ground chosen after comparing 50 ms / 3× against an
 * intentionally excessive 80 ms / 10× diagnostic treatment. */
const WING_BLUR_EXPOSURE = 0.06;
const WING_BLUR_STRENGTH = 5;
const WING_BLUR_MIN_ANGULAR_SPEED = 7;
const WING_BLUR_FULL_ANGULAR_SPEED = 52;
const WING_BLUR_OPACITY = [0.075, 0.045, 0.025, 0.016, 0.01] as const;
const WING_BLUR_ANGLE_LIMIT = 1.45;

function createWingBlurMaterial() {
  const material = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    toneMapped: false,
  });
  // MeshBasicMaterial keeps the exact authored wing colour/gradient. The one
  // custom attribute only supplies per-sample alpha, letting a single
  // InstancedMesh hold every colour, side, and temporal pose.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float instanceOpacity;
varying float vInstanceOpacity;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vInstanceOpacity = instanceOpacity;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vInstanceOpacity;`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        "vec4 diffuseColor = vec4( diffuse, opacity * vInstanceOpacity );",
      );
  };
  material.customProgramCacheKey = () => "butterfly-wing-blur-v1";
  return material;
}

/** Where a resident starts. After boot this is only an initial condition:
 * Residency is `ButterflyMotion.currentUnit`, and it moves. */
export function butterflyHomeUnit(index: number) {
  // Spread whatever the count is across all seven Units rather than filling
  // three at a time: with 18 residents the old `floor(index / 3)` left unit 6
  // empty at mount, and the floor of 2 would then have to be repaired by a
  // crossing before the visitor had scrolled anywhere.
  return Math.min(
    UNIT_COUNT - 1,
    Math.floor((index * UNIT_COUNT) / BUTTERFLY_COUNT),
  );
}

/**
 * How far from the shelf in view a resident may still start a landing.
 *
 * One Unit meant a shelf was only ever populated after the visitor arrived at
 * it, so every approach happened in full view and the shelf you scrolled onto
 * was always empty — "sometimes it seems like they never land. or it takes
 * forever". Two Units is far enough ahead of the camera that arriving on a
 * shelf means arriving on one somebody is already sitting on, and it is still
 * short of the whole room, so residents at the far end are not planning against
 * a collision index nobody is looking at.
 */
export const BUTTERFLY_LANDING_REACH = 2;

/** Eligibility is judged on where a resident IS, not on where it started. */
export function butterflyIsActiveNeighbor(
  currentUnit: number,
  activeUnit: number,
) {
  return Math.abs(currentUnit - activeUnit) <= BUTTERFLY_LANDING_REACH;
}

/** Select at most one resident of the active shelf for a forced attempt. An
 * engaged resident is skipped so a queued force request can be serviced by
 * another of the shelf's residents without disturbing a Landing Cycle. Which
 * residents those are is now a runtime question — index no longer implies
 * Unit — so the caller supplies the lookup. */
export function selectForcedButterflyResident(
  activeUnit: number,
  unitOf: (index: number) => number,
  canAttempt: (index: number) => boolean,
) {
  for (let index = 0; index < BUTTERFLY_COUNT; index++) {
    if (unitOf(index) !== activeUnit) continue;
    if (canAttempt(index)) return index;
  }
  return null;
}

/** mulberry32 over the resident's own migration stream. */
function nextMigrationRandom(motion: Pick<ButterflyMotion, "migrationRandom">) {
  motion.migrationRandom = (motion.migrationRandom + 0x6d2b79f5) >>> 0;
  let value = motion.migrationRandom;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export type ButterflyResidencyEvent = "none" | "migrated" | "rehomed";

/**
 * Hand out crossing orders — at most as many per Unit as the imbalance
 * actually calls for.
 *
 * Judged per insect, "am I surplus?" is true for EVERY resident of an
 * over-populated Unit at once, so a shelf one over its demand sent all of its
 * residents across together. That is a conveyor belt, not a redistribution,
 * and it also starved the Landing Cycle: a resident under orders does not
 * attempt a Perch, so a room that never quite settles never lands anyone.
 *
 * Orders are sticky. A resident already crossing keeps its destination as long
 * as its origin is still over-subscribed, so the population does not re-decide
 * who is moving several times a second.
 */
export function assignButterflyTransits(
  motions: readonly Pick<
    ButterflyMotion,
    "currentUnit" | "transitTo" | "transitAt" | "seed"
  >[],
  residents: readonly number[],
  demand: readonly number[],
  roaming: (index: number) => boolean,
  time: number,
) {
  const leaving = new Array<number>(residents.length).fill(0);
  let crossing = 0;
  for (let index = 0; index < motions.length; index++) {
    const motion = motions[index]!;
    if (motion.transitTo === null) continue;
    // An order that has been served, or whose reason has gone, is released.
    if (
      motion.transitTo === motion.currentUnit ||
      !roaming(index) ||
      (residents[motion.currentUnit] ?? 0) <= (demand[motion.currentUnit] ?? 0)
    ) {
      motion.transitTo = null;
      continue;
    }
    leaving[motion.currentUnit]! += 1;
    crossing += 1;
  }
  for (let unit = 0; unit < residents.length; unit++) {
    if (crossing >= BUTTERFLY_RESIDENCY.maxConcurrentTransits) break;
    let outstanding =
      (residents[unit] ?? 0) - (demand[unit] ?? 0) - (leaving[unit] ?? 0);
    if (outstanding <= 0) continue;
    for (
      let index = 0;
      index < motions.length &&
      outstanding > 0 &&
      crossing < BUTTERFLY_RESIDENCY.maxConcurrentTransits;
      index++
    ) {
      const motion = motions[index]!;
      if (motion.currentUnit !== unit || motion.transitTo !== null) continue;
      if (!roaming(index)) continue;
      // Resolved per RESIDENT, not per Unit, so a shelf that is short on both
      // sides is fed from both sides rather than emptying leftward.
      const destination = butterflyTransitDestination(
        residents,
        demand,
        unit,
        (index & 1) === 1,
      );
      if (destination === null) break;
      motion.transitTo = destination;
      // Orders are handed out on one frame; the crossings must not start on
      // one. Until this passes the resident roams normally, so it leaves from
      // wherever its own wander has taken it by then.
      const [low, high] = BUTTERFLY_RESIDENCY.transitStagger;
      motion.transitAt =
        time + low + (high - low) * landingNoise(index, unit * 7 + 3);
      outstanding -= 1;
      crossing += 1;
    }
  }
}

const TRANSIT_DIRECTION = { x: 0, y: 0, z: 0 };

/**
 * Advance one resident's Residency by `step` seconds.
 *
 * Three outcomes, in strict order of preference: re-home if the insect is
 * surplus AND provably off screen, because that is instant and free; otherwise
 * transit toward the deficit, which always works and is merely slower; and in
 * either case adopt a neighbour the moment its volume actually contains the
 * insect, which is the only point at which a handoff moves nothing.
 *
 * `residents` is mutated so a single frame cannot hand two residents the same
 * last free slot.
 */
export function updateButterflyResidency(options: {
  motion: ButterflyMotion;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  roaming: boolean;
  residents: number[];
  cameraX: number;
  rehomingMargin: number;
  step: number;
  time: number;
}): ButterflyResidencyEvent {
  const { motion, residents } = options;
  if (!options.roaming) {
    // A resident with a Landing Plan in the air is committed to one shelf.
    motion.transitTo = null;
    return "none";
  }
  const from = motion.currentUnit;

  if (
    motion.transitTo !== null &&
    butterflyIsOutOfFrame(
      options.position,
      options.cameraX,
      options.rehomingMargin,
    )
  ) {
    const to = motion.transitTo;
    if (
      relocateInsectBetweenUnits(from, to, options.position, options.velocity)
    ) {
      residents[from]! -= 1;
      residents[to]! += 1;
      motion.currentUnit = to;
      motion.transitTo = null;
      motion.rehomedAt = options.time;
      return "rehomed";
    }
  }

  const neighbour = butterflyMigrationCandidate(from, options.position);
  if (neighbour === null) return "none";
  const directed =
    motion.transitTo !== null &&
    Math.sign(neighbour - from) === Math.sign(motion.transitTo - from);
  if (!directed) {
    if (!butterflyMigrationIsPermitted(residents, from, neighbour))
      return "none";
    const bias = butterflyMigrationBias(from, neighbour, options.cameraX);
    const chance =
      1 - Math.exp(-BUTTERFLY_RESIDENCY.migrationRate * bias * options.step);
    if (nextMigrationRandom(motion) >= chance) return "none";
  }
  residents[from]! -= 1;
  residents[neighbour]! += 1;
  motion.currentUnit = neighbour;
  if (motion.transitTo === neighbour) motion.transitTo = null;
  return "migrated";
}

/** The crossing heading the Intent Layer should be given this frame, or null
 * for ordinary roaming. */
export function butterflyTransitHeading(
  motion: ButterflyMotion,
  position: { x: number; y: number; z: number },
  time: number,
) {
  if (motion.transitTo === null || time < motion.transitAt) return null;
  return butterflyTransitDirection(
    position,
    motion.transitTo,
    TRANSIT_DIRECTION,
  )
    ? TRANSIT_DIRECTION
    : null;
}

/**
 * How many butterflies a shelf can hold, split by what they are doing.
 *
 * One number used to do both jobs, and it capped the wrong thing. Occupancy is
 * meant to fall out of how long an insect STAYS (see
 * `LANDING_TIMING.butterflyRest`) rather than out of permission to arrive —
 * that is the authored principle — so the settled cap is generous. What has to
 * stay small is the number simultaneously flying at the shelf: with Residency
 * migrating, a Unit the camera has just reached can hold six residents, and six
 * of them diving at the same planks at once reads as an event rather than as a
 * place with wildlife in it.
 */
export const BUTTERFLY_OCCUPANCY = {
  /**
   * Residents holding a Perch on one Unit, settled or otherwise. Three of a
   * shelf's four, so a Unit at full demand always has someone still in the air
   * and the shelf never reads as a display case.
   *
   * Raising this to four to buy back the occupancy the shorter rest costs (see
   * `LANDING_TIMING.butterflyRest`) was tried and is wrong: `maxPerUnit` is 4,
   * so a shelf at full demand could then have every one of its residents
   * standing still. The cheap compensation would have cost the exact property
   * the cap exists to protect, so the shorter dwell is paid for in standing
   * occupancy and bought back in turnover instead.
   */
  engaged: 3,
  /** ...of which how many may still be on their way to one. */
  approaching: 2,
} as const;

/**
 * Seconds a resident of an EMPTY shelf may be made to wait for its next
 * attempt.
 *
 * The ordinary gap between landings is a flight, and a flight is long — which
 * is right for a shelf that already has someone on it and wrong for one that
 * has nobody. Owner review: "how can we have it be that there's basically
 * always 1-2 on perches". Nothing else changes; a shelf that has just lost its
 * last resident simply stops waiting out the full flight. Failure backoff
 * (2.5 s) is shorter than this, so a resident that cannot find a Perch is not
 * pulled into retrying faster than it already is.
 */
export const BUTTERFLY_STARVED_GAP = 3;

/**
 * Seconds a Perch may fail to prepare before an in-flight landing is abandoned.
 *
 * Long enough to ride out a scene-graph rebuild, short enough that a Perch on a
 * prop the visitor has actually picked up and carried off is given up promptly.
 */
export const BUTTERFLY_PERCH_MISS_GRACE = 0.4;

/**
 * Pointer avoidance while roaming (owner review: "is there a way to make them
 * avoid the mouse in general? would be kinda cool if they were subtly
 * elusive").
 *
 * Measured in PIXELS, because that is what "near the cursor" means: the pointer
 * is a ray through the room, and a metre near the camera and a metre at the far
 * shelf are not the same thing on screen. The strength curve is quadratic, so
 * almost all of the effect is in the innermost third of the radius — a resident
 * a hand's width away barely leans, and one you are chasing keeps sliding out
 * of reach.
 *
 * This is distinct from the Escape a pointer provokes during a Landing Cycle
 * (`pointerDisturbanceIsConfirmed`), which is a disturbance with a cause and
 * takes the insect off a Perch. This one never interrupts anything; it is a
 * standing bias on an ordinary roam.
 */
export const BUTTERFLY_EVASION = {
  radiusPx: 210,
  /** Seconds the lean takes to build and to fade. Without it, a cursor
   * crossing a resident switches a force on for one frame and reads as a
   * flinch — and a flinch is a reaction, which is the thing that would make
   * the pointer feel like a weapon. */
  lambda: 3.5,
  /** How much of the lean is "back away from the camera" rather than sideways.
   * Purely lateral evasion looks like a rail; a little depth makes a resident
   * duck behind a prop, which is most of what elusive reads as. */
  depth: 0.35,
} as const;

/** 0..1 from a screen-space distance. Zero at the radius, 1 at the cursor. */
export function butterflyEvasionStrength(distancePx: number) {
  if (!(distancePx < BUTTERFLY_EVASION.radiusPx)) return 0;
  const near = 1 - Math.max(0, distancePx) / BUTTERFLY_EVASION.radiusPx;
  return near * near;
}

export function butterflyNextAttemptAt(
  nextAttemptAt: number,
  engagedOnUnit: number,
  time: number,
) {
  if (engagedOnUnit > 0) return nextAttemptAt;
  return Math.min(nextAttemptAt, time + BUTTERFLY_STARVED_GAP);
}

export function butterflyMayBeginLanding(occupancy: {
  engaged: number;
  approaching: number;
}) {
  return (
    occupancy.engaged < BUTTERFLY_OCCUPANCY.engaged &&
    occupancy.approaching < BUTTERFLY_OCCUPANCY.approaching
  );
}

export function butterflyPerchFailureMessage(
  diagnostic: Pick<
    ReturnType<typeof diagnoseInsectPerch>,
    "rejectionCode" | "rejectionReason"
  >,
) {
  return `Perch rejected: ${diagnostic.rejectionCode} — ${diagnostic.rejectionReason}`;
}

export type ButterflyMotion = {
  pilot: InsectPilot | null;
  world: ThreeInsectFlightWorld | null;
  /**
   * Residency: the Unit whose air this resident currently belongs to. It
   * replaces the derived `butterflyHomeUnit(i)` everywhere — containment, the
   * collision index, the Perches it may reach, and the occupancy tally all
   * read this one field, which is what keeps a handoff from leaving any of
   * them behind (ADR 0004).
   */
  currentUnit: number;
  /** Where a directed crossing is going, or null. */
  transitTo: number | null;
  /** Time the crossing heading engages. See `assignButterflyTransits`. */
  transitAt: number;
  /** Damped pointer lean, in the insect's own state so it survives the frames
   * the cursor is not moving. */
  evade: { x: number; y: number; z: number; strength: number };
  /** Per-resident coin for migration. Deliberately not a shared PRNG: mount
   * order must never correlate two residents or reshuffle them on reload. */
  migrationRandom: number;
  /** Set when Residency last changed by a position write, so the live check
   * can tell a legitimate re-home from a teleport. */
  rehomedAt: number;
  initial: InsectKinematicSample;
  landingTarget: InsectLandingTarget;
  attempts: number;
  nextAttemptAt: number;
  restEndsAt: number;
  nearSince: number;
  themeReleased: boolean;
  departure: THREE.Vector3;
  projected: THREE.Vector3;
  right: THREE.Vector3;
  /** Scratch for projecting travel direction into the surface plane. */
  restForward: THREE.Vector3;
  /** Scratch: the contact normal, as the axis the resting yaw turns about. */
  restAxis: THREE.Vector3;
  /** This landing's resting yaw, in radians. See `INSECT_LANDING_YAW`. */
  landingYaw: number;
  /** This landing's displacement across the Perch surface, 0..1. */
  landingSpread: number;
  /** When the Perch first failed to prepare, or −1. See the grace window. */
  perchMissSince: number;
  /** The facing a landing insect holds: captured from its own arrival, not
   * from the Perch's authored tangent. */
  restHeading: THREE.Vector3;
  restMatrix: THREE.Matrix4;
  surfaceQuaternion: THREE.Quaternion;
  flareQuaternion: THREE.Quaternion;
  seed: number;
  trail: InsectTrail;
  lowSpeedSince: number;
  lastMeaningfulMovement: number;
  telemetryPublishedAt: number;
};

function createKinematicSample(): InsectKinematicSample {
  return {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    acceleration: { x: 0, y: 0, z: 0 },
  };
}

function createLandingTarget(): InsectLandingTarget {
  return {
    id: "",
    point: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    tangent: { x: 0, y: 0, z: 1 },
    clearance: 0,
  };
}

export function createButterflyMotion(seed = 1, homeUnit = 0): ButterflyMotion {
  return {
    pilot: null,
    world: null,
    currentUnit: homeUnit,
    transitTo: null,
    transitAt: 0,
    evade: { x: 0, y: 0, z: 0, strength: 0 },
    migrationRandom: Math.imul(seed + 1, 0x9e3779b1) >>> 0 || 1,
    rehomedAt: -1,
    initial: createKinematicSample(),
    landingTarget: createLandingTarget(),
    attempts: 0,
    nextAttemptAt: 0,
    restEndsAt: Number.POSITIVE_INFINITY,
    nearSince: -1,
    themeReleased: false,
    departure: new THREE.Vector3(0, 1, 0),
    projected: new THREE.Vector3(),
    right: new THREE.Vector3(1, 0, 0),
    restForward: new THREE.Vector3(),
    restAxis: new THREE.Vector3(),
    landingYaw: 0,
    landingSpread: 0,
    perchMissSince: -1,
    restHeading: new THREE.Vector3(),
    restMatrix: new THREE.Matrix4(),
    surfaceQuaternion: new THREE.Quaternion(),
    flareQuaternion: new THREE.Quaternion(),
    seed,
    trail: createInsectTrail(),
    lowSpeedSince: -1,
    lastMeaningfulMovement: 0,
    telemetryPublishedAt: -1,
  };
}

/** Where a resident is standing when the scene first mounts. Anywhere inside
 * its own Flight Volume is valid — there is no graph node to be nearest to and
 * no route to be on — so this only needs to be deterministic per resident and
 * clear of the furniture, which the camera-side bias handles. */
export function butterflyFlightVolume(
  motion: Pick<ButterflyMotion, "currentUnit">,
): InsectFlightVolume {
  return UNIT_FLIGHT_VOLUMES[motion.currentUnit] ?? UNIT_FLIGHT_VOLUMES[0]!;
}

export function butterflyStartPosition(
  motion: ButterflyMotion,
  index: number,
  out: { x: number; y: number; z: number },
) {
  const volume = butterflyFlightVolume(motion);
  const extent = volume.extent;
  out.x = (landingNoise(index, 3) * 2 - 1) * extent.halfWidth * 0.7;
  out.y =
    extent.minY +
    (0.25 + landingNoise(index, 11) * 0.6) * (extent.maxY - extent.minY);
  out.z =
    extent.frontZ + landingNoise(index, 19) * (extent.maxZ - extent.frontZ);
  insectFlightVolumePoint(volume, out, out);
}

/** Roll one recent position into the trail ring buffer. */
export function recordButterflyTrail(
  motion: ButterflyMotion,
  position: { x: number; y: number; z: number },
  time: number,
) {
  return recordInsectTrail(motion.trail, position, time);
}

/** Oldest-first snapshot of the ring buffer, allocated only when the
 * development HUD actually asks for it. */
export function butterflyTrailPoints(motion: ButterflyMotion) {
  return insectTrailPoints(motion.trail);
}

/**
 * Signed distance of the body above the plane it is standing on, or null when
 * it is not standing on one.
 *
 * `pilot.contact` is the resting body centre, so this is zero for a correctly
 * settled insect and negative for one that has sunk into its own Perch. The
 * pilot already projects that away every step; publishing it is what lets the
 * live check prove the projection is still there (ADR 0006).
 */
export function butterflyContactGap(
  pilot: Pick<InsectPilot, "phase" | "position" | "contact" | "normal">,
) {
  if (pilot.phase !== "touchdown" && pilot.phase !== "rest") return null;
  return (
    (pilot.position.x - pilot.contact.x) * pilot.normal.x +
    (pilot.position.y - pilot.contact.y) * pilot.normal.y +
    (pilot.position.z - pilot.contact.z) * pilot.normal.z
  );
}

export const BUTTERFLY_STALL_SPEED = 0.08;
export const BUTTERFLY_STALL_WINDOW = 0.5;
/**
 * Speed of the impulse that breaks a stall, in m/s.
 *
 * Comfortably above `BUTTERFLY_STALL_SPEED` so the escape cannot itself be
 * mistaken for another stall on the next frame, and under the cruise speed so
 * it reads as the insect deciding to move rather than being thrown.
 */
export const BUTTERFLY_STALL_ESCAPE_SPEED = 0.34;

/** Scratch for the direction `nudgeInsectSteering` picks. */
const STALL_ESCAPE = { x: 0, y: 0, z: 0 };

/** A stall is deliberately narrower than "not moving": only an ordinary
 * roaming resident below the meaningful-speed threshold for a full rolling
 * window is frozen. Landing, resting, darkness, and reduced motion reset the
 * observation instead of manufacturing false alarms. */
export function updateButterflyStallState(
  motion: Pick<ButterflyMotion, "lowSpeedSince" | "lastMeaningfulMovement">,
  options: {
    phase: InsectPilot["phase"];
    speed: number;
    time: number;
    dark?: boolean;
    reducedMotion?: boolean;
  },
) {
  if (
    options.phase !== "roam" ||
    options.dark ||
    options.reducedMotion ||
    options.speed >= BUTTERFLY_STALL_SPEED
  ) {
    motion.lowSpeedSince = -1;
    if (options.speed >= BUTTERFLY_STALL_SPEED)
      motion.lastMeaningfulMovement = options.time;
    return false;
  }
  if (motion.lowSpeedSince < 0) motion.lowSpeedSince = options.time;
  return options.time - motion.lowSpeedSince > BUTTERFLY_STALL_WINDOW;
}

/** What kind of Disturbance provoked an Escape. Severity is part of a
 * Disturbance's identity, so it is classified here rather than reduced to a
 * strength the pilot would have to guess at. */
export function butterflyEscapeCause(options: {
  grabbed: boolean;
  dragging: boolean;
  proximity: boolean;
}): InsectEscapeCause {
  if (options.grabbed) return "grab";
  if (options.dragging) return "drag";
  if (options.proximity) return "pointer";
  return "calm";
}

const wrapPi = (a: number) =>
  THREE.MathUtils.euclideanModulo(a + Math.PI, TAU) - Math.PI;
/** The body's own lateral axis in its rest basis (right, normal, tangent). */
const PITCH_AXIS = new THREE.Vector3(1, 0, 0);
const BUTTERFLY_PILOT_PROFILES: readonly InsectPilotProfile[] = FLIGHTS.map(
  (flight) => ({
    ...BUTTERFLY_PILOT_PROFILE,
    wingFrequency: flight.flapHz,
    restingIdle: flight.restingIdle,
  }),
);

function Flight({
  dark,
  wingBlurSamples,
  suspendOffscreen,
}: {
  dark: boolean;
  wingBlurSamples: 0 | 1 | 3 | 5;
  suspendOffscreen: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const bodies = useRef<(THREE.Group | null)[]>([]);
  const wingBlur = useRef<THREE.InstancedMesh>(null);
  /** Wing pivots, two per butterfly at 2i (span +x) and 2i+1 (span −x). */
  const wings = useRef<(THREE.Group | null)[]>([]);
  // Start AT the current theme: a dark boot must not open with three
  // butterflies shrinking away.
  const darkAmt = useRef(dark ? 1 : 0);
  const wingGeometry = useMemo(() => createWingGeometry(), []);
  const wingBlurOpacity = useMemo(() => {
    const attribute = new THREE.InstancedBufferAttribute(
      new Float32Array(WING_BLUR_INSTANCE_COUNT),
      1,
    );
    attribute.setUsage(THREE.DynamicDrawUsage);
    return attribute;
  }, []);
  const wingBlurGeometry = useMemo(() => {
    const geometry = wingGeometry.clone();
    geometry.setAttribute("instanceOpacity", wingBlurOpacity);
    return geometry;
  }, [wingBlurOpacity, wingGeometry]);
  const wingBlurMaterial = useMemo(() => createWingBlurMaterial(), []);
  const wingBlurPivotMatrix = useMemo(() => new THREE.Matrix4(), []);
  const wingBlurInstanceMatrix = useMemo(() => new THREE.Matrix4(), []);
  const wingBlurLocalMatrices = useMemo(
    () =>
      ([1, -1] as const).map((side) => {
        const rotation = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
        const scale = new THREE.Matrix4().makeScale(side, 1, 1);
        return rotation.multiply(scale);
      }),
    [],
  );
  const bodyGeometry = useMemo(() => createBodyGeometry(), []);
  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#30251e",
        side: THREE.DoubleSide,
      }),
    [],
  );
  const wingMaterials = useMemo(
    () =>
      FLIGHTS.map(
        (flight) =>
          new THREE.MeshBasicMaterial({
            color: flight.color,
            side: THREE.DoubleSide,
            vertexColors: true,
          }),
      ),
    [],
  );
  const sessionSeed = useRef(Math.floor(Math.random() * 0x7fffffff));
  const motions = useRef(
    Array.from({ length: BUTTERFLY_COUNT }, (_, index) =>
      createButterflyMotion(
        sessionSeed.current + index * 104729,
        butterflyHomeUnit(index),
      ),
    ),
  );
  const pointerIsTouch = useRef(true);
  const pointerActiveUntil = useRef(0);
  const cameraRight = useRef(new THREE.Vector3());
  const cameraUp = useRef(new THREE.Vector3());
  const cameraBack = useRef(new THREE.Vector3());
  const evadeVector = useRef(new THREE.Vector3());
  const handledForceRequest = useRef(0);
  const residencyPublishedAt = useRef(-1);
  useEffect(() => {
    const mesh = wingBlur.current;
    if (!mesh) return;
    const color = new THREE.Color();
    for (let i = 0; i < BUTTERFLY_COUNT; i++) {
      color.set(FLIGHTS[i % FLIGHTS.length]!.color);
      for (let side = 0; side < 2; side++) {
        for (let sample = 0; sample < WING_BLUR_SAMPLES; sample++) {
          const index = (i * 2 + side) * WING_BLUR_SAMPLES + sample;
          mesh.setColorAt(index, color);
        }
      }
    }
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);
  useEffect(() => {
    const landingMotions = motions.current;
    const rememberPointer = (event: PointerEvent) => {
      pointerIsTouch.current = event.pointerType === "touch";
      pointerActiveUntil.current = performance.now() + 750;
    };
    window.addEventListener("pointermove", rememberPointer, { passive: true });
    window.addEventListener("pointerdown", rememberPointer, { passive: true });
    return () => {
      window.removeEventListener("pointermove", rememberPointer);
      window.removeEventListener("pointerdown", rememberPointer);
      for (const motion of landingMotions) {
        if (motion.pilot && motion.world)
          commandInsectPilot(motion.pilot, { type: "cancel" }, motion.world);
        motion.world?.dispose();
      }
      insectDiagnosticsController.clearFlightStates();
    };
  }, []);
  useEffect(
    () => () => {
      wingGeometry.dispose();
      wingBlurGeometry.dispose();
      wingBlurMaterial.dispose();
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      for (const material of wingMaterials) material.dispose();
    },
    [
      bodyGeometry,
      bodyMaterial,
      wingBlurGeometry,
      wingBlurMaterial,
      wingGeometry,
      wingMaterials,
    ],
  );

  useFrame(({ clock, camera, pointer, size }, delta) => {
    const g = root.current;
    if (!g) return;
    const t = clock.elapsedTime;
    darkAmt.current = THREE.MathUtils.damp(
      darkAmt.current,
      dark ? 1 : 0,
      DARK_LAMBDA,
      delta,
    );
    const day = 1 - darkAmt.current;
    if (darkAmt.current > 0.5) {
      for (let index = 0; index < motions.current.length; index++) {
        const motion = motions.current[index]!;
        if (motion.themeReleased) continue;
        if (motion.pilot && motion.world)
          commandInsectPilot(motion.pilot, { type: "cancel" }, motion.world);
        motion.world?.dispose();
        motion.nextAttemptAt =
          t +
          LANDING_TIMING.retryBackoff[0] +
          (LANDING_TIMING.retryBackoff[1] - LANDING_TIMING.retryBackoff[0]) *
            landingNoise(index, motion.attempts * 23 + 9);
        motion.restEndsAt = Number.POSITIVE_INFINITY;
        motion.nearSince = -1;
        motion.themeReleased = true;
        motion.lowSpeedSince = -1;
      }
    } else {
      for (const motion of motions.current) motion.themeReleased = false;
    }
    // Night costs one damp and one comparison — nothing below runs, and the
    // meshes are off the draw list rather than drawn at zero scale.
    g.visible = day > 0.02;
    if (!g.visible) {
      // Butterflies only. This used to wipe the whole map, and the moths — who
      // are alive at exactly the hours the butterflies are not — publish every
      // 0.25 s, so each moth trail lived from its publish until the next
      // butterfly frame. Owner review: "moth flight trails are still flashing
      // like 2 times per second."
      if (
        process.env.NODE_ENV === "development" &&
        insectDiagnosticsController.hasFlightTelemetry("butterfly")
      )
        insectDiagnosticsController.clearFlightTelemetry("butterfly");
      return;
    }

    const ease = 1 - Math.exp(-YAW_LAMBDA * delta);
    const stacks = useStacks.getState();
    const diagnostics =
      process.env.NODE_ENV === "development"
        ? insectDiagnosticsController.getSnapshot()
        : null;
    const forceRequested = Boolean(
      diagnostics && diagnostics.forceRequest > handledForceRequest.current,
    );
    const wingBlurMesh = wingBlur.current;
    if (wingBlurMesh) wingBlurOpacity.array.fill(0);
    const forcedResident = forceRequested
      ? selectForcedButterflyResident(
          stacks.activeUnit,
          (index) => motions.current[index]?.currentUnit ?? -1,
          (index) => {
            const pilot = motions.current[index]?.pilot;
            return !pilot || pilot.phase === "roam";
          },
        )
      : null;
    // Residency is judged once per frame against the CONTINUOUS camera x.
    // `activeUnit` is deliberately not usable here: the store changes it a
    // handful of times per traverse, so weighting against it would move the
    // whole population in seven steps instead of following the viewer.
    const perspective = camera as THREE.PerspectiveCamera;
    const cameraX = perspective.position.x;
    const residents = new Array<number>(UNIT_COUNT).fill(0);
    for (const motion of motions.current) residents[motion.currentUnit]! += 1;
    const demand = butterflyResidencyDemand(cameraX, BUTTERFLY_COUNT);
    assignButterflyTransits(
      motions.current,
      residents,
      demand,
      (index) => (motions.current[index]?.pilot?.phase ?? "roam") === "roam",
      t,
    );
    // Camera basis for pointer evasion. Screen-space right and up, so a lean
    // "away from the cursor" is computed in the space the cursor lives in.
    const pointerIsLive =
      !pointerIsTouch.current &&
      performance.now() <= pointerActiveUntil.current;
    if (pointerIsLive) {
      cameraRight.current.setFromMatrixColumn(camera.matrixWorld, 0);
      cameraUp.current.setFromMatrixColumn(camera.matrixWorld, 1);
      cameraBack.current.setFromMatrixColumn(camera.matrixWorld, 2);
    }
    const rehomingMargin = butterflyRehomingMargin({
      fov: perspective.fov,
      aspect: perspective.aspect,
      z: perspective.position.z,
    });
    // Engaged residents PER UNIT. Decision 2.6 caps three concurrent on the
    // active shelf; this used to be one global pool of three shared by every
    // resident whose home was within one Unit of the camera — nine residents
    // competing for three slots, so the shelf you were actually looking at
    // averaged about one perched butterfly instead of two or three.
    const engagedByUnit = new Array<number>(UNIT_COUNT).fill(0);
    const approachingByUnit = new Array<number>(UNIT_COUNT).fill(0);
    for (const motion of motions.current) {
      if (!motion.pilot?.reservedPerchId) continue;
      engagedByUnit[motion.currentUnit]! += 1;
      if (
        motion.pilot.phase === "approach" ||
        motion.pilot.phase === "hover" ||
        motion.pilot.phase === "touchdown"
      )
        approachingByUnit[motion.currentUnit]! += 1;
    }
    if (
      process.env.NODE_ENV === "development" &&
      t - residencyPublishedAt.current >= 0.25
    ) {
      residencyPublishedAt.current = t;
      insectDiagnosticsController.publishResidency({
        cameraX,
        rehomingMargin,
        demand,
        residents: [...residents],
        transits: motions.current.map((motion) => motion.transitTo),
      });
    }
    for (let i = 0; i < BUTTERFLY_COUNT; i++) {
      const b = bodies.current[i];
      const wr = wings.current[i * 2];
      const wl = wings.current[i * 2 + 1];
      if (!b || !wr || !wl) continue;
      const motion = motions.current[i]!;
      if (
        suspendOffscreen &&
        Math.abs(motion.currentUnit - stacks.activeUnit) > 1
      ) {
        b.visible = false;
        continue;
      }
      b.visible = true;
      const occupant = `butterfly:${i}`;
      if (!motion.pilot || !motion.world) {
        // No cruise sampler: a steering resident has no analytic flight to
        // copy, and nothing downstream may be handed a position to play back.
        const world = new ThreeInsectFlightWorld(occupant, "butterfly");
        motion.world = world;
        world.setContext(motion.currentUnit, t);
        butterflyStartPosition(motion, i, motion.initial.position);
        motion.initial.velocity.x = 0;
        motion.initial.velocity.y = 0;
        motion.initial.velocity.z = 0;
        motion.pilot = createInsectPilot({
          occupantId: occupant,
          flightId: i,
          seed: motion.seed,
          initialTime: t,
          initial: motion.initial,
          profile: BUTTERFLY_PILOT_PROFILES[i % FLIGHTS.length]!,
          roam: {
            profile: BUTTERFLY_STEERING_PROFILE,
            containment: UNIT_FLIGHT_CONTAINMENTS[motion.currentUnit]!,
            volume: UNIT_FLIGHT_VOLUMES[motion.currentUnit]!,
            transit: null,
            evade: null,
          },
        });
        motion.lastMeaningfulMovement = t;
        // Boot used to hold every resident in the air for 8-20 s, so the room
        // the visitor first sees is guaranteed to have nobody sitting on
        // anything — the worst possible first impression of a system whose
        // whole point is that insects land. They start trying almost at once
        // instead; the occupancy caps still decide how many succeed.
        motion.nextAttemptAt = t + 0.6 + 3.4 * landingNoise(i, 1);
      }
      const pilot = motion.pilot;
      const world = motion.world;
      // Residency first: everything below — the collision index, the Perches
      // this resident may reach, the occupancy it counts against — reads
      // `motion.currentUnit`, so a handoff has to land before any of them.
      const residencyEvent = updateButterflyResidency({
        motion,
        position: pilot.position,
        velocity: pilot.velocity,
        roaming: pilot.phase === "roam",
        residents,
        cameraX,
        rehomingMargin,
        step: delta,
        time: t,
      });
      if (residencyEvent !== "none" && pilot.roam) {
        pilot.roam.containment = UNIT_FLIGHT_CONTAINMENTS[motion.currentUnit]!;
        pilot.roam.volume = UNIT_FLIGHT_VOLUMES[motion.currentUnit]!;
        motion.nearSince = -1;
        // Only a re-home moved anything. A migration is a handoff at a shared
        // face, so its trail is continuous and worth keeping; a re-home would
        // otherwise draw a stroke across the room that never happened.
        if (residencyEvent === "rehomed") {
          clearInsectTrail(motion.trail);
        }
      }
      if (pilot.roam) {
        pilot.roam.transit = butterflyTransitHeading(motion, pilot.position, t);
        // Evasion is a roaming behaviour only. During a Landing Cycle the
        // pointer already has a louder answer — an Escape with a cause — and
        // two of them acting at once would make one insect look like it had
        // two opinions.
        let target = 0;
        if (pointerIsLive && pilot.phase === "roam") {
          motion.projected
            .set(pilot.position.x, pilot.position.y, pilot.position.z)
            .project(camera);
          if (motion.projected.z < 1) {
            const dx = (motion.projected.x - pointer.x) * size.width * 0.5;
            const dy = (motion.projected.y - pointer.y) * size.height * 0.5;
            const away = Math.hypot(dx, dy);
            target = butterflyEvasionStrength(away);
            if (target > 0) {
              // Directly away on screen when there is a direction to be away
              // in; straight back toward the camera when the cursor is exactly
              // on the insect, which is the one case with no lateral answer.
              const scale = away > 1 ? 1 / away : 0;
              evadeVector.current
                .copy(cameraRight.current)
                .multiplyScalar(dx * scale)
                .addScaledVector(cameraUp.current, dy * scale)
                // Column 2 of a camera's world matrix points BACK at the
                // viewer, so the depth term is subtracted: a startled resident
                // retreats into the room and lets the furniture cover it,
                // rather than coming at the screen.
                .addScaledVector(cameraBack.current, -BUTTERFLY_EVASION.depth)
                .normalize();
              motion.evade.x = evadeVector.current.x;
              motion.evade.y = evadeVector.current.y;
              motion.evade.z = evadeVector.current.z;
            }
          }
        }
        motion.evade.strength = THREE.MathUtils.damp(
          motion.evade.strength,
          target,
          BUTTERFLY_EVASION.lambda,
          delta,
        );
        pilot.roam.evade = motion.evade.strength > 1e-3 ? motion.evade : null;
      }

      const engagedPerch = getInsectPerch(pilot.reservedPerchId);
      world.setContext(engagedPerch?.unitIndex ?? motion.currentUnit, t);

      const automaticAttempt =
        !diagnostics?.pauseAutomaticLandings &&
        t >=
          butterflyNextAttemptAt(
            motion.nextAttemptAt,
            engagedByUnit[motion.currentUnit] ?? 0,
            t,
          ) &&
        motion.transitTo === null &&
        butterflyIsActiveNeighbor(motion.currentUnit, stacks.activeUnit);
      const forcedAttempt = forceRequested && i === forcedResident;
      if (pilot.phase === "roam" && (automaticAttempt || forcedAttempt)) {
        const occupancy = {
          engaged: engagedByUnit[motion.currentUnit] ?? 0,
          approaching: approachingByUnit[motion.currentUnit] ?? 0,
        };
        if (butterflyMayBeginLanding(occupancy)) {
          const candidates = [...getInsectPerches().values()].filter(
            (perch) =>
              // The resident's OWN shelf, never merely the active one.
              //
              // Residents are home-unit residents, but their Flight Volume is
              // their home Unit's while this filter let them land anywhere on
              // the active shelf — up to 4.4 m away. The moment such a landing
              // released back into roam, volume containment's last-resort
              // clamp projected the insect back inside its home extent, which
              // is a hard position write: the butterfly TELEPORTED across the
              // room. Landing at home is also what the standing constraint
              // already said the residents were.
              perch.unitIndex === motion.currentUnit &&
              !insectPerchOccupant(perch.id) &&
              insectPerchOwnerId(perch) !== stacks.hovered &&
              insectPerchOwnerId(perch) !== stacks.dragging,
          );
          if (candidates.length) {
            const first = Math.floor(
              landingNoise(i, motion.attempts * 19 + stacks.activeUnit) *
                candidates.length,
            );
            let started = false;
            let failureReason = "No eligible Perch on the active shelf.";
            // Drawn BEFORE any candidate is prepared, because the planner
            // compiles against the contact it is handed — a route built for the
            // centre of a Perch and then flown to a point three centimetres
            // away is a route the pilot spends the whole approach fighting.
            const attemptSpread = landingNoise(i, motion.attempts * 31 + 17);
            // The resident's OWN Unit, not the camera's. These are no longer
            // the same thing: a resident of unit 2 may be planning a landing
            // while the camera sits on unit 1, and planning against the wrong
            // Unit's collision index means planning against no index at all.
            world.setContext(motion.currentUnit, t);
            for (let offset = 0; offset < candidates.length; offset++) {
              const perch = candidates[(first + offset) % candidates.length]!;
              if (
                !prepareInsectLandingTarget(
                  perch.id,
                  "butterfly",
                  motion.landingTarget,
                  attemptSpread,
                )
              ) {
                if (forcedAttempt)
                  failureReason = butterflyPerchFailureMessage(
                    diagnoseInsectPerch(perch.id, "butterfly", t),
                  );
                continue;
              }
              if (
                !commandInsectPilot(
                  pilot,
                  {
                    type: "land",
                    target: motion.landingTarget,
                    // Every arrival was the same shape because the planner
                    // always took its first-choice winding, size and entry
                    // bearing. One number per attempt spreads them out.
                    variation: landingNoise(i, motion.attempts * 23 + 5),
                  },
                  world,
                )
              ) {
                // `perch-not-found` is the one code here that cannot be
                // explained by geometry: it means the id the pilot was handed
                // is not in the registry, one instruction after a candidate
                // scan pulled it OUT of that registry. Owner report: "I'm
                // getting Landing Plan rejected: perch-not-found after I moved
                // all the objects even though all perches are still green."
                // A bare code cannot distinguish "the registry emptied" from
                // "this one id went missing", and those have different causes,
                // so the message carries both.
                failureReason =
                  pilot.rejectionCode === "perch-not-found"
                    ? `Landing Plan rejected: ${perch.id} left the registry mid-attempt (${getInsectPerches().size} Perches registered, ${
                        getInsectPerch(perch.id)
                          ? "id is back"
                          : "id still absent"
                      }).`
                    : `Landing Plan rejected: ${pilot.rejectionCode}.`;
                continue;
              }
              motion.attempts++;
              motion.nearSince = -1;
              // A new arrival captures its own facing; the last one's must not
              // leak into it.
              motion.restHeading.set(0, 0, 0);
              motion.landingYaw =
                (landingNoise(i, motion.attempts * 29 + 13) - 0.5) *
                INSECT_LANDING_YAW;
              motion.landingSpread = attemptSpread;
              motion.perchMissSince = -1;
              engagedByUnit[motion.currentUnit]! += 1;
              approachingByUnit[motion.currentUnit]! += 1;
              started = true;
              if (forcedAttempt)
                insectDiagnosticsController.update({
                  forceResult: `Landing Plan engaged: ${perch.id}`,
                });
              break;
            }
            if (!started) {
              motion.nextAttemptAt = t + 2.5;
              if (forcedAttempt)
                insectDiagnosticsController.update({
                  forceResult: failureReason,
                });
            }
          } else {
            motion.nextAttemptAt = t + 2.5;
            if (forcedAttempt)
              insectDiagnosticsController.update({
                forceResult:
                  "No unoccupied eligible Perch on the active shelf.",
              });
          }
        } else if (forcedAttempt) {
          insectDiagnosticsController.update({
            forceResult: `Unit ${motion.currentUnit} holds ${occupancy.engaged}/${BUTTERFLY_OCCUPANCY.engaged} engaged and ${occupancy.approaching}/${BUTTERFLY_OCCUPANCY.approaching} approaching.`,
          });
        }
        if (forcedAttempt)
          handledForceRequest.current = diagnostics?.forceRequest ?? 0;
      }

      let perch = getInsectPerch(pilot.reservedPerchId);
      let direct = false;
      let environmentalDrag = false;
      let distancePx = Number.POSITIVE_INFINITY;
      if (perch) {
        const prepared = prepareInsectLandingTarget(
          perch.id,
          "butterfly",
          motion.landingTarget,
          motion.landingSpread,
        );
        if (prepared) {
          commandInsectPilot(
            pilot,
            { type: "update-perch", target: motion.landingTarget },
            world,
          );
          if (
            pilot.phase === "rest" &&
            !world.terminalPoseIsClear(motion.landingTarget)
          ) {
            motion.departure.set(
              pilot.normal.x,
              pilot.normal.y,
              pilot.normal.z,
            );
            commandInsectPilot(
              pilot,
              { type: "depart", away: motion.departure, cause: "drag" },
              world,
            );
          }
          const ownerId = insectPerchOwnerId(perch);
          direct =
            Boolean(ownerId) &&
            (ownerId === stacks.hovered || ownerId === stacks.dragging);
          environmentalDrag =
            Boolean(stacks.dragging) && perch.unitIndex === stacks.activeUnit;
          motion.projected
            .set(
              motion.landingTarget.point.x,
              motion.landingTarget.point.y,
              motion.landingTarget.point.z,
            )
            .project(camera);
          const dx = (motion.projected.x - pointer.x) * size.width * 0.5;
          const dy = (motion.projected.y - pointer.y) * size.height * 0.5;
          distancePx = Math.hypot(dx, dy);
        } else {
          // A Perch that cannot be prepared RIGHT NOW is not necessarily gone.
          //
          // Measured on `about:globe-crown`: the owner's bounds vanish on about
          // 11% of frames — the prop is registered twice and rebuilt behind
          // Suspense, so there are frames where nothing measurable is mounted.
          // Cancelling on the first failure meant an approach, which takes
          // several seconds, essentially never survived: a live watch found
          // butterfly:0 reserving the globe and reaching `approach` thirteen
          // times without ever reaching hover, touchdown or rest.
          //
          // So a miss has to persist before it counts. The insect keeps flying
          // the plan it already compiled in the meantime, which is correct —
          // the Perch has not moved, the scene graph is just mid-rebuild.
          if (motion.perchMissSince < 0) motion.perchMissSince = t;
          if (t - motion.perchMissSince >= BUTTERFLY_PERCH_MISS_GRACE) {
            commandInsectPilot(pilot, { type: "cancel" }, world);
            perch = null;
            motion.perchMissSince = -1;
          }
        }
        if (prepared) motion.perchMissSince = -1;
      }
      // A reservation must belong to the resident's own Unit. It used to be
      // checked against the ACTIVE Unit, which cancelled every landing on a
      // neighbouring shelf the moment it started — and with Residency
      // migrating, most landings are on a shelf the camera is not centred on.
      if (perch?.unitIndex !== motion.currentUnit && pilot.reservedPerchId) {
        commandInsectPilot(pilot, { type: "cancel" }, world);
        perch = null;
      }

      let proximity = false;
      if (pointerIsTouch.current) {
        motion.nearSince = -1;
      } else if (
        performance.now() > pointerActiveUntil.current ||
        distancePx >
          (pilot.phase === "approach"
            ? LANDING_TIMING.pointerCancelPx
            : LANDING_TIMING.pointerDepartPx)
      ) {
        motion.nearSince = -1;
      } else {
        if (motion.nearSince < 0) motion.nearSince = t;
        const confirmation =
          LANDING_TIMING.pointerConfirm[0] +
          (LANDING_TIMING.pointerConfirm[1] -
            LANDING_TIMING.pointerConfirm[0]) *
            landingNoise(i, motion.attempts * 13 + 5);
        if (
          pilot.phase === "approach" ||
          pilot.phase === "hover" ||
          pilot.phase === "touchdown" ||
          pilot.phase === "rest"
        )
          proximity = pointerDisturbanceIsConfirmed({
            pointerType: pointerIsTouch.current ? "touch" : "mouse",
            recentActivity: performance.now() <= pointerActiveUntil.current,
            phase: pilot.phase,
            distancePx,
            nearFor: t - motion.nearSince,
            confirmation,
          });
      }
      const disturbed =
        Boolean(perch) && (direct || environmentalDrag || proximity);
      if (disturbed) {
        if (proximity) {
          const elements = camera.matrixWorld.elements;
          const awayX = motion.projected.x - pointer.x;
          const awayY = motion.projected.y - pointer.y;
          motion.departure.set(
            elements[0] * awayX + elements[4] * awayY,
            elements[1] * awayX + elements[5] * awayY,
            elements[2] * awayX + elements[6] * awayY,
          );
          motion.departure.x += pilot.normal.x * 0.9;
          motion.departure.y += pilot.normal.y * 0.9;
          motion.departure.z += pilot.normal.z * 0.9;
        } else {
          motion.departure.set(pilot.normal.x, pilot.normal.y, pilot.normal.z);
        }
        commandInsectPilot(
          pilot,
          {
            type: "depart",
            away: motion.departure,
            cause: butterflyEscapeCause({
              grabbed: direct,
              dragging: environmentalDrag,
              proximity,
            }),
          },
          world,
        );
        motion.nearSince = -1;
      }

      if (pilot.phase === "rest" && t >= motion.restEndsAt) {
        motion.departure.set(
          pilot.normal.x + (landingNoise(i, motion.attempts + 31) - 0.5) * 0.5,
          pilot.normal.y,
          pilot.normal.z + 0.35,
        );
        commandInsectPilot(
          pilot,
          { type: "depart", away: motion.departure, cause: "calm" },
          world,
        );
      }

      world.setContext(
        getInsectPerch(pilot.reservedPerchId)?.unitIndex ?? motion.currentUnit,
        t,
      );
      const phaseBeforeAdvance = pilot.phase;
      advanceInsectPilot(pilot, delta, world);
      const flightSpeed = Math.hypot(
        pilot.velocity.x,
        pilot.velocity.y,
        pilot.velocity.z,
      );
      const stalled = updateButterflyStallState(motion, {
        phase: pilot.phase,
        speed: flightSpeed,
        time: t,
        dark: darkAmt.current > 0.5,
      });
      // ...and now something happens about it. The stall detector has existed
      // for a while and only ever reported to the dev HUD, so a resident that
      // found a balance point between containment and repulsion simply stayed
      // in it — owner review: "butterflies still sometimes freeze in midair
      // which I'd rather avoid." The nudge moves the wander target, which
      // moves the equilibrium, and the kick covers the time the controller
      // would otherwise spend easing back into the same corner.
      if (stalled && pilot.steering) {
        nudgeInsectSteering(pilot.steering, STALL_ESCAPE);
        pilot.velocity.x += STALL_ESCAPE.x * BUTTERFLY_STALL_ESCAPE_SPEED;
        pilot.velocity.y += STALL_ESCAPE.y * BUTTERFLY_STALL_ESCAPE_SPEED;
        pilot.velocity.z += STALL_ESCAPE.z * BUTTERFLY_STALL_ESCAPE_SPEED;
        motion.lowSpeedSince = -1;
        motion.lastMeaningfulMovement = t;
      }
      recordButterflyTrail(motion, pilot.position, t);
      if (
        process.env.NODE_ENV === "development" &&
        t - motion.telemetryPublishedAt >= 0.25
      ) {
        motion.telemetryPublishedAt = t;
        insectDiagnosticsController.publishFlightState({
          telemetry: {
            occupantId: occupant,
            time: t,
            species: "butterfly",
            unitIndex: motion.currentUnit,
            homeUnit: butterflyHomeUnit(i),
            residentIndex: i,
            phase: pilot.phase,
            position: {
              x: pilot.position.x,
              y: pilot.position.y,
              z: pilot.position.z,
            },
            transitTo: motion.transitTo,
            rehomedAt: motion.rehomedAt,
            perchId: pilot.reservedPerchId,
            rejectionCode: pilot.rejectionCode,
            event: pilot.event,
            contactGap: butterflyContactGap(pilot),
            region:
              pilot.phase === "roam"
                ? insectFlightVolumeRegion(
                    butterflyFlightVolume(motion),
                    pilot.position,
                  )
                : "none",
            // Last frame's rendered heading — this publication runs before the
            // orientation block below. One frame of lag is irrelevant to the
            // question it exists to answer, which is whether the facing
            // oscillates while settling.
            yaw: b.rotation.y,
            speed: flightSpeed,
            altitude: pilot.position.y - MEADOW_GROUND_BASE,
            clearance: pilot.steering?.clearance ?? Number.POSITIVE_INFINITY,
            containment: pilot.steering?.containment ?? 0,
            collisionRevision: insectCollisionIndexRevision(
              motion.currentUnit,
              t,
            ),
            lastMeaningfulMovement: motion.lastMeaningfulMovement,
            stalled,
          },
          trail: butterflyTrailPoints(motion),
        });
      }
      if (pilot.event === "landed") {
        motion.restEndsAt =
          t +
          LANDING_TIMING.butterflyRest[0] +
          (LANDING_TIMING.butterflyRest[1] - LANDING_TIMING.butterflyRest[0]) *
            landingNoise(i, motion.attempts * 11 + 3);
      } else if (pilot.event === "approach-blocked") {
        motion.nextAttemptAt = t + 2.5;
      } else if (phaseBeforeAdvance === "rejoin" && pilot.phase === "roam") {
        motion.nextAttemptAt =
          t +
          LANDING_TIMING.flight[0] +
          (LANDING_TIMING.flight[1] - LANDING_TIMING.flight[0]) *
            landingNoise(i, motion.attempts * 17 + 7);
        motion.restEndsAt = Number.POSITIVE_INFINITY;
      }
      // The drawn body sits closer to the surface than the collision datum
      // does. `contactLift` used to be both, so tuning the visible perched gap
      // moved the resting envelope and turned Perches red; they are separate
      // numbers now. The sink rides `wingFold`, so the body settles exactly as
      // the wings close rather than popping down when touchdown begins.
      const sink = BUTTERFLY_RENDER_SINK * pilot.wingFold;
      b.position.set(
        pilot.position.x - pilot.normal.x * sink,
        pilot.position.y - pilot.normal.y * sink,
        pilot.position.z - pilot.normal.z * sink,
      );
      wr.rotation.z = pilot.wingAngle;
      wl.rotation.z = -pilot.wingAngle;

      const velocityX = pilot.velocity.x;
      const velocityZ = pilot.velocity.z;
      const speed2 = Math.max(
        velocityX * velocityX + velocityZ * velocityZ,
        0.04,
      );
      const settling = pilot.phase === "touchdown" || pilot.phase === "rest";
      // CAPTURE runs from hover onward; the surface-aligned RENDER below still
      // only runs once the insect is settling. Touchdown is where it is already
      // slowing onto the contact, so a capture starting there can find nothing
      // above the hold speed and fall through to the authored tangent — the
      // house-style facing this block exists to get rid of. The hover arc is
      // unambiguously travel, so that is where the heading is taken.
      if (settling || pilot.phase === "hover") {
        // Face the way it is actually travelling, not the way the Perch was
        // authored.
        //
        // The forward axis here was `pilot.tangent` — a property of the SITE,
        // fixed when the Perch was written and unrelated to the direction the
        // insect is moving. So the body swung round to the Perch's tangent
        // while the Arrival Curve was still carrying it sideways along the last
        // of its spiral, and it slid in crabwise. Owner review: "still an issue
        // with landing where they're floating in a direction they're not
        // facing."
        //
        // Tracking the horizontal travel direction closes the gap at its
        // source. It also means a settled insect ends up facing whichever way
        // it came in, so the perched ones stop all pointing the same way — the
        // authored tangent was quietly a house style.
        motion.restForward.set(
          pilot.velocity.x,
          pilot.velocity.y,
          pilot.velocity.z,
        );
        const alongNormal =
          motion.restForward.x * pilot.normal.x +
          motion.restForward.y * pilot.normal.y +
          motion.restForward.z * pilot.normal.z;
        motion.restForward.set(
          motion.restForward.x - pilot.normal.x * alongNormal,
          motion.restForward.y - pilot.normal.y * alongNormal,
          motion.restForward.z - pilot.normal.z * alongNormal,
        );
        // Below this the travel direction is noise — the pilot is converging on
        // the contact, so what is left of its velocity is correction rather than
        // travel, and at rest it is pinned outright. Whatever was captured while
        // it was still flying is held, which is what makes the facing settle
        // instead of hunting back and forth as it stops.
        if (
          motion.restForward.lengthSq() >
          REST_HEADING_HOLD_SPEED * REST_HEADING_HOLD_SPEED
        ) {
          motion.restForward.normalize();
          // Turned off the arrival direction by this landing's own angle.
          // Arrival alone was not enough variety: residents approach a shelf
          // from broadly the same side, so a row of perched insects still came
          // out near-parallel. A yaw drawn per attempt decorrelates them
          // properly, and because it is a rotation ABOUT the contact normal it
          // cannot move the insect off the surface or tilt it out of the pose
          // the envelope was cleared for.
          motion.restForward.applyAxisAngle(
            motion.restAxis.set(pilot.normal.x, pilot.normal.y, pilot.normal.z),
            motion.landingYaw,
          );
          motion.restHeading.copy(motion.restForward);
        } else if (motion.restHeading.lengthSq() < 1e-6) {
          motion.restHeading.set(
            pilot.tangent.x,
            pilot.tangent.y,
            pilot.tangent.z,
          );
        }
      }

      // How much of the surface pose the body has taken on. Ramped across HOVER
      // rather than switched on at touchdown.
      //
      // The resting facing is the arrival direction turned by this landing's own
      // yaw, which is up to 59° — and rendering that only from touchdown meant
      // the whole pivot happened in the last half second, on the contact, which
      // is exactly where a turn is most conspicuous. It read as the insect
      // spinning as it landed. Spreading it over the hover arc is also what an
      // insect actually does: it lines up with the surface on the way in, then
      // sets down already pointing the right way.
      const alignment = settling
        ? 1
        : pilot.reservedPerchId && pilot.phase === "hover"
          ? // Sized to the hover arc, which is a few tenths of a second — a
            // window scaled for a longer phase simply never completes and the
            // pivot falls back onto the contact where it started.
            THREE.MathUtils.smoothstep(pilot.phaseAge, 0.04, 0.3)
          : 0;
      // Flight orientation. Still runs during hover — the surface pose is
      // blended ON TOP of it below, so the insect keeps flying while it lines
      // up rather than snapping to the Perch and gliding in rigid.
      if (!settling) {
        b.rotation.y +=
          wrapPi(Math.atan2(velocityX, velocityZ) - b.rotation.y) * ease;
        // Thorax pitch about the body's own lateral axis, which is why the
        // group's Euler order is YXZ: yaw first, then pitch, then bank. With
        // pitch at zero this is exactly the previous yaw-then-bank rotation.
        b.rotation.x = -pilot.bodyPitch;
        // Bank into the turn. Never write Euler roll after surface alignment:
        // doing so reconstructs and destroys the aligned quaternion.
        //
        // Faded out with airspeed. `speed2` carries a floor, so as the insect
        // slows into a hover this quotient is a small cross product over a
        // constant — the control corrections that dominate a near-stationary
        // pilot get amplified into visible roll, and the same convergence
        // oscillation that made the facing hunt shows up as a wobble instead.
        // Nothing banks without airspeed anyway; a hovering butterfly is level.
        const turn =
          (pilot.velocity.z * pilot.acceleration.x -
            pilot.velocity.x * pilot.acceleration.z) /
          speed2;
        const bankAuthority = THREE.MathUtils.clamp(
          (Math.hypot(velocityX, velocityZ) - REST_HEADING_HOLD_SPEED) /
            BANK_FADE_SPEED,
          0,
          1,
        );
        b.rotation.z = THREE.MathUtils.damp(
          b.rotation.z,
          THREE.MathUtils.clamp(
            -BANK_K * turn * bankAuthority,
            -BANK_MAX,
            BANK_MAX,
          ),
          ROLL_LAMBDA,
          delta,
        );
      }

      if (alignment > 0) {
        motion.right
          .set(
            pilot.normal.y * motion.restHeading.z -
              pilot.normal.z * motion.restHeading.y,
            pilot.normal.z * motion.restHeading.x -
              pilot.normal.x * motion.restHeading.z,
            pilot.normal.x * motion.restHeading.y -
              pilot.normal.y * motion.restHeading.x,
          )
          .normalize();
        motion.restMatrix.set(
          motion.right.x,
          pilot.normal.x,
          motion.restHeading.x,
          0,
          motion.right.y,
          pilot.normal.y,
          motion.restHeading.y,
          0,
          motion.right.z,
          pilot.normal.z,
          motion.restHeading.z,
          0,
          0,
          0,
          0,
          1,
        );
        motion.surfaceQuaternion.setFromRotationMatrix(motion.restMatrix);
        // The flare rides the aligned quaternion by composition. Writing an
        // Euler pitch here instead would reconstruct and destroy the alignment,
        // which is the same trap the bank comment above names.
        motion.flareQuaternion.setFromAxisAngle(PITCH_AXIS, -pilot.bodyPitch);
        motion.surfaceQuaternion.multiply(motion.flareQuaternion);
        // Settling ACCUMULATES a damped chase, because nothing rewrites the
        // orientation underneath it. Hover re-derives the flight orientation
        // every frame, so there the ramp is the blend weight itself — chaining a
        // per-frame chase on top of a value that resets would never get past a
        // tenth of the way across.
        b.quaternion.slerp(
          motion.surfaceQuaternion,
          settling ? 1 - Math.exp(-6 * delta) : alignment,
        );
      }

      // Scaled per body, never on the root: the root sits at the world
      // origin, so shrinking it there would fly every resident home before it
      // vanished instead of fading out where they are.
      b.scale.setScalar(day);

      // Rotational shutter samples, not a path trail. Sample the actual flap
      // oscillator at three moments behind the current wing pose. Unlike
      // linear angular-velocity extrapolation, this follows the cyclic stroke
      // instead of pinning ghosts against the angle limit. Absolute phase also
      // keeps 60/120 Hz output identical.
      const flapOffset =
        pilot.wingAngle - pilot.wingAmplitude * Math.sin(pilot.wingPhase);
      const wingAngularSpeed = Math.abs(
        TAU *
          pilot.wingFrequency *
          pilot.wingAmplitude *
          Math.cos(pilot.wingPhase),
      );
      if (wingBlurMesh) {
        const blurStrength =
          THREE.MathUtils.smoothstep(
            wingAngularSpeed,
            WING_BLUR_MIN_ANGULAR_SPEED,
            WING_BLUR_FULL_ANGULAR_SPEED,
          ) * day;
        b.updateMatrix();
        for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
          const direction = sideIndex === 0 ? 1 : -1;
          for (let sample = 0; sample < wingBlurSamples; sample++) {
            const instanceIndex =
              (i * 2 + sideIndex) * WING_BLUR_SAMPLES + sample;
            const age = (sample + 1) / wingBlurSamples;
            const historicalPhase =
              pilot.wingPhase -
              TAU * pilot.wingFrequency * WING_BLUR_EXPOSURE * age;
            const angle = THREE.MathUtils.clamp(
              direction *
                (flapOffset + pilot.wingAmplitude * Math.sin(historicalPhase)),
              -WING_BLUR_ANGLE_LIMIT,
              WING_BLUR_ANGLE_LIMIT,
            );
            wingBlurPivotMatrix.makeRotationZ(angle);
            wingBlurInstanceMatrix
              .copy(b.matrix)
              .multiply(wingBlurPivotMatrix)
              .multiply(wingBlurLocalMatrices[sideIndex]!);
            wingBlurMesh.setMatrixAt(instanceIndex, wingBlurInstanceMatrix);
            wingBlurOpacity.setX(
              instanceIndex,
              blurStrength * WING_BLUR_STRENGTH * WING_BLUR_OPACITY[sample]!,
            );
          }
        }
      }
    }
    if (wingBlurMesh) {
      wingBlurMesh.instanceMatrix.needsUpdate = true;
      wingBlurOpacity.needsUpdate = true;
    }
  });

  return (
    <group ref={root}>
      {Array.from({ length: BUTTERFLY_COUNT }, (_, i) => {
        return (
          <group
            key={`butterfly:${i}`}
            ref={(o) => {
              // Yaw, then pitch about the resulting lateral axis, then bank.
              // The default XYZ order would pitch about world X, which is only
              // correct while the insect happens to fly along z.
              if (o) o.rotation.order = "YXZ";
              bodies.current[i] = o;
            }}
          >
            {/* A readable insect silhouette at this scale: tapered abdomen,
              distinct head, and splayed antennae, merged into one shared
              mesh. It sits just above the wings and follows their yaw/bank. */}
            <mesh
              geometry={bodyGeometry}
              material={bodyMaterial}
              position={[0, 0.004, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              raycast={() => null}
            />
            {[1, -1].map((side) => (
              <group
                key={side}
                ref={(o) => {
                  wings.current[i * 2 + (side === 1 ? 0 : 1)] = o;
                }}
              >
                {/* Mirrored from one shared anatomical outline, hinged at the
                  thorax and laid flat so z rotation is a dihedral flap. */}
                <mesh
                  geometry={wingGeometry}
                  material={wingMaterials[i % wingMaterials.length]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={[side, 1, 1]}
                  raycast={() => null}
                />
              </group>
            ))}
          </group>
        );
      })}
      {wingBlurSamples > 0 && (
        <instancedMesh
          ref={wingBlur}
          args={[wingBlurGeometry, wingBlurMaterial, WING_BLUR_INSTANCE_COUNT]}
          frustumCulled={false}
          renderOrder={2}
          raycast={() => null}
        />
      )}
    </group>
  );
}

/** Reduced motion gets no butterflies at all. There is no still version of
 * this worth keeping — motionless insects hanging over the flowers are worse
 * than an empty field. The gate is read once at mount and lives in
 * a wrapper so the flight's own hooks stay unconditional. */
export default function Butterflies({
  dark,
  wingBlurSamples = 3,
  suspendOffscreen = false,
}: {
  dark: boolean;
  wingBlurSamples?: 0 | 1 | 3 | 5;
  suspendOffscreen?: boolean;
}) {
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  if (reduced) return null;
  return (
    <Flight
      dark={dark}
      wingBlurSamples={wingBlurSamples}
      suspendOffscreen={suspendOffscreen}
    />
  );
}
