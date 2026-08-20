"use client";

// Quiet flying life for the Tended Meadow. Moths bind to every registered
// practical; the bat is a camera-relative global sky event. Perch resolution
// and collision snapshots are occasional planning work; the frame loop keeps
// using the shared allocation-free pilot.
import { useStacks } from "../store";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { INSECT_ENVELOPES } from "./insectCollision";
import type { InsectContainment } from "./insectContainment";
import {
  ThreeInsectFlightWorld,
  prepareInsectLandingTarget,
} from "./insectFlightWorld";
import { insectOwnerIsDisturbed } from "./insectDisturbance";
import {
  type InsectLampCone,
  type LampConeLocal,
  createInsectLampCone,
  createInsectLampConeContainment,
  createLampConeLocal,
  lampConeAxialMin,
  lampConeLocal,
  lampConeOuterRadius,
  lampConeRadius,
} from "./insectLampCone";
import {
  INSECT_LANDING_YAW,
  LANDING_TIMING,
  landingNoise,
  pointerDisturbanceIsConfirmed,
} from "./insectLanding";
import {
  type InsectLampConeOutline,
  insectDiagnosticsController,
} from "./insectPerchDiagnostic";
import {
  getInsectPerch,
  getInsectPerches,
  getLampInsectPerch,
  insectPerchAcceptsMoth,
  insectPerchMothLightIsOn,
  insectPerchOccupant,
  insectPerchOwnerId,
} from "./insectPerches";
import {
  type InsectKinematicSample,
  type InsectLandingTarget,
  type InsectPilot,
  MOTH_PILOT_PROFILE,
  advanceInsectPilot,
  commandInsectPilot,
  createInsectPilot,
} from "./insectPilot";
import { MOTH_STEERING_PROFILE } from "./insectSteering";
import {
  type InsectTrail,
  clearInsectTrail,
  createInsectTrail,
  insectTrailPoints,
  recordInsectTrail,
} from "./insectTrail";
import { MEADOW_GROUND_BASE } from "./meadowField";
import { type MeadowLamp, getMeadowLamps } from "./meadowLights";
import {
  type BatFrame,
  MOTH_COUNT,
  type MothFrame,
  batFlightFrame,
  createMothFrame,
  mothFrame,
  mothIllumination,
} from "./wildlifeBehavior";

const THEME_LAMBDA = 3.5;
const MOTH_YAW_LAMBDA = 4;
const MOTH_ROLL_LAMBDA = 5;
const MOTH_BANK_K = 0.55;
const MOTH_BANK_MAX = 0.45;
const INVISIBLE_OPACITY = 0.012;
export const WILDLIFE_PRESENTATION = {
  moth: {
    wingColor: "#342f2a",
    bodyColor: "#171513",
    // Opacity carries presence; luminance carries not-glowing. The two were
    // doing each other's jobs: a moth thin enough not to read as a warm
    // mini-light was also thin enough to disappear, and the compensation went
    // into a lit colour bright enough to look emissive. Raising opacity and
    // pulling the lit end down separates them (ADR 0007).
    wingOpacity: 0.62,
    bodyOpacity: 0.8,
    litWingColor: "#6a5f4f",
    litBodyColor: "#443c32",
  },
  bat: {
    scale: 0.36,
    baseY: 2.55,
    baseZ: -8.4,
    depthArc: 0.7,
  },
} as const;
const MOTH_MODEL_SCALE = 0.9;
/** Seconds a Lamp Perch may fail to prepare before an in-flight moth landing is
 * abandoned. See `BUTTERFLY_PERCH_MISS_GRACE`. */
const MOTH_PERCH_MISS_GRACE = 0.4;
/** Tangential speed below which a landing moth holds its captured facing rather
 * than re-deriving it from a velocity that is now mostly control correction.
 * Scaled to the moth's slower 0.19 m/s touchdown. See
 * `REST_HEADING_HOLD_SPEED` in `Butterflies.tsx`. */
const MOTH_REST_HEADING_HOLD_SPEED = 0.07;
/**
 * Pointer evasion for moths — deliberately sharper than the butterflies'
 * (radius 210 px, lambda 3.5, depth 0.35).
 *
 * A wider radius and a faster time constant is what "more aggressively" means
 * here: the moth reacts sooner and snaps rather than leans. It is safe to be
 * this brisk precisely because a moth is contained by its Lamp Cone — the
 * cursor can startle it off its station but cannot chase it out of the light.
 */
const MOTH_EVASION = {
  radiusPx: 260,
  lambda: 6,
  depth: 0.3,
} as const;

/** 0..1 from a screen-space distance. Quadratic, like the butterflies': almost
 * all of the response lives in the innermost third. */
export function mothEvasionStrength(distancePx: number) {
  if (!(distancePx < MOTH_EVASION.radiusPx)) return 0;
  const near = 1 - Math.max(0, distancePx) / MOTH_EVASION.radiusPx;
  return near * near;
}
/** Metres the renderer drops the body below the collision datum once its wings
 * are shut. See `InsectEnvelope.renderLift`. */
const MOTH_RENDER_SINK =
  INSECT_ENVELOPES.moth.contactLift - INSECT_ENVELOPES.moth.renderLift;
const TAU = Math.PI * 2;
const wrapPi = (angle: number) =>
  THREE.MathUtils.euclideanModulo(angle + Math.PI, TAU) - Math.PI;

const NO_RAYCAST = () => null;

export type MothConeBasis = {
  dirX: number;
  dirY: number;
  dirZ: number;
  basisAX: number;
  basisAZ: number;
  basisBX: number;
  basisBY: number;
  basisBZ: number;
  openAirXStrength: number;
};

export function createMothConeBasis(): MothConeBasis {
  return {
    dirX: 0,
    dirY: -1,
    dirZ: 0,
    basisAX: 1,
    basisAZ: 0,
    basisBX: 0,
    basisBY: 0,
    basisBZ: 1,
    openAirXStrength: 0,
  };
}

/** Mutate a reusable cone basis whose useful radial axes point toward world
 * +Z (the camera side of the current fixtures). Desk lights whose local X
 * materially contributes to world Z use a one-sided analytic X path; the
 * vertical floor light and nearly world-X Blog axis keep their full breadth.
 * The axial direction is intentionally not a general collider: registered
 * desk lamps must continue to aim camera-side/downward as they do today. */
export function mothConeBasis(
  directionX: number,
  directionY: number,
  directionZ: number,
  out: MothConeBasis,
): MothConeBasis {
  const length = Math.max(
    0.0001,
    Math.hypot(directionX, directionY, directionZ),
  );
  const dirX = directionX / length;
  const dirY = directionY / length;
  const dirZ = directionZ / length;
  const horizontal = Math.hypot(dirX, dirZ);
  let basisAX = horizontal > 0.0001 ? -dirZ / horizontal : 1;
  let basisAZ = horizontal > 0.0001 ? dirX / horizontal : 0;
  if (basisAZ < 0) {
    basisAX = -basisAX;
    basisAZ = -basisAZ;
  }
  let basisBX = dirY * basisAZ;
  let basisBY = dirZ * basisAX - dirX * basisAZ;
  let basisBZ = -dirY * basisAX;
  if (basisBZ < 0) {
    basisBX = -basisBX;
    basisBY = -basisBY;
    basisBZ = -basisBZ;
  }
  out.dirX = dirX;
  out.dirY = dirY;
  out.dirZ = dirZ;
  out.basisAX = basisAX;
  out.basisAZ = basisAZ;
  out.basisBX = basisBX;
  out.basisBY = basisBY;
  out.basisBZ = basisBZ;
  out.openAirXStrength = basisAZ >= 0.25 ? 1 : 0;
  return out;
}

