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
import {
  type InsectLampCone,
  type LampConeLocal,
  createInsectLampCone,
  createInsectLampConeContainment,
  createLampConeLocal,
  lampConeLocal,
  lampConeRadius,
} from "./insectLampCone";
import {
  LANDING_TIMING,
  landingNoise,
  pointerDisturbanceIsConfirmed,
} from "./insectLanding";
import { insectDiagnosticsController } from "./insectPerchDiagnostic";
import {
  getInsectPerch,
  getInsectPerches,
  getLampInsectPerch,
  insectPerchOccupant,
  insectPerchOwnerId,
  lampPerchIsLit,
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
  nextAttemptAt: number;
  restEndsAt: number;
  attempts: number;
  nearSince: number;
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
    nextAttemptAt: 8 + 12 * landingNoise(index, 1),
    restEndsAt: Number.POSITIVE_INFINITY,
    attempts: 0,
    nearSince: -1,
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

function LivingWildlife({ dark }: { dark: boolean }) {
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
  const mothDummy = useMemo(() => new THREE.Object3D(), []);
  const mothParentQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const mothRestQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const mothRestMatrix = useMemo(() => new THREE.Matrix4(), []);
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
      }
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
      if (mothsVisible) {
        for (const [lampId, lamp] of getMeadowLamps()) {
          const coneDX = lamp.coneTargetX - lamp.sourceX;
          const coneDY = lamp.coneTargetY - lamp.sourceY;
          const coneDZ = lamp.coneTargetZ - lamp.sourceZ;
          const basis = mothConeBasis(coneDX, coneDY, coneDZ, mothBasis);
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
              motion.context.lampId !== null &&
              motion.context.lampId !== lampId
            ) {
              resetMothPilot(motion, t);
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
                },
              });
              initialized = true;
            }

            const pilot = motion.pilot;
            if (pilot?.reservedPerchId) {
              const perch = getInsectPerch(pilot.reservedPerchId);
              const validPerch =
                perch?.lampId === lampId &&
                perch.unitIndex === stacks.activeUnit &&
                lampPerchIsLit(perch);
              const prepared =
                validPerch &&
                prepareInsectLandingTarget(
                  pilot.reservedPerchId,
                  "moth",
                  motion.target,
                );
              if (!prepared) {
                if (
                  commandInsectPilot(pilot, { type: "cancel" }, motion.world)
                ) {
                  scheduleMothFlight(motion, t);
                }
              } else {
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
              const candidates = [...getInsectPerches().values()].filter(
                (perch) =>
                  perch.kind === "lamp" &&
                  perch.lampId === lampId &&
                  perch.unitIndex === stacks.activeUnit &&
                  lampPerchIsLit(perch) &&
                  !insectPerchOccupant(perch.id) &&
                  insectPerchOwnerId(perch) !== stacks.hovered &&
                  insectPerchOwnerId(perch) !== stacks.dragging,
              );
              const candidate = candidates[0];
              if (
                candidate &&
                prepareInsectLandingTarget(
                  candidate.id,
                  "moth",
                  motion.target,
                ) &&
                commandInsectPilot(
                  pilot,
                  { type: "land", target: motion.target },
                  motion.world,
                )
              ) {
                motion.attempts++;
                motion.restEndsAt = Number.POSITIVE_INFINITY;
                motion.nearSince = -1;
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
              direct =
                Boolean(ownerId) &&
                (ownerId === stacks.hovered || ownerId === stacks.dragging);
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
            if (
              pilot?.reservedPerchId &&
              (pilot.phase === "touchdown" || pilot.phase === "rest")
            ) {
              mothRestY
                .set(
                  motion.target.normal.x,
                  motion.target.normal.y,
                  motion.target.normal.z,
                )
                .normalize();
              mothRestZ
                .set(
                  motion.target.tangent.x,
                  motion.target.tangent.y,
                  motion.target.tangent.z,
                )
                .addScaledVector(mothRestY, -mothRestY.dot(mothRestZ))
                .normalize();
              mothRestX.crossVectors(mothRestY, mothRestZ).normalize();
              mothRestZ.crossVectors(mothRestX, mothRestY).normalize();
              mothRestMatrix.makeBasis(mothRestX, mothRestY, mothRestZ);
              mothRestQuaternion.setFromRotationMatrix(mothRestMatrix);
              const alignment =
                pilot.phase === "rest"
                  ? 1
                  : THREE.MathUtils.smoothstep(pilot.phaseAge, 0, 0.5);
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
export default function Wildlife({ dark }: { dark: boolean }) {
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  if (reduced) return null;
  return <LivingWildlife dark={dark} />;
}
