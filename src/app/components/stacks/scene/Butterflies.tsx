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
import { BUTTERFLY_STEERING_PROFILE } from "./insectSteering";
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
const FLIGHTS = [
  { color: "#f2e8d2", flapHz: 9.3 },
  { color: "#8b9be0", flapHz: 8.2 },
  { color: "#e8a25e", flapHz: 10.1 },
] as const;
export const BUTTERFLIES_PER_UNIT = 3;
export const BUTTERFLY_COUNT = UNIT_COUNT * BUTTERFLIES_PER_UNIT;

// Three translucent wing poses across a fixed shutter interval read as
// rotational motion blur rather than a duplicate wing. All 126 samples are
// submitted in one InstancedMesh, so the entire population costs one draw call.
const WING_BLUR_SAMPLES = 3;
const WING_BLUR_INSTANCE_COUNT = BUTTERFLY_COUNT * 2 * WING_BLUR_SAMPLES;
/** Fixed middle ground chosen after comparing 50 ms / 3× against an
 * intentionally excessive 80 ms / 10× diagnostic treatment. */
const WING_BLUR_EXPOSURE = 0.06;
const WING_BLUR_STRENGTH = 5;
const WING_BLUR_MIN_ANGULAR_SPEED = 7;
const WING_BLUR_FULL_ANGULAR_SPEED = 52;
const WING_BLUR_OPACITY = [0.075, 0.045, 0.025] as const;
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
  return Math.floor(index / BUTTERFLIES_PER_UNIT);
}

/** Eligibility is judged on where a resident IS, not on where it started. */
export function butterflyIsActiveNeighbor(
  currentUnit: number,
  activeUnit: number,
) {
  return Math.abs(currentUnit - activeUnit) <= 1;
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
  demand: readonly number[];
  cameraX: number;
  rehomingMargin: number;
  step: number;
  time: number;
}): ButterflyResidencyEvent {
  const { motion, residents, demand } = options;
  if (!options.roaming) {
    // A resident with a Landing Plan in the air is committed to one shelf.
    motion.transitTo = null;
    return "none";
  }
  const from = motion.currentUnit;
  const destination = butterflyTransitDestination(residents, demand, from);
  motion.transitTo =
    destination === null || destination === from ? null : destination;

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
) {
  if (motion.transitTo === null) return null;
  return butterflyTransitDirection(
    position,
    motion.transitTo,
    TRANSIT_DIRECTION,
  )
    ? TRANSIT_DIRECTION
    : null;
}

/**
 * How many butterflies may be engaged with the active shelf at once.
 *
 * This was the real reason most Perches were never used: it returned one for
 * three of every four windows, capped across all twenty-one residents, while
 * thirty-one Perches waited. Occupancy is meant to rise from insects staying
 * (see `LANDING_TIMING.butterflyRest`) rather than from more traffic, and a
 * shelf that can hold three settled butterflies is what makes the long rest
 * visible instead of merely long.
 */
export function butterflyLandingPopulationLimit(
  _time: number,
  _forcedAttempt: boolean,
) {
  return 3;
}

export function butterflyPerchFailureMessage(
  diagnostic: Pick<
    ReturnType<typeof diagnoseInsectPerch>,
    "rejectionCode" | "rejectionReason"
  >,
) {
  return `Perch rejected: ${diagnostic.rejectionCode} — ${diagnostic.rejectionReason}`;
}

/** How many recent positions a resident keeps for the development trail
 * overlay. Thirty seconds at four samples a second, which is long enough for a
 * shared corridor or a convergence point to become obvious if one exists. */