type MothCruiseContext = {
  lampId: string | null;
  behaviorId: number;
  lampAmount: number;
  sourceX: number;
  sourceY: number;
  sourceZ: number;
  nearDistance: number;
  farDistance: number;
  maxRadius: number;
  basis: MothConeBasis;
  samplerFrame: MothFrame;
};

type MothPilotMotion = {
  index: number;
  occupantId: string;
  world: ThreeInsectFlightWorld;
  pilot: InsectPilot | null;
  context: MothCruiseContext;
  /** The shape this moth belongs to. Mutable and rewritten from the live
   * fixture each frame, because a desk lamp is a prop that can be picked up. */
  cone: InsectLampCone;
  containment: InsectContainment;
  coneLocal: LampConeLocal;
  target: InsectLandingTarget;
  initial: InsectKinematicSample;
  presentation: MothFrame;
  projected: THREE.Vector3;
  departure: THREE.Vector3;
  /** The facing this moth holds once it is down, captured from its own
   * arrival. See the butterfly note in `Butterflies.tsx`: aligning to the
   * Perch's authored tangent makes an insect slide in crabwise. */
  restHeading: THREE.Vector3;
  /** Recent flown path for the dev flight overlay. Moths published an empty
   * array here, so the HUD — which skips anything under two points — drew a
   * route for every butterfly and none for any moth. */
  trail: InsectTrail;
  /** This landing's resting yaw about the contact normal, in radians. */
  landingYaw: number;
  /** This landing's displacement across the Perch surface, 0..1. */
  landingSpread: number;
  /** When the Perch first failed to prepare, or −1. */
  perchMissSince: number;
  /** Damped pointer lean, held per moth so it survives the frames the cursor
   * is not moving. */
  evade: { x: number; y: number; z: number; strength: number };
  nextAttemptAt: number;
  restEndsAt: number;
  attempts: number;
  nearSince: number;
  telemetryPublishedAt: number;
};

/** Signed distance above the plane it is standing on, or null when it is not
 * standing on one. See `butterflyContactGap`. */
function mothContactGap(pilot: InsectPilot) {
  if (pilot.phase !== "touchdown" && pilot.phase !== "rest") return null;
  return (
    (pilot.position.x - pilot.contact.x) * pilot.normal.x +
    (pilot.position.y - pilot.contact.y) * pilot.normal.y +
    (pilot.position.z - pilot.contact.z) * pilot.normal.z
  );
}

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

function copyMothBasis(out: MothConeBasis, value: MothConeBasis) {
  out.dirX = value.dirX;
  out.dirY = value.dirY;
  out.dirZ = value.dirZ;
  out.basisAX = value.basisAX;
  out.basisAZ = value.basisAZ;
  out.basisBX = value.basisBX;
  out.basisBY = value.basisBY;
  out.basisBZ = value.basisBZ;
  out.openAirXStrength = value.openAirXStrength;
}

/** Point the Lamp Cone at where the fixture actually is this frame. */
function updateMothLampCone(
  cone: InsectLampCone,
  lamp: MeadowLamp,
  basis: MothConeBasis,
) {
  cone.sourceX = lamp.sourceX;
  cone.sourceY = lamp.sourceY;
  cone.sourceZ = lamp.sourceZ;
  cone.dirX = basis.dirX;
  cone.dirY = basis.dirY;
  cone.dirZ = basis.dirZ;
  cone.forwardX = basis.basisBX;
  cone.forwardY = basis.basisBY;
  cone.forwardZ = basis.basisBZ;
  cone.nearDistance = lamp.mothNearDistance;
  cone.farDistance = lamp.mothFarDistance;
  cone.maxRadius = lamp.mothMaxRadius;
}

function updateMothCruiseContext(
  context: MothCruiseContext,
  lampId: string,
  behaviorId: number,
  lampAmount: number,
  lamp: MeadowLamp,
  basis: MothConeBasis,
) {
  context.lampId = lampId;
  context.behaviorId = behaviorId;
  context.lampAmount = lampAmount;
  context.sourceX = lamp.sourceX;
  context.sourceY = lamp.sourceY;
  context.sourceZ = lamp.sourceZ;
  context.nearDistance = lamp.mothNearDistance;
  context.farDistance = lamp.mothFarDistance;
  context.maxRadius = lamp.mothMaxRadius;
  copyMothBasis(context.basis, basis);
}

function transformMothKinematics(
  context: MothCruiseContext,
  frame: MothFrame,
  out: InsectKinematicSample,
) {
  const basis = context.basis;
  const along = -frame.y;
  out.position.x =
    context.sourceX +
    basis.dirX * along +
    basis.basisAX * frame.x +
    basis.basisBX * frame.z;
  out.position.y =
    context.sourceY + basis.dirY * along + basis.basisBY * frame.z;
  out.position.z =
    context.sourceZ +
    basis.dirZ * along +
    basis.basisAZ * frame.x +
    basis.basisBZ * frame.z;

  const alongVelocity = -frame.velocityY;
  out.velocity.x =
    basis.dirX * alongVelocity +
    basis.basisAX * frame.velocityX +
    basis.basisBX * frame.velocityZ;
  out.velocity.y = basis.dirY * alongVelocity + basis.basisBY * frame.velocityZ;
  out.velocity.z =
    basis.dirZ * alongVelocity +
    basis.basisAZ * frame.velocityX +
    basis.basisBZ * frame.velocityZ;

  const alongAcceleration = -frame.accelerationY;
  out.acceleration.x =
    basis.dirX * alongAcceleration +
    basis.basisAX * frame.accelerationX +
    basis.basisBX * frame.accelerationZ;
  out.acceleration.y =
    basis.dirY * alongAcceleration + basis.basisBY * frame.accelerationZ;
  out.acceleration.z =
    basis.dirZ * alongAcceleration +
    basis.basisAZ * frame.accelerationX +
    basis.basisBZ * frame.accelerationZ;
}

function sampleMothCruise(
  context: MothCruiseContext,
  time: number,
  out: InsectKinematicSample,
) {
  mothFrame(
    context.behaviorId,
    time,
    context.lampAmount,
    context.nearDistance,
    context.farDistance,
    context.maxRadius,
    context.samplerFrame,
    context.basis.openAirXStrength,
  );
  transformMothKinematics(context, context.samplerFrame, out);
}

function createMothPilotMotion(index: number): MothPilotMotion {
  const context: MothCruiseContext = {
    lampId: null,
    behaviorId: index,
    lampAmount: 0,
    sourceX: 0,
    sourceY: 0,
    sourceZ: 0,
    nearDistance: 0.18,
    farDistance: 0.74,
    maxRadius: 0.72,
    basis: createMothConeBasis(),
    samplerFrame: createMothFrame(),
  };
  const occupantId = `moth:${index}`;
  const cone = createInsectLampCone();
  return {
    index,
    occupantId,
    cone,
    containment: createInsectLampConeContainment(cone),
    coneLocal: createLampConeLocal(),
    world: new ThreeInsectFlightWorld(
      occupantId,
      "moth",
      (_flightId, time, out) => sampleMothCruise(context, time, out),
    ),
    pilot: null,
    context,
    target: createLandingTarget(),
    initial: createKinematicSample(),
    presentation: createMothFrame(),
    projected: new THREE.Vector3(),
    departure: new THREE.Vector3(),
    restHeading: new THREE.Vector3(),
    trail: createInsectTrail(),
    landingYaw: 0,
    landingSpread: 0,
    perchMissSince: -1,
    evade: { x: 0, y: 0, z: 0, strength: 0 },
    nextAttemptAt: 8 + 12 * landingNoise(index, 1),
    restEndsAt: Number.POSITIVE_INFINITY,
    attempts: 0,
    nearSince: -1,
    telemetryPublishedAt: -1,
  };
}

function resetMothPilot(motion: MothPilotMotion, now: number) {
  motion.world.dispose();
  motion.pilot = null;
  motion.restEndsAt = Number.POSITIVE_INFINITY;
  motion.nearSince = -1;
  motion.nextAttemptAt =
    now +
    LANDING_TIMING.retryBackoff[0] +
    (LANDING_TIMING.retryBackoff[1] - LANDING_TIMING.retryBackoff[0]) *
      landingNoise(motion.index, motion.attempts * 23 + 9);
}

function scheduleMothFlight(motion: MothPilotMotion, now: number) {
  motion.nextAttemptAt =
    now +
    LANDING_TIMING.flight[0] +
    (LANDING_TIMING.flight[1] - LANDING_TIMING.flight[0]) *
      landingNoise(motion.index, motion.attempts * 17 + 7);
}

function mothWingGeometry() {
  const wing = new THREE.Shape();
  // The butterflies' forewing/hindwing language, compressed and rounder for
  // a moth. The hinge is at the origin so each instance can flap separately.
  wing.moveTo(0.002, -0.01);
  wing.bezierCurveTo(0.02, -0.027, 0.052, -0.025, 0.066, -0.009);
  wing.bezierCurveTo(0.071, 0.008, 0.055, 0.024, 0.038, 0.022);
  wing.bezierCurveTo(0.05, 0.037, 0.035, 0.051, 0.019, 0.041);
  wing.bezierCurveTo(0.008, 0.033, 0.003, 0.015, 0.002, 0.006);
  wing.closePath();
  return new THREE.ShapeGeometry(wing, 5);
}

function mothBodyGeometry() {
  const body = new THREE.Shape();
  body.moveTo(-0.006, -0.018);
  body.bezierCurveTo(-0.008, 0.002, -0.005, 0.034, 0, 0.043);
  body.bezierCurveTo(0.005, 0.034, 0.008, 0.002, 0.006, -0.018);
  body.closePath();
  const head = new THREE.Shape();
  head.absarc(0, -0.024, 0.007, 0, Math.PI * 2, false);
  return new THREE.ShapeGeometry([body, head], 4);
}

function batBodyGeometry() {
  const body = new THREE.Shape();
  body.moveTo(-0.035, -0.13);
  body.quadraticCurveTo(-0.07, 0.02, -0.025, 0.14);
  body.lineTo(-0.055, 0.2);
  body.lineTo(-0.008, 0.17);
  body.lineTo(0, 0.21);
  body.lineTo(0.008, 0.17);
  body.lineTo(0.055, 0.2);
  body.lineTo(0.025, 0.14);
  body.quadraticCurveTo(0.07, 0.02, 0.035, -0.13);
  body.closePath();
  return new THREE.ShapeGeometry(body, 4);
}

function batWingGeometry() {
  const wing = new THREE.Shape();
  wing.moveTo(0, 0.11);
  wing.lineTo(0.19, 0.18);
  wing.lineTo(0.42, 0.08);
  wing.quadraticCurveTo(0.33, 0.01, 0.31, -0.08);
  wing.quadraticCurveTo(0.22, -0.01, 0.18, -0.1);
  wing.quadraticCurveTo(0.1, -0.01, 0.02, -0.07);
  wing.closePath();
  return new THREE.ShapeGeometry(wing, 3);
}

export function createWildlifeGeometrySet() {
  const geometries = {
    mothBody: mothBodyGeometry(),
    mothWing: mothWingGeometry(),
    batBody: batBodyGeometry(),
    batWing: batWingGeometry(),
  };
  Object.values(geometries).forEach((geometry) =>
    geometry.computeBoundingSphere(),
  );
  return geometries;
}

function zeroInstances(
  mesh: THREE.InstancedMesh | null,
  dummy: THREE.Object3D,
) {
  if (!mesh) return;
  dummy.scale.setScalar(0);
  dummy.updateMatrix();
  for (let i = 0; i < MOTH_COUNT; i++) mesh.setMatrixAt(i, dummy.matrix);
  mesh.instanceMatrix.needsUpdate = true;
}