const TRAIL_LENGTH = 120;
const TRAIL_INTERVAL = 0.25;

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
  restMatrix: THREE.Matrix4;
  surfaceQuaternion: THREE.Quaternion;
  flareQuaternion: THREE.Quaternion;
  seed: number;
  trail: THREE.Vector3[];
  trailWrite: number;
  trailFilled: boolean;
  trailSampledAt: number;
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
    restMatrix: new THREE.Matrix4(),
    surfaceQuaternion: new THREE.Quaternion(),
    flareQuaternion: new THREE.Quaternion(),
    seed,
    trail: Array.from({ length: TRAIL_LENGTH }, () => new THREE.Vector3()),
    trailWrite: 0,
    trailFilled: false,
    trailSampledAt: -1,
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
  if (time - motion.trailSampledAt < TRAIL_INTERVAL) return false;
  motion.trailSampledAt = time;
  motion.trail[motion.trailWrite]!.set(position.x, position.y, position.z);
  motion.trailWrite = (motion.trailWrite + 1) % TRAIL_LENGTH;
  if (motion.trailWrite === 0) motion.trailFilled = true;
  return true;
}

/** Oldest-first snapshot of the ring buffer, allocated only when the
 * development HUD actually asks for it. */
export function butterflyTrailPoints(motion: ButterflyMotion) {
  const count = motion.trailFilled ? TRAIL_LENGTH : motion.trailWrite;
  const points: { x: number; y: number; z: number }[] = [];
  for (let offset = 0; offset < count; offset++) {
    const index = motion.trailFilled
      ? (motion.trailWrite + offset) % TRAIL_LENGTH
      : offset;
    const point = motion.trail[index]!;
    points.push({ x: point.x, y: point.y, z: point.z });
  }
  return points;
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
  }),
);

function Flight({ dark }: { dark: boolean }) {
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
  const handledForceRequest = useRef(0);
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
      if (
        process.env.NODE_ENV === "development" &&
        insectDiagnosticsController.getSnapshot().flightStates.length > 0
      )
        insectDiagnosticsController.clearFlightTelemetry();
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
    const activeLandings = new Array<number>(UNIT_COUNT).fill(0);
    for (const motion of motions.current)
      if (motion.pilot?.reservedPerchId)
        activeLandings[motion.currentUnit]! += 1;
    for (let i = 0; i < BUTTERFLY_COUNT; i++) {
      const b = bodies.current[i];
      const wr = wings.current[i * 2];
      const wl = wings.current[i * 2 + 1];
      if (!b || !wr || !wl) continue;
      const motion = motions.current[i]!;
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
          },
        });
        motion.lastMeaningfulMovement = t;
        motion.nextAttemptAt = t + 8 + 12 * landingNoise(i, 1);
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
        demand,
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
          motion.trailFilled = false;
          motion.trailWrite = 0;
          motion.trailSampledAt = -1;
        }
      }
      if (pilot.roam)
        pilot.roam.transit = butterflyTransitHeading(motion, pilot.position);

      const engagedPerch = getInsectPerch(pilot.reservedPerchId);
      world.setContext(engagedPerch?.unitIndex ?? motion.currentUnit, t);

      const automaticAttempt =
        !diagnostics?.pauseAutomaticLandings &&
        t >= motion.nextAttemptAt &&
        motion.transitTo === null &&
        butterflyIsActiveNeighbor(motion.currentUnit, stacks.activeUnit);
      const forcedAttempt = forceRequested && i === forcedResident;
      if (pilot.phase === "roam" && (automaticAttempt || forcedAttempt)) {
        const landingLimit = butterflyLandingPopulationLimit(t, forcedAttempt);
        if ((activeLandings[motion.currentUnit] ?? 0) < landingLimit) {
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
            world.setContext(stacks.activeUnit, t);
            for (let offset = 0; offset < candidates.length; offset++) {
              const perch = candidates[(first + offset) % candidates.length]!;
              if (
                !prepareInsectLandingTarget(
                  perch.id,
                  "butterfly",
                  motion.landingTarget,
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
                failureReason = `Landing Plan rejected: ${pilot.rejectionCode}.`;
                continue;
              }
              motion.attempts++;
              motion.nearSince = -1;
              activeLandings[motion.currentUnit]! += 1;
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
            forceResult: `Landing population limit is ${landingLimit}.`,
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
        if (
          prepareInsectLandingTarget(
            perch.id,
            "butterfly",
            motion.landingTarget,
          )
        ) {
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
          commandInsectPilot(pilot, { type: "cancel" }, world);
          perch = null;
        }
      }
      if (perch?.unitIndex !== stacks.activeUnit && pilot.reservedPerchId) {
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
      recordButterflyTrail(motion, pilot.position, t);
      if (
        process.env.NODE_ENV === "development" &&
        t - motion.telemetryPublishedAt >= 0.25
      ) {
        motion.telemetryPublishedAt = t;
        insectDiagnosticsController.publishFlightState({
          telemetry: {
            occupantId: occupant,
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
            contactGap: butterflyContactGap(pilot),
            region:
              pilot.phase === "roam"
                ? insectFlightVolumeRegion(
                    butterflyFlightVolume(motion),
                    pilot.position,
                  )
                : "none",
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
      b.position.set(pilot.position.x, pilot.position.y, pilot.position.z);
      wr.rotation.z = pilot.wingAngle;
      wl.rotation.z = -pilot.wingAngle;

      const velocityX = pilot.velocity.x;
      const velocityZ = pilot.velocity.z;
      const speed2 = Math.max(
        velocityX * velocityX + velocityZ * velocityZ,
        0.04,
      );
      if (pilot.phase === "touchdown" || pilot.phase === "rest") {
        motion.right
          .set(
            pilot.normal.y * pilot.tangent.z - pilot.normal.z * pilot.tangent.y,
            pilot.normal.z * pilot.tangent.x - pilot.normal.x * pilot.tangent.z,
            pilot.normal.x * pilot.tangent.y - pilot.normal.y * pilot.tangent.x,
          )
          .normalize();
        motion.restMatrix.set(
          motion.right.x,
          pilot.normal.x,
          pilot.tangent.x,
          0,
          motion.right.y,
          pilot.normal.y,
          pilot.tangent.y,
          0,
          motion.right.z,
          pilot.normal.z,
          pilot.tangent.z,
          0,
          0,
          0,
          0,
          1,
        );
        motion.surfaceQuaternion.setFromRotationMatrix(motion.restMatrix);
        // The flare rides the aligned quaternion by composition. Writing an
        // Euler pitch here instead would reconstruct and destroy the alignment,
        // which is the same trap the bank comment below names.
        motion.flareQuaternion.setFromAxisAngle(PITCH_AXIS, -pilot.bodyPitch);
        motion.surfaceQuaternion.multiply(motion.flareQuaternion);
        b.quaternion.slerp(motion.surfaceQuaternion, 1 - Math.exp(-6 * delta));
      } else {
        b.rotation.y +=
          wrapPi(Math.atan2(velocityX, velocityZ) - b.rotation.y) * ease;
        // Thorax pitch about the body's own lateral axis, which is why the
        // group's Euler order is YXZ: yaw first, then pitch, then bank. With
        // pitch at zero this is exactly the previous yaw-then-bank rotation.
        b.rotation.x = -pilot.bodyPitch;
        // Bank into the turn. Never write Euler roll after surface alignment:
        // doing so reconstructs and destroys the aligned quaternion.
        const turn =
          (pilot.velocity.z * pilot.acceleration.x -
            pilot.velocity.x * pilot.acceleration.z) /
          speed2;
        b.rotation.z = THREE.MathUtils.damp(
          b.rotation.z,
          THREE.MathUtils.clamp(-BANK_K * turn, -BANK_MAX, BANK_MAX),
          ROLL_LAMBDA,
          delta,
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
          for (let sample = 0; sample < WING_BLUR_SAMPLES; sample++) {
            const instanceIndex =
              (i * 2 + sideIndex) * WING_BLUR_SAMPLES + sample;
            const age = (sample + 1) / WING_BLUR_SAMPLES;
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
      <instancedMesh
        ref={wingBlur}
        args={[wingBlurGeometry, wingBlurMaterial, WING_BLUR_INSTANCE_COUNT]}
        frustumCulled={false}
        renderOrder={2}
        raycast={() => null}
      />
    </group>
  );
}

/** Reduced motion gets no butterflies at all. There is no still version of
 * this worth keeping — motionless insects hanging over the flowers are worse
 * than an empty field. The gate is read once at mount and lives in
 * a wrapper so the flight's own hooks stay unconditional. */
export default function Butterflies({ dark }: { dark: boolean }) {
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  if (reduced) return null;
  return <Flight dark={dark} />;
}