function LivingWildlife({
  dark,
  suspendOffscreen,
}: {
  dark: boolean;
  suspendOffscreen: boolean;
}) {
  const mothBodies = useRef<THREE.InstancedMesh>(null);
  const mothLeftWings = useRef<THREE.InstancedMesh>(null);
  const mothRightWings = useRef<THREE.InstancedMesh>(null);
  const bat = useRef<THREE.Group>(null);
  const batWings = useRef<(THREE.Group | null)[]>([]);
  const darkAmount = useRef(dark ? 1 : 0);
  const settledAt = useRef<number | null>(null);
  const mothYaws = useRef(new Float32Array(MOTH_COUNT));
  const mothRolls = useRef(new Float32Array(MOTH_COUNT));
  const mothPilots = useRef<MothPilotMotion[]>([]);
  if (mothPilots.current.length === 0) {
    mothPilots.current = Array.from({ length: MOTH_COUNT }, (_, index) =>
      createMothPilotMotion(index),
    );
  }
  const pointerIsTouch = useRef(true);
  const pointerActiveUntil = useRef(0);
  const batFrame = useRef<BatFrame>({
    opacity: 0,
    progress: 0,
    flap: 0,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
  }).current;
  const mothBasis = useRef<MothConeBasis>(createMothConeBasis()).current;
  // Review overlay only: one scratch cone and a reusable array, so publishing
  // the drawn Lamp Cones allocates nothing per frame.
  const outlineCone = useRef<InsectLampCone>(createInsectLampCone()).current;
  const lampConeOutlines = useRef<InsectLampConeOutline[]>([]).current;
  const lampConePublishedAt = useRef(-1);
  const mothDummy = useMemo(() => new THREE.Object3D(), []);
  const mothParentQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const mothRestQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const mothRestMatrix = useMemo(() => new THREE.Matrix4(), []);
  const mothCameraRight = useMemo(() => new THREE.Vector3(), []);
  const mothCameraUp = useMemo(() => new THREE.Vector3(), []);
  const mothCameraBack = useMemo(() => new THREE.Vector3(), []);
  const mothEvadeVector = useMemo(() => new THREE.Vector3(), []);
  const mothRestX = useMemo(() => new THREE.Vector3(), []);
  const mothRestY = useMemo(() => new THREE.Vector3(), []);
  const mothRestZ = useMemo(() => new THREE.Vector3(), []);
  const mothHingeQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const mothFlatQuaternion = useMemo(
    () =>
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
    [],
  );
  const mothEuler = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);
  const mothUpAxis = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const mothFlareQuaternion = useMemo(() => new THREE.Quaternion(), []);
  /** The moth's own lateral axis in its rest basis (right, normal, tangent). */
  const mothPitchAxis = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const mothWingColor = useMemo(
    () => new THREE.Color(WILDLIFE_PRESENTATION.moth.wingColor),
    [],
  );
  const mothLitWingColor = useMemo(
    () => new THREE.Color(WILDLIFE_PRESENTATION.moth.litWingColor),
    [],
  );
  const mothBodyColor = useMemo(
    () => new THREE.Color(WILDLIFE_PRESENTATION.moth.bodyColor),
    [],
  );
  const mothLitBodyColor = useMemo(
    () => new THREE.Color(WILDLIFE_PRESENTATION.moth.litBodyColor),
    [],
  );
  const mothColor = useMemo(() => new THREE.Color(), []);
  const geometries = useMemo(createWildlifeGeometrySet, []);
  const mothMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [],
  );
  const mothBodyMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [],
  );
  const batMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#171a25",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [],
  );

  useEffect(
    () => () => {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      mothMaterial.dispose();
      mothBodyMaterial.dispose();
      batMaterial.dispose();
    },
    [batMaterial, geometries, mothBodyMaterial, mothMaterial],
  );

  useEffect(() => {
    zeroInstances(mothBodies.current, mothDummy);
    zeroInstances(mothLeftWings.current, mothDummy);
    zeroInstances(mothRightWings.current, mothDummy);
  }, [mothDummy]);

  useEffect(() => {
    const motions = mothPilots.current;
    const rememberPointer = (event: PointerEvent) => {
      pointerIsTouch.current = event.pointerType === "touch";
      pointerActiveUntil.current = performance.now() + 750;
    };
    window.addEventListener("pointermove", rememberPointer, { passive: true });
    window.addEventListener("pointerdown", rememberPointer, { passive: true });
    return () => {
      window.removeEventListener("pointermove", rememberPointer);
      window.removeEventListener("pointerdown", rememberPointer);
      for (const motion of motions) motion.world.dispose();
    };
  }, []);

  useFrame(({ clock, camera, pointer, size }, delta) => {
    const clockTime = clock.elapsedTime;
    if (
      settledAt.current === null &&
      document.documentElement.dataset.world === "ready"
    ) {
      settledAt.current = clockTime;
    }
    const t = Math.max(0, clockTime - (settledAt.current ?? clockTime));
    darkAmount.current = THREE.MathUtils.damp(
      darkAmount.current,
      dark ? 1 : 0,
      THEME_LAMBDA,
      delta,
    );
    if (darkAmount.current <= INVISIBLE_OPACITY) {
      for (const motion of mothPilots.current) {
        if (!motion.pilot) continue;
        resetMothPilot(motion, t);
        // A reset moth stops publishing, and the overlay draws whatever was
        // published last — so in daylight the room kept a set of moth trails
        // that no moth was flying. Owner review: "stays persistent in light
        // mode which is wrong." The trail goes with the pilot that flew it.
        clearInsectTrail(motion.trail);
      }
      if (
        process.env.NODE_ENV === "development" &&
        insectDiagnosticsController.hasFlightTelemetry("moth")
      )
        insectDiagnosticsController.clearFlightTelemetry("moth");
    }
    const bodyMesh = mothBodies.current;
    const leftMesh = mothLeftWings.current;
    const rightMesh = mothRightWings.current;
    mothMaterial.opacity =
      darkAmount.current * WILDLIFE_PRESENTATION.moth.wingOpacity;
    mothBodyMaterial.opacity =
      darkAmount.current * WILDLIFE_PRESENTATION.moth.bodyOpacity;
    const stacks = useStacks.getState();
    const automaticLandingsPaused =
      process.env.NODE_ENV === "development" &&
      insectDiagnosticsController.getSnapshot().pauseAutomaticLandings;
    let mothIndex = 0;
    let lampIndex = 0;
    if (bodyMesh && leftMesh && rightMesh) {
      const mothsVisible = darkAmount.current > INVISIBLE_OPACITY;
      bodyMesh.visible = mothsVisible;
      leftMesh.visible = mothsVisible;
      rightMesh.visible = mothsVisible;
      // Screen-space right/up/back, resolved once per frame rather than per
      // moth: "near the cursor" is a pixel question, so the lean away from it
      // has to be built in the space the cursor lives in.
      const mothPointerIsLive =
        !pointerIsTouch.current &&
        performance.now() <= pointerActiveUntil.current;
      if (mothPointerIsLive) {
        mothCameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
        mothCameraUp.setFromMatrixColumn(camera.matrixWorld, 1);
        mothCameraBack.setFromMatrixColumn(camera.matrixWorld, 2);
      }
      // Republished at the diagnostics cadence, not per frame. The overlay
      // draws exactly the cones the moths are steered by; see
      // `InsectLampConeOutline`.
      const publishCones =
        process.env.NODE_ENV === "development" &&
        t - lampConePublishedAt.current >= 0.25;
      if (publishCones) {
        lampConePublishedAt.current = t;
        lampConeOutlines.length = 0;
      }
      if (mothsVisible) {
        for (const [lampId, lamp] of getMeadowLamps()) {
          const coneDX = lamp.coneTargetX - lamp.sourceX;
          const coneDY = lamp.coneTargetY - lamp.sourceY;
          const coneDZ = lamp.coneTargetZ - lamp.sourceZ;
          const basis = mothConeBasis(coneDX, coneDY, coneDZ, mothBasis);
          if (publishCones) {
            updateMothLampCone(outlineCone, lamp, basis);
            lampConeOutlines.push({
              lampId,
              source: {
                x: outlineCone.sourceX,
                y: outlineCone.sourceY,
                z: outlineCone.sourceZ,
              },
              direction: {
                x: outlineCone.dirX,
                y: outlineCone.dirY,
                z: outlineCone.dirZ,
              },
              // The drawn near end is the containment's near end, which is
              // now BEHIND the source — see `lampConeAxialMin`. Drawing from
              // `nearDistance` would show the beam and hide the column around
              // the fixture the moths actually occupy.
              nearDistance: lampConeAxialMin(outlineCone),
              farDistance: outlineCone.farDistance,
              nearRadius: lampConeOuterRadius(
                outlineCone,
                lampConeAxialMin(outlineCone),
              ),
              farRadius: lampConeOuterRadius(
                outlineCone,
                outlineCone.farDistance,
              ),
              lit: lamp.litRef.current > 0.45,
            });
          }
          const lampPerch = getLampInsectPerch(lampId);
          const lampUnitIndex = lampPerch?.unitIndex ?? stacks.activeUnit;
          for (
            let localIndex = 0;
            localIndex < lamp.mothCount && mothIndex < MOTH_COUNT;
            localIndex++, mothIndex++
          ) {
            const lampAmount = darkAmount.current * lamp.litRef.current;
            const behaviorId = mothIndex + lampIndex * 7;
            const motion = mothPilots.current[mothIndex]!;
            if (
              suspendOffscreen &&
              Math.abs(lampUnitIndex - stacks.activeUnit) > 1
            ) {
              if (motion.pilot) resetMothPilot(motion, t);
              mothDummy.scale.setScalar(0);
              mothDummy.updateMatrix();
              bodyMesh.setMatrixAt(mothIndex, mothDummy.matrix);
              leftMesh.setMatrixAt(mothIndex, mothDummy.matrix);
              rightMesh.setMatrixAt(mothIndex, mothDummy.matrix);
              continue;
            }
            if (
              motion.context.lampId !== null &&
              motion.context.lampId !== lampId
            ) {
              resetMothPilot(motion, t);
              // Re-binding to a different lamp is a position write, not a
              // flight. Keeping the samples would draw a stroke across the room
              // that never happened.
              clearInsectTrail(motion.trail);
            }
            updateMothCruiseContext(
              motion.context,
              lampId,
              behaviorId,
              lampAmount,
              lamp,
              basis,
            );
            updateMothLampCone(motion.cone, lamp, basis);
            motion.world.setContext(lampUnitIndex, clockTime);
            mothFrame(
              behaviorId,
              t,
              lampAmount,
              lamp.mothNearDistance,
              lamp.mothFarDistance,
              lamp.mothMaxRadius,
              motion.presentation,
              basis.openAirXStrength,
            );
            const mothSample = motion.presentation;
            mothSample.illumination *= 0.72 + lamp.strength * 0.28;
            const scale =
              MOTH_MODEL_SCALE * mothSample.scale * mothSample.opacity;
            transformMothKinematics(motion.context, mothSample, motion.initial);

            if (lampAmount <= INVISIBLE_OPACITY && motion.pilot) {
              resetMothPilot(motion, t);
            }
            let initialized = false;
            if (
              !motion.pilot &&
              darkAmount.current >= 0.5 &&
              lampAmount > INVISIBLE_OPACITY
            ) {
              motion.pilot = createInsectPilot({
                occupantId: motion.occupantId,
                flightId: mothIndex,
                seed: 700 + mothIndex,
                initialTime: t,
                initial: motion.initial,
                profile: MOTH_PILOT_PROFILE,
                // Twelve moths flew FIVE closed curves, one each for the life
                // of the page, and could not be repelled by anything because
                // nothing was integrated. They roam by intent now, contained
                // in the lamp's own cone (ADR 0007). No Residency, no Transit,
                // no Unit frame to stage a landing through: a moth belongs to
                // a lamp, not to a region of the room.
                roam: {
                  profile: MOTH_STEERING_PROFILE,
                  containment: motion.containment,
                  volume: null,
                  transit: null,
                  evade: null,
                },
              });
              initialized = true;
            }

            const pilot = motion.pilot;
            // Pointer evasion, same shape as the butterflies' but harder — a
            // moth is meant to be the twitchier of the two. Roaming only: a
            // moth already on a lamp answers the pointer with an Escape, and
            // two opinions at once make one insect look confused.
            if (pilot?.roam) {
              let target = 0;
              if (mothPointerIsLive && pilot.phase === "roam") {
                motion.projected
                  .set(pilot.position.x, pilot.position.y, pilot.position.z)
                  .project(camera);
                if (motion.projected.z < 1) {
                  const dx =
                    (motion.projected.x - pointer.x) * size.width * 0.5;
                  const dy =
                    (motion.projected.y - pointer.y) * size.height * 0.5;
                  const away = Math.hypot(dx, dy);
                  target = mothEvasionStrength(away);
                  if (target > 0) {
                    const scale = away > 1 ? 1 / away : 0;
                    mothEvadeVector
                      .copy(mothCameraRight)
                      .multiplyScalar(dx * scale)
                      .addScaledVector(mothCameraUp, dy * scale)
                      .addScaledVector(mothCameraBack, -MOTH_EVASION.depth)
                      .normalize();
                    motion.evade.x = mothEvadeVector.x;
                    motion.evade.y = mothEvadeVector.y;
                    motion.evade.z = mothEvadeVector.z;
                  }
                }
              }
              motion.evade.strength = THREE.MathUtils.damp(
                motion.evade.strength,
                target,
                MOTH_EVASION.lambda,
                delta,
              );
              pilot.roam.evade =
                motion.evade.strength > 1e-3 ? motion.evade : null;
            }
            if (pilot?.reservedPerchId) {
              const perch = getInsectPerch(pilot.reservedPerchId);
              // Must match the candidate filter above, or a moth abandons the
              // very Perch it just chose one frame earlier.
              const validPerch =
                !!perch &&
                perch.unitIndex === stacks.activeUnit &&
                insectPerchAcceptsMoth(perch) &&
                insectPerchMothLightIsOn(perch);
              const prepared =
                validPerch &&
                prepareInsectLandingTarget(
                  pilot.reservedPerchId,
                  "moth",
                  motion.target,
                  motion.landingSpread,
                );
              if (!prepared) {
                // Same grace the butterflies get: a Lamp Perch that cannot be
                // prepared this frame is usually a scene-graph rebuild, not a
                // lamp that has gone. `about:lamp-shade` measured ready on only
                // 26 samples of 86 before the owner-bounds fix, and cancelling
                // on the first miss threw away every approach in progress.
                if (motion.perchMissSince < 0) motion.perchMissSince = t;
                if (
                  t - motion.perchMissSince >= MOTH_PERCH_MISS_GRACE &&
                  commandInsectPilot(pilot, { type: "cancel" }, motion.world)
                ) {
                  scheduleMothFlight(motion, t);
                  motion.perchMissSince = -1;
                }
              } else {
                motion.perchMissSince = -1;
                commandInsectPilot(
                  pilot,
                  { type: "update-perch", target: motion.target },
                  motion.world,
                );
                if (
                  pilot.phase === "rest" &&
                  !motion.world.terminalPoseIsClear(motion.target)
                ) {
                  motion.departure.set(
                    motion.target.normal.x,
                    motion.target.normal.y,
                    motion.target.normal.z,
                  );
                  if (
                    commandInsectPilot(
                      pilot,
                      { type: "depart", away: motion.departure },
                      motion.world,
                    )
                  ) {
                    scheduleMothFlight(motion, t);
                  }
                }
              }
            }

            if (
              pilot?.phase === "roam" &&
              !automaticLandingsPaused &&
              t >= motion.nextAttemptAt &&
              lampAmount > 0.45
            ) {
              // Any lit site near a lamp, not just the lamp's own fixture.
              //
              // This filter used to be `kind === "lamp" && lampId === lampId`,
              // and there is exactly ONE Lamp Perch per lamp — so a moth had a
              // single candidate, and if it was occupied, unlit or blocked it
              // simply never landed. Owner review: "I still haven't seen a
              // single moth land yet." Moths gather at the light rather than on
              // the fixture anyway, so a book or shelf edge inside the pool is
              // both a legitimate site and the one that gives them parity with
              // the butterflies.
              const candidates = [...getInsectPerches().values()].filter(
                (perch) =>
                  perch.unitIndex === stacks.activeUnit &&
                  insectPerchAcceptsMoth(perch) &&
                  insectPerchMothLightIsOn(perch) &&
                  !insectPerchOccupant(perch.id) &&
                  !insectOwnerIsDisturbed(insectPerchOwnerId(perch), stacks),
              );
              // Rotated per attempt so a moth does not hammer the same site.
              // Taking `candidates[0]` every time meant one Perch absorbed every
              // attempt on the shelf and the rest were never tried.
              const candidate =
                candidates.length > 0
                  ? candidates[
                      Math.floor(
                        landingNoise(motion.index, motion.attempts * 37 + 11) *
                          candidates.length,
                      ) % candidates.length
                    ]
                  : undefined;
              // Drawn BEFORE the target is prepared, because the contact the
              // planner compiles against has to be the displaced one — a plan
              // built for the centre of a shade and flown to a point three
              // centimetres away is a plan the pilot has to fight.
              const spread = landingNoise(
                motion.index,
                (motion.attempts + 1) * 31 + 17,
              );
              if (
                candidate &&
                prepareInsectLandingTarget(
                  candidate.id,
                  "moth",
                  motion.target,
                  spread,
                ) &&
                commandInsectPilot(
                  pilot,
                  {
                    type: "land",
                    target: motion.target,
                    // Without this the planner takes its first-choice winding,
                    // size and entry every time — and, since the Arrival Curve
                    // tilt is also drawn from it, index 0, which is the
                    // straight-down descent. A moth landing on the same lamp
                    // shade twice flew the identical line onto it.
                    variation: landingNoise(
                      motion.index,
                      motion.attempts * 23 + 5,
                    ),
                  },
                  motion.world,
                )
              ) {
                motion.attempts++;
                motion.restEndsAt = Number.POSITIVE_INFINITY;
                motion.nearSince = -1;
                motion.restHeading.set(0, 0, 0);
                motion.landingYaw =
                  (landingNoise(motion.index, motion.attempts * 29 + 13) -
                    0.5) *
                  INSECT_LANDING_YAW;
                motion.landingSpread = spread;
                motion.perchMissSince = -1;
              } else {
                motion.nextAttemptAt = t + 2.5;
              }
            }

            let direct = false;
            let environmentalDrag = false;
            let distancePx = Number.POSITIVE_INFINITY;
            const engagedPerch = pilot?.reservedPerchId
              ? getInsectPerch(pilot.reservedPerchId)
              : null;
            if (pilot?.reservedPerchId && engagedPerch) {
              const ownerId = insectPerchOwnerId(engagedPerch);
              direct = insectOwnerIsDisturbed(ownerId, stacks);
              environmentalDrag =
                Boolean(stacks.dragging) &&
                engagedPerch.unitIndex === stacks.activeUnit;
              motion.projected
                .set(
                  motion.target.point.x,
                  motion.target.point.y,
                  motion.target.point.z,
                )
                .project(camera);
              const pointerDx =
                (motion.projected.x - pointer.x) * size.width * 0.5;
              const pointerDy =
                (motion.projected.y - pointer.y) * size.height * 0.5;
              distancePx = Math.hypot(pointerDx, pointerDy);
            }
            let proximity = false;
            if (
              pilot?.reservedPerchId &&
              !pointerIsTouch.current &&
              performance.now() <= pointerActiveUntil.current &&
              distancePx <
                (pilot.phase === "approach"
                  ? LANDING_TIMING.pointerCancelPx
                  : LANDING_TIMING.pointerDepartPx)
            ) {
              if (motion.nearSince < 0) motion.nearSince = t;
              const confirmation =
                LANDING_TIMING.pointerConfirm[0] +
                (LANDING_TIMING.pointerConfirm[1] -
                  LANDING_TIMING.pointerConfirm[0]) *
                  landingNoise(motion.index, motion.attempts * 13 + 5);
              if (
                pilot.phase === "approach" ||
                pilot.phase === "hover" ||
                pilot.phase === "touchdown" ||
                pilot.phase === "rest"
              )
                proximity = pointerDisturbanceIsConfirmed({
                  pointerType: pointerIsTouch.current ? "touch" : "mouse",
                  recentActivity:
                    performance.now() <= pointerActiveUntil.current,
                  phase: pilot.phase,
                  distancePx,
                  nearFor: t - motion.nearSince,
                  confirmation,
                });
            } else {
              motion.nearSince = -1;
            }
            if (
              pilot &&
              (direct || environmentalDrag || proximity) &&
              (pilot.phase === "approach" ||
                pilot.phase === "hover" ||
                pilot.phase === "touchdown" ||
                pilot.phase === "rest")
            ) {
              if (proximity) {
                const elements = camera.matrixWorld.elements;
                const awayX = motion.projected.x - pointer.x;
                const awayY = motion.projected.y - pointer.y;
                motion.departure.set(
                  elements[0] * awayX + elements[4] * awayY,
                  elements[1] * awayX + elements[5] * awayY,
                  elements[2] * awayX + elements[6] * awayY,
                );
                motion.departure.x += motion.target.normal.x * 0.9;
                motion.departure.y += motion.target.normal.y * 0.9;
                motion.departure.z += motion.target.normal.z * 0.9;
              } else {
                motion.departure.set(
                  motion.target.normal.x,
                  motion.target.normal.y,
                  motion.target.normal.z,
                );
              }
              if (
                commandInsectPilot(
                  pilot,
                  { type: "depart", away: motion.departure },
                  motion.world,
                )
              ) {
                scheduleMothFlight(motion, t);
                motion.nearSince = -1;
              }
            }

            if (
              pilot?.phase === "rest" &&
              t >= motion.restEndsAt &&
              commandInsectPilot(pilot, { type: "depart" }, motion.world)
            ) {
              scheduleMothFlight(motion, t);
            }

            if (pilot && !initialized) {
              advanceInsectPilot(pilot, delta, motion.world);
              recordInsectTrail(motion.trail, pilot.position, t);
              if (pilot.event === "landed") {
                motion.restEndsAt =
                  t +
                  LANDING_TIMING.mothRest[0] +
                  (LANDING_TIMING.mothRest[1] - LANDING_TIMING.mothRest[0]) *
                    landingNoise(motion.index, motion.attempts * 11 + 3);
              } else if (pilot.event === "approach-blocked") {
                scheduleMothFlight(motion, t);
              }
            }

            const position = pilot?.position ?? motion.initial.position;
            const velocity = pilot?.velocity ?? motion.initial.velocity;
            if (
              process.env.NODE_ENV === "development" &&
              pilot &&
              t - motion.telemetryPublishedAt >= 0.25
            ) {
              motion.telemetryPublishedAt = t;
              // Moths publish the same telemetry the butterflies do, so the
              // live check (ADR 0006) can hold them to the same invariants: no
              // displacement flight cannot explain, and never below a contact
              // plane. They have no Residency, so `unitIndex` is the lamp's.
              insectDiagnosticsController.publishFlightState({
                telemetry: {
                  occupantId: motion.occupantId,
                  time: t,
                  species: "moth",
                  unitIndex: lampUnitIndex,
                  residentIndex: mothIndex,
                  phase: pilot.phase,
                  position: {
                    x: pilot.position.x,
                    y: pilot.position.y,
                    z: pilot.position.z,
                  },
                  perchId: pilot.reservedPerchId,
                  contactGap: mothContactGap(pilot),
                  region: "none",
                  speed: Math.hypot(
                    pilot.velocity.x,
                    pilot.velocity.y,
                    pilot.velocity.z,
                  ),
                  altitude: pilot.position.y - MEADOW_GROUND_BASE,
                  clearance:
                    pilot.steering?.clearance ?? Number.POSITIVE_INFINITY,
                  containment: pilot.steering?.containment ?? 0,
                  collisionRevision: null,
                  lastMeaningfulMovement: t,
                  stalled: false,
                },
                trail: insectTrailPoints(motion.trail),
              });
            }
            // Brightness now follows where the moth ACTUALLY is. The model
            // always varied with radial distance and beam depth; it could
            // never show, because the sampled path was constructed bounded by
            // the cone radius. A roaming moth reaches the parts of it that
            // were unreachable, so leaving the light reads as leaving it.
            if (pilot) {
              lampConeLocal(motion.cone, position, motion.coneLocal);
              mothSample.illumination =
                mothIllumination(
                  motion.coneLocal.radial,
                  lampConeRadius(motion.cone, motion.coneLocal.axial),
                  motion.coneLocal.axial,
                  lamp.mothNearDistance,
                  Math.max(0.001, lamp.mothFarDistance - lamp.mothNearDistance),
                  lampAmount,
                ) *
                (0.72 + lamp.strength * 0.28);
            }
            const acceleration =
              pilot?.acceleration ?? motion.initial.acceleration;
            const velocityX = velocity.x;
            const velocityZ = velocity.z;
            const accelerationX = acceleration.x;
            const accelerationZ = acceleration.z;
            const yawEase = 1 - Math.exp(-MOTH_YAW_LAMBDA * delta);
            const targetYaw = Math.atan2(velocityX, velocityZ);
            mothYaws.current[mothIndex] =
              mothYaws.current[mothIndex]! +
              wrapPi(targetYaw - mothYaws.current[mothIndex]!) * yawEase;
            const speedSquared = Math.max(
              velocityX * velocityX + velocityZ * velocityZ,
              0.04,
            );
            const turn =
              pilot?.phase !== "touchdown" && pilot?.phase !== "rest"
                ? (velocityZ * accelerationX - velocityX * accelerationZ) /
                  speedSquared
                : 0;
            mothRolls.current[mothIndex] = THREE.MathUtils.damp(
              mothRolls.current[mothIndex]!,
              THREE.MathUtils.clamp(
                -MOTH_BANK_K * turn,
                -MOTH_BANK_MAX,
                MOTH_BANK_MAX,
              ),
              MOTH_ROLL_LAMBDA,
              delta,
            );
            // Thorax pitch about the body's own lateral axis. The YXZ order on
            // `mothEuler` is what makes that true: the default XYZ would pitch
            // about world X, which is only correct while the moth happens to
            // fly along z.
            mothEuler.set(
              -(pilot?.bodyPitch ?? 0),
              mothYaws.current[mothIndex]!,
              mothRolls.current[mothIndex]!,
            );
            mothParentQuaternion.setFromEuler(mothEuler);
            // Hover is included so the heading is captured while the moth is
            // unambiguously travelling; by touchdown it is already slowing onto
            // the contact and may never exceed the hold speed, which would drop
            // it back to the authored tangent. `alignment` below is zero during
            // hover, so this is a capture there and nothing more.
            if (
              pilot?.reservedPerchId &&
              (pilot.phase === "hover" ||
                pilot.phase === "touchdown" ||
                pilot.phase === "rest")
            ) {
              mothRestY
                .set(
                  motion.target.normal.x,
                  motion.target.normal.y,
                  motion.target.normal.z,
                )
                .normalize();
              // Face the way it is travelling, not the way the Perch was
              // authored — the same defect the butterflies had, and for the
              // same reason: `target.tangent` is a property of the site, so the
              // body swung round to it while the Arrival Curve was still
              // carrying the moth sideways. Held once it is down, because a
              // resting pilot is pinned and has no velocity left to read.
              mothRestZ.set(
                pilot.velocity.x,
                pilot.velocity.y,
                pilot.velocity.z,
              );
              mothRestZ.addScaledVector(mothRestY, -mothRestY.dot(mothRestZ));
              // Above the hold speed only. The pilot tracks the Arrival Curve
              // with a controller rather than replaying it, so the last of its
              // velocity is convergence correction, not travel, and a settling
              // controller oscillates — reading a facing off it made the moth
              // hunt back and forth as it landed. See
              // `REST_HEADING_HOLD_SPEED` in `Butterflies.tsx`.
              if (mothRestZ.lengthSq() > MOTH_REST_HEADING_HOLD_SPEED ** 2)
                motion.restHeading.copy(
                  mothRestZ
                    .normalize()
                    .applyAxisAngle(mothRestY, motion.landingYaw),
                );
              else if (motion.restHeading.lengthSq() < 1e-6)
                motion.restHeading
                  .set(
                    motion.target.tangent.x,
                    motion.target.tangent.y,
                    motion.target.tangent.z,
                  )
                  .addScaledVector(
                    mothRestY,
                    -mothRestY.dot(motion.restHeading),
                  )
                  .normalize();
              mothRestZ.copy(motion.restHeading);
              mothRestX.crossVectors(mothRestY, mothRestZ).normalize();
              mothRestZ.crossVectors(mothRestX, mothRestY).normalize();
              mothRestMatrix.makeBasis(mothRestX, mothRestY, mothRestZ);
              mothRestQuaternion.setFromRotationMatrix(mothRestMatrix);
              // Hover CAPTURES the heading but must not adopt the surface pose:
              // the moth is still flying the arc there, and aligning it to the
              // shade early would lay it flat in mid-air.
              const alignment =
                pilot.phase === "rest"
                  ? 1
                  : pilot.phase === "touchdown"
                    ? THREE.MathUtils.smoothstep(pilot.phaseAge, 0, 0.5)
                    : 0;
              // Compose the flare onto the aligned quaternion rather than
              // writing an Euler pitch after alignment, which would reconstruct
              // and destroy it.
              mothFlareQuaternion.setFromAxisAngle(
                mothPitchAxis,
                -pilot.bodyPitch,
              );
              mothRestQuaternion.multiply(mothFlareQuaternion);
              mothParentQuaternion.slerp(mothRestQuaternion, alignment);
            }

            if (pilot?.reservedPerchId) {
              mothSample.illumination = Math.max(
                mothSample.illumination,
                lampAmount * (pilot.phase === "rest" ? 0.86 : 0.68),
              );
            }

            mothColor.lerpColors(
              mothWingColor,
              mothLitWingColor,
              mothSample.illumination,
            );
            leftMesh.setColorAt(mothIndex, mothColor);
            rightMesh.setColorAt(mothIndex, mothColor);
            mothColor.lerpColors(
              mothBodyColor,
              mothLitBodyColor,
              mothSample.illumination,
            );
            bodyMesh.setColorAt(mothIndex, mothColor);

            // As with the butterflies: the drawn body sits closer to the
            // surface than the collision datum does, and settles with the
            // wings rather than popping down at touchdown.
            const mothSink = MOTH_RENDER_SINK * (pilot?.wingFold ?? 0);
            mothDummy.position.set(
              position.x - motion.target.normal.x * mothSink,
              position.y - motion.target.normal.y * mothSink,
              position.z - motion.target.normal.z * mothSink,
            );
            mothDummy.quaternion
              .copy(mothParentQuaternion)
              .multiply(mothFlatQuaternion);
            mothDummy.scale.setScalar(scale);
            mothDummy.updateMatrix();
            bodyMesh.setMatrixAt(mothIndex, mothDummy.matrix);

            const landingFlap = pilot?.wingAngle ?? mothSample.flap;
            mothHingeQuaternion.setFromAxisAngle(mothUpAxis, landingFlap);
            mothDummy.quaternion
              .copy(mothParentQuaternion)
              .multiply(mothHingeQuaternion)
              .multiply(mothFlatQuaternion);
            mothDummy.scale.setScalar(scale);
            mothDummy.updateMatrix();
            leftMesh.setMatrixAt(mothIndex, mothDummy.matrix);

            mothHingeQuaternion.setFromAxisAngle(mothUpAxis, -landingFlap);
            mothDummy.quaternion
              .copy(mothParentQuaternion)
              .multiply(mothHingeQuaternion)
              .multiply(mothFlatQuaternion);
            mothDummy.scale.set(-scale, scale, scale);
            mothDummy.updateMatrix();
            rightMesh.setMatrixAt(mothIndex, mothDummy.matrix);
          }
          lampIndex++;
        }
        if (publishCones)
          insectDiagnosticsController.publishLampCones([...lampConeOutlines]);
        mothDummy.scale.setScalar(0);
        mothDummy.updateMatrix();
        for (; mothIndex < MOTH_COUNT; mothIndex++) {
          const motion = mothPilots.current[mothIndex]!;
          if (motion.pilot) resetMothPilot(motion, t);
          bodyMesh.setMatrixAt(mothIndex, mothDummy.matrix);
          leftMesh.setMatrixAt(mothIndex, mothDummy.matrix);
          rightMesh.setMatrixAt(mothIndex, mothDummy.matrix);
        }
        bodyMesh.instanceMatrix.needsUpdate = true;
        leftMesh.instanceMatrix.needsUpdate = true;
        rightMesh.instanceMatrix.needsUpdate = true;
        if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
        if (leftMesh.instanceColor) leftMesh.instanceColor.needsUpdate = true;
        if (rightMesh.instanceColor) rightMesh.instanceColor.needsUpdate = true;
      } else {
        for (const motion of mothPilots.current) {
          if (motion.pilot) resetMothPilot(motion, t);
        }
      }
    }

    const batRoot = bat.current;
    batFlightFrame(t, darkAmount.current, batFrame);
    batMaterial.opacity = batFrame.opacity;
    if (batRoot) {
      batRoot.visible = batFrame.opacity > INVISIBLE_OPACITY;
      if (batRoot.visible) {
        const arc = Math.sin(batFrame.progress * Math.PI);
        batRoot.position.set(
          camera.position.x - 6.4 + batFrame.progress * 12.8 + batFrame.offsetX,
          WILDLIFE_PRESENTATION.bat.baseY + arc * 0.68 + batFrame.offsetY,
          WILDLIFE_PRESENTATION.bat.baseZ -
            arc * WILDLIFE_PRESENTATION.bat.depthArc +
            batFrame.offsetZ,
        );
        batRoot.scale.setScalar(WILDLIFE_PRESENTATION.bat.scale);
        batRoot.rotation.z = -0.08 + Math.sin(t * 0.9) * 0.08;
        const flap = batFrame.flap * 0.82;
        const left = batWings.current[0];
        const right = batWings.current[1];
        if (left) {
          left.rotation.z = flap;
          left.rotation.y = batFrame.flap * 0.24;
        }
        if (right) {
          right.rotation.z = -flap;
          right.rotation.y = -batFrame.flap * 0.24;
        }
      }
    }
  });

  return (
    <>
      <instancedMesh
        ref={mothBodies}
        args={[undefined, undefined, MOTH_COUNT]}
        geometry={geometries.mothBody}
        material={mothBodyMaterial}
        frustumCulled={false}
        raycast={NO_RAYCAST}
      />
      <instancedMesh
        ref={mothLeftWings}
        args={[undefined, undefined, MOTH_COUNT]}
        geometry={geometries.mothWing}
        material={mothMaterial}
        frustumCulled={false}
        raycast={NO_RAYCAST}
      />
      <instancedMesh
        ref={mothRightWings}
        args={[undefined, undefined, MOTH_COUNT]}
        geometry={geometries.mothWing}
        material={mothMaterial}
        frustumCulled={false}
        raycast={NO_RAYCAST}
      />

      <group ref={bat}>
        <mesh
          geometry={geometries.batBody}
          material={batMaterial}
          raycast={NO_RAYCAST}
        />
        {[1, -1].map((side, index) => (
          <group
            key={side}
            ref={(value) => {
              batWings.current[index] = value;
            }}
          >
            <mesh
              geometry={geometries.batWing}
              material={batMaterial}
              scale={[side, 1, 1]}
              raycast={NO_RAYCAST}
            />
          </group>
        ))}
      </group>
    </>
  );
}

/** Animated wildlife has no meaningful still counterpart. Match the existing
 * butterflies/petals contract and omit it completely for reduced motion. */
export default function Wildlife({
  dark,
  suspendOffscreen = false,
}: {
  dark: boolean;
  suspendOffscreen?: boolean;
}) {
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  if (reduced) return null;
  return <LivingWildlife dark={dark} suspendOffscreen={suspendOffscreen} />;
}
