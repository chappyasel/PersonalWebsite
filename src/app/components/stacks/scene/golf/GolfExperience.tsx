"use client";

import { sceneAudio } from "../../audio/sceneAudio";
import { recordFieldNoteEvent } from "../../fieldNotes/progress";
import { useStacks } from "../../store";
import ModelProp from "../ModelProp";
import { InteractionClaim } from "../interaction";
import { registerSceneInteraction } from "../interactionRegistry";
import { publishMeadowPhysicalEvent } from "../meadowDisturbance";
import { meadowHeight } from "../meadowField";
import {
  MEADOW_TRAIL,
  meadowPhysicalResponse,
  meadowTrailReady,
} from "../meadowMotion";
import { useResolvedMeadowVisibility } from "../scenePerformance";
import { SHELF_GEOMETRY } from "../shelfGeometry";
import type { UnitProps } from "../units/types";
import { unitPose } from "../worldLayout";
import { Html } from "@react-three/drei";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

import {
  GOLF_BALL_BUMP,
  GOLF_BALL_GEOMETRY,
  GolfBallProp,
} from "./GolfBallProp";
import { isAboutGolfBallKey } from "./aboutGolfBalls";
import {
  golfClubHintRotation,
  golfClubIdleBlend,
  golfClubPointerFollowRequested,
  golfClubPose,
} from "./golfClubRig";
import { GOLF_CUP, GOLF_FLAG_LOCAL, golfSurfaceAt } from "./golfCourse";
import {
  GOLF_BALL_IDS,
  GOLF_BALL_STARTS,
  GOLF_BALL_UNTEED_START,
  GOLF_CLUB_GRIP_HEIGHT,
  GOLF_CLUB_MODEL_YAW,
  GOLF_CLUB_PROJECTED_LOCAL_BOUNDS,
  GOLF_CLUB_REST_BASE,
  GOLF_CLUB_SCALE,
  inGolfHittingBay,
} from "./golfLayout";
import {
  GOLF_BALL_RADIUS,
  GOLF_GRAVITY,
  GolfFixedStepper,
  type GolfWorld,
  createGolfBallState,
  launchGolfBall,
  stepGolfWorld,
} from "./golfPhysics";
import {
  GOLF_BALL_FINISH,
  GOLF_CLUB_FINISH,
  GOLF_CONFETTI_COLORS,
  GOLF_FOG_POLICY,
  golfBallCupOpacity,
  golfBallRenderedScale,
  golfBallVisualScale,
  golfVisualSpinStep,
} from "./golfPresentation";
import {
  GOLF_CONFETTI_COUNT,
  golfMotionPolicy,
  resetGolfSession,
  shouldResetGolfSession,
} from "./golfSession";
import { GolfShotBag, seededGolfRandom } from "./golfShotBag";
import {
  GolfStrikeQueue,
  nextReadyClubTarget,
  shouldAdvanceGolfStrike,
} from "./golfStrikeQueue";
import { planGolfTrajectory } from "./golfTrajectory";
import type {
  GolfBallId,
  GolfBallPhase,
  GolfBallState,
  GolfPhysicsEvent,
  GolfVec3,
} from "./golfTypes";
import {
  type HittableBall,
  hittableBallsFor,
  hittableContactPoint,
  setHittableBallTapHandler,
} from "./hittableBalls";

const BALL_GEOMETRY = GOLF_BALL_GEOMETRY;
const BALL_BUMP = GOLF_BALL_BUMP;
const CLUB_REST_PIVOT = new THREE.Vector3(
  GOLF_CLUB_REST_BASE.x,
  GOLF_CLUB_REST_BASE.y + GOLF_CLUB_GRIP_HEIGHT,
  GOLF_CLUB_REST_BASE.z,
);
const CONFETTI_DUMMY = new THREE.Object3D();
const GOLF_BALL_MASS_KG = 0.046;
/** The ghosts only exist in the air and on the green. At rest the visible
 * ball is the GolfBallProp the visitor can pick up. */
const GHOST_HIDDEN_PHASES = new Set<GolfBallPhase>([
  "ready",
  "queued",
  "addressed",
  "resetting",
  "fading-in",
]);

/** A Grabbable sphere the bay is watching. `away` is anywhere but the bay,
 * or moving; `ready` is still on the bay floor; `struck` waits for the
 * solver to carry it off before the ball can be teed up again. A golf ball
 * that has been struck also holds the ghost `slot` flying its shot until
 * that ghost resets and the prop shows again at home. */
type LooseBall = {
  id: string;
  ball: HittableBall;
  golf: boolean;
  slot: GolfBallId | null;
  phase: "away" | "ready" | "queued" | "struck";
  /** Unit-local contact point. Balls use their centre; upright cans use
   * half-height, so the iron cannot drive either prop into the floor. */
  position: GolfVec3;
  struckFor: number;
};
function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ConfettiBurst({
  origin,
  serial,
  suppressed,
  active,
}: {
  origin: GolfVec3;
  serial: number;
  suppressed: boolean;
  active: boolean;
}) {
  const meshRefs = useRef<Array<THREE.InstancedMesh | null>>([]);
  const burst = useRef<{
    started: number;
    particles: Array<{
      velocity: GolfVec3;
      spin: GolfVec3;
      size: number;
    }>;
  } | null>(null);
  useEffect(() => {
    if (!serial || suppressed) return;
    const random = seededGolfRandom(serial * 997 + 31);
    burst.current = {
      started: performance.now() / 1000,
      particles: Array.from({ length: GOLF_CONFETTI_COUNT }, () => {
        const angle = random() * Math.PI * 2;
        const speed = 0.85 + random() * 2.25;
        return {
          velocity: {
            x: Math.cos(angle) * speed,
            y: 2.25 + random() * 2.25,
            z: Math.sin(angle) * speed,
          },
          spin: {
            x: 2 + random() * 8,
            y: 3 + random() * 10,
            z: 2 + random() * 9,
          },
          size: 0.72 + random() * 0.72,
        };
      }),
    };
  }, [serial, suppressed]);
  useFrame(() => {
    if (suppressed || !active) {
      burst.current = null;
      for (const mesh of meshRefs.current) if (mesh) mesh.visible = false;
      return;
    }
    const burstState = burst.current;
    const age = burstState
      ? performance.now() / 1000 - burstState.started
      : Infinity;
    for (const mesh of meshRefs.current) if (mesh) mesh.visible = age < 4;
    if (age >= 4 || !burstState) return;
    burstState.particles.forEach((particle, index) => {
      const drag = Math.exp(-0.32 * age);
      CONFETTI_DUMMY.position.set(
        origin.x + particle.velocity.x * age * drag,
        Math.max(
          origin.y + 0.018,
          origin.y + 0.1 + particle.velocity.y * age - 1.85 * age * age,
        ),
        origin.z + particle.velocity.z * age * drag,
      );
      // A large but bounded fountain reads clearly without crossing into the
      // neighbouring sections or becoming a permanent meadow effect.
      CONFETTI_DUMMY.position.x = THREE.MathUtils.clamp(
        CONFETTI_DUMMY.position.x,
        origin.x - 2.2,
        origin.x + 2.2,
      );
      CONFETTI_DUMMY.position.z = THREE.MathUtils.clamp(
        CONFETTI_DUMMY.position.z,
        origin.z - 2.2,
        origin.z + 2.2,
      );
      CONFETTI_DUMMY.rotation.set(
        age * particle.spin.x,
        age * particle.spin.y,
        age * particle.spin.z,
      );
      const fade = THREE.MathUtils.clamp((4 - age) / 0.65, 0, 1);
      CONFETTI_DUMMY.scale.setScalar(particle.size * fade);
      CONFETTI_DUMMY.updateMatrix();
      const colorIndex = index % GOLF_CONFETTI_COLORS.length;
      const mesh = meshRefs.current[colorIndex];
      mesh?.setMatrixAt(
        Math.floor(index / GOLF_CONFETTI_COLORS.length),
        CONFETTI_DUMMY.matrix,
      );
    });
    for (const mesh of meshRefs.current)
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      {GOLF_CONFETTI_COLORS.map((color, colorIndex) => (
        <instancedMesh
          key={color}
          ref={(mesh) => {
            meshRefs.current[colorIndex] = mesh;
          }}
          args={[
            undefined,
            undefined,
            Math.ceil(
              (GOLF_CONFETTI_COUNT - colorIndex) / GOLF_CONFETTI_COLORS.length,
            ),
          ]}
          visible={false}
          frustumCulled={false}
        >
          <boxGeometry args={[0.065, 0.034, 0.009]} />
          <meshBasicMaterial
            color={color}
            transparent
            depthWrite={false}
            fog={GOLF_FOG_POLICY.confetti}
            toneMapped={false}
          />
        </instancedMesh>
      ))}
    </>
  );
}

export default function GolfExperience({
  palette,
  dark,
  index,
  plantedTeeRemoved = false,
}: Pick<UnitProps, "palette" | "dark" | "index"> & {
  plantedTeeRemoved?: boolean;
}) {
  const gl = useThree((state) => state.gl);
  const meadowVisible = useResolvedMeadowVisibility();
  const pose = unitPose(index);
  const yaw = pose.rotation[1];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const toWorld = useCallback(
    (point: GolfVec3): GolfVec3 => ({
      x: pose.position[0] + point.x * c + point.z * s,
      y: point.y,
      z: pose.position[2] - point.x * s + point.z * c,
    }),
    [c, pose.position, s],
  );
  const toWorldDirection = useCallback(
    (direction: GolfVec3): GolfVec3 => ({
      x: direction.x * c + direction.z * s,
      y: direction.y,
      z: -direction.x * s + direction.z * c,
    }),
    [c, s],
  );
  const toLocal = useCallback(
    (point: { x: number; y: number; z: number }): GolfVec3 => {
      const dx = point.x - pose.position[0];
      const dz = point.z - pose.position[2];
      return { x: dx * c - dz * s, y: point.y, z: dx * s + dz * c };
    },
    [c, pose.position, s],
  );
  const cup = useMemo<GolfVec3>(() => {
    const world = toWorld({
      x: GOLF_FLAG_LOCAL[0],
      y: 0,
      z: GOLF_FLAG_LOCAL[1],
    });
    return {
      x: GOLF_FLAG_LOCAL[0],
      y: meadowHeight(world.x, world.z),
      z: GOLF_FLAG_LOCAL[1],
    };
  }, [toWorld]);
  const balls = useRef<GolfBallState[]>(
    GOLF_BALL_IDS.map((id) => createGolfBallState(id, GOLF_BALL_STARTS[id])),
  );
  const ballTrails = useRef(
    Object.fromEntries(
      GOLF_BALL_IDS.map((id) => [
        id,
        { x: GOLF_BALL_STARTS[id].x, z: GOLF_BALL_STARTS[id].z, elapsed: 0 },
      ]),
    ) as Record<GolfBallId, { x: number; z: number; elapsed: number }>,
  );
  const ballGroups = useRef<Record<GolfBallId, THREE.Group | null>>({
    one: null,
    two: null,
    three: null,
    four: null,
  });
  const ballSpins = useRef<Record<GolfBallId, THREE.Group | null>>({
    one: null,
    two: null,
    three: null,
    four: null,
  });
  const ballMaterials = useRef<
    Record<GolfBallId, THREE.MeshStandardMaterial | null>
  >({
    one: null,
    two: null,
    three: null,
    four: null,
  });
  const ballMarks = useRef<Record<GolfBallId, THREE.MeshBasicMaterial | null>>({
    one: null,
    two: null,
    three: null,
    four: null,
  });
  const glints = useRef<Record<GolfBallId, THREE.Mesh | null>>({
    one: null,
    two: null,
    three: null,
    four: null,
  });
  const puffs = useRef<Array<{ mesh: THREE.Mesh | null; age: number }>>(
    Array.from({ length: 4 }, () => ({ mesh: null, age: Infinity })),
  );
  const club = useRef<THREE.Group>(null);
  const clubVisual = useRef<THREE.Group>(null);
  const clubHint = useRef(0);
  const clubPointer = useRef(new THREE.Vector2());
  const clubPointerTarget = useRef(new THREE.Vector2());
  const stepper = useRef(new GolfFixedStepper());
  const queue = useRef(new GolfStrikeQueue());
  const looseBalls = useRef(new Map<string, LooseBall>());
  const golfAttempts = useRef(new Map<string, number>());
  const firstShotByGhost = useRef(new Map<GolfBallId, boolean>());
  const looseWorld = useMemo(() => new THREE.Vector3(), []);
  const bag = useRef(
    new GolfShotBag(
      process.env.NODE_ENV === "development" ? "development" : "production",
      seededGolfRandom(Math.floor(Math.random() * 0x7fffffff)),
    ),
  );
  const motion = useMemo(() => golfMotionPolicy(reducedMotion()), []);
  const [celebration, setCelebration] = useState(0);
  const [labelVisible, setLabelVisible] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);
  const labelTimer = useRef(0);
  const confettiTimer = useRef(0);

  useEffect(() => {
    const trackPointer = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      clubPointerTarget.current.set(
        THREE.MathUtils.clamp(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -1,
          1,
        ),
        THREE.MathUtils.clamp(
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
          -1,
          1,
        ),
      );
    };
    window.addEventListener("pointermove", trackPointer, {
      capture: true,
      passive: true,
    });
    return () =>
      window.removeEventListener("pointermove", trackPointer, {
        capture: true,
      });
  }, [gl]);

  const surfaceAt = useCallback(
    (x: number, z: number) => {
      const world = toWorld({ x, y: 0, z });
      const e = 0.03;
      const dx =
        (meadowHeight(world.x + e, world.z) -
          meadowHeight(world.x - e, world.z)) /
        (2 * e);
      const dz =
        (meadowHeight(world.x, world.z + e) -
          meadowHeight(world.x, world.z - e)) /
        (2 * e);
      const length = Math.hypot(dx, 1, dz);
      const worldNormal = { x: -dx / length, y: 1 / length, z: -dz / length };
      return {
        height: meadowHeight(world.x, world.z),
        normal: {
          x: worldNormal.x * c - worldNormal.z * s,
          y: worldNormal.y,
          z: worldNormal.x * s + worldNormal.z * c,
        },
        surface: golfSurfaceAt(world.x, world.z),
      };
    },
    [c, s, toWorld],
  );

  const celebrate = useCallback(
    (position: GolfVec3) => {
      bag.current.recordNaturalHole();
      setCelebration((value) => value + 1);
      setLabelVisible(true);
      setConfettiActive(true);
      window.clearTimeout(labelTimer.current);
      window.clearTimeout(confettiTimer.current);
      labelTimer.current = window.setTimeout(
        () => setLabelVisible(false),
        2200,
      );
      confettiTimer.current = window.setTimeout(
        () => setConfettiActive(false),
        4000,
      );
      const worldPosition = toWorld(position);
      sceneAudio.play("golf-cup", worldPosition, 0.92);
      sceneAudio.play("golf-win", worldPosition, 0.28);
    },
    [toWorld],
  );

  const onPhysicsEvent = useCallback(
    (event: GolfPhysicsEvent) => {
      const worldPosition =
        event.type === "reset" ? null : toWorld(event.position);
      if (event.type === "first-impact") {
        sceneAudio.play("golf-turf", worldPosition!, 0.28);
        const direction = toWorldDirection(event.velocity);
        const horizontalSpeed = Math.hypot(direction.x, direction.z);
        const response = meadowPhysicalResponse({
          normalSpeed: event.impactSpeed,
          tangentSpeed: horizontalSpeed,
          massKg: GOLF_BALL_MASS_KG,
          footprint: GOLF_BALL_RADIUS * 2,
        });
        publishMeadowPhysicalEvent({
          kind: "impact",
          startX: worldPosition!.x,
          startZ: worldPosition!.z,
          endX: worldPosition!.x,
          endZ: worldPosition!.z,
          y: worldPosition!.y,
          directionX:
            horizontalSpeed > 1e-5 ? direction.x / horizontalSpeed : 0,
          directionZ:
            horizontalSpeed > 1e-5 ? direction.z / horizontalSpeed : 0,
          ...response,
        });
        if (motion.turfPuff && meadowVisible) {
          const puff = puffs.current.find((candidate) => candidate.age >= 1.2);
          if (puff?.mesh) {
            puff.age = 0;
            puff.mesh.position.set(
              event.position.x,
              event.position.y,
              event.position.z,
            );
            puff.mesh.visible = true;
          }
        }
      } else if (event.type === "flagstick") {
        sceneAudio.play("flagstick", worldPosition!, 0.68);
      } else if (event.type === "cup") {
        recordFieldNoteEvent({
          type: "golf-ball-holed",
          firstShot: firstShotByGhost.current.get(event.ballId) === true,
        });
        celebrate(event.position);
      } else if (event.type === "reset") {
        firstShotByGhost.current.delete(event.ballId);
        const ball = balls.current.find(
          (candidate) => candidate.id === event.ballId,
        );
        if (ball?.outcome === "hole-bound" && !event.holed)
          bag.current.retryWinner();
        queue.current.release(event.ballId);
        for (const loose of looseBalls.current.values())
          if (loose.slot === event.ballId) {
            loose.slot = null;
            loose.ball.show();
          }
      }
    },
    [celebrate, motion.turfPuff, meadowVisible, toWorld, toWorldDirection],
  );

  const world = useMemo<GolfWorld>(
    () => ({
      surfaceAt,
      cup,
      flagstick: { x: cup.x, z: cup.z, radius: 0.01, height: 1.51 },
      emit: onPhysicsEvent,
    }),
    [cup, onPhysicsEvent, surfaceAt],
  );

  /** A tap on a loose ball. Only a ball that is still on the bay floor is
   * teed up; a tap on one anywhere else falls through to the Grabbable. Not
   * gated on the camera: the bay is the aisle between the shelves, and a
   * ball carried there from #weightlifting should answer where it lies. */
  const tapLooseBall = useCallback((key: string) => {
    const loose = looseBalls.current.get(key);
    if (loose?.phase !== "ready") return false;
    // Four ghosts: a fifth golf ball in the air has nothing to fly it.
    if (loose.golf && !balls.current.some((ball) => ball.phase === "ready"))
      return false;
    if (!queue.current.tap(key)) return false;
    loose.phase = "queued";
    return true;
  }, []);
  useEffect(
    () => setHittableBallTapHandler(index, tapLooseBall),
    [index, tapLooseBall],
  );

  /** Tapping the club swings at the nearest teed-up ball. */
  const tapClub = useCallback(() => {
    const target = nextReadyClubTarget(
      [...looseBalls.current.values()],
      CLUB_REST_PIVOT,
    );
    if (target) tapLooseBall(target);
  }, [tapLooseBall]);

  /** The impact frame for a loose ball: the same planned wedge a golf ball
   * gets, scaled down by mass so a basketball hops and a tennis ball flies,
   * then handed to the rigid body world. Loose balls never draw from the
   * shot bag; the winner cadence belongs to the golf balls. */
  const strikeLooseBall = useCallback(
    (loose: LooseBall) => {
      queue.current.release(loose.id);
      const bottom = {
        ...loose.position,
        y: loose.position.y - loose.ball.contactHeight,
      };
      if (!loose.ball.still() || !inGolfHittingBay(bottom)) {
        // Picked up or rolled off while the club was swinging: a whiff.
        loose.phase = "away";
        return;
      }
      if (loose.golf) {
        // Hand the shot to a ghost: the prop hides at home, the ghost flies
        // the authored trajectory from where the prop lay, with the shot
        // bag's outcome, the cup and the confetti, and the prop shows again
        // when the ghost resets.
        const ghost = balls.current.find((ball) => ball.phase === "ready");
        if (!ghost) {
          loose.phase = "away";
          return;
        }
        const outcome = bag.current.next();
        const previousAttempts = golfAttempts.current.get(loose.id) ?? 0;
        golfAttempts.current.set(loose.id, previousAttempts + 1);
        firstShotByGhost.current.set(ghost.id, previousAttempts === 0);
        const trajectory = planGolfTrajectory(
          loose.position,
          cup,
          outcome,
          Math.random,
          (x, z) => surfaceAt(x, z).height,
        );
        ghost.position = { ...loose.position };
        ghost.start = { ...loose.position };
        const strikePosition = toWorld(loose.position);
        const strikeDirection = toWorldDirection(trajectory.velocity);
        const horizontalSpeed = Math.hypot(
          strikeDirection.x,
          strikeDirection.z,
        );
        const response = meadowPhysicalResponse({
          normalSpeed: 0,
          tangentSpeed: horizontalSpeed,
          massKg: GOLF_BALL_MASS_KG,
          footprint: GOLF_BALL_RADIUS * 2,
        });
        publishMeadowPhysicalEvent({
          kind: "impact",
          startX: strikePosition.x,
          startZ: strikePosition.z,
          endX: strikePosition.x,
          endZ: strikePosition.z,
          y: strikePosition.y,
          directionX:
            horizontalSpeed > 1e-5 ? strikeDirection.x / horizontalSpeed : 0,
          directionZ:
            horizontalSpeed > 1e-5 ? strikeDirection.z / horizontalSpeed : 0,
          ...response,
        });
        launchGolfBall(ghost, trajectory.velocity, outcome);
        sceneAudio.play("golf-strike", strikePosition, 0.9);
        loose.ball.hide();
        loose.slot = ghost.id;
        loose.phase = "struck";
        loose.struckFor = 0;
        if (isAboutGolfBallKey(loose.id))
          recordFieldNoteEvent({ type: "about-golf-ball-struck" });
        return;
      }
      recordFieldNoteEvent({ type: "golf-prop-struck", propId: loose.id });
      if (loose.id === "action:about:vision-ride")
        useStacks.getState().armVisionRideModifier("golf");
      // Not the golf trajectory scaled down. These props live in the rigid
      // body world, whose floor is flat at ground height, while the meadow
      // climbs half a metre toward the green; a can carried 17 m would land
      // under the grass. So a struck prop gets a chip toward the cup: a
      // carry of 3.5 to 7 m by mass (a tennis ball takes the whole swing, a
      // can or the basketball about half), landing where the meadow still
      // meets the floor, and rolling on from there.
      const toCup = {
        x: cup.x - loose.position.x,
        z: cup.z - loose.position.z,
      };
      const cupDistance = Math.max(0.001, Math.hypot(toCup.x, toCup.z));
      const scatter = (Math.random() - 0.5) * 0.24;
      const dir = {
        x:
          (toCup.x / cupDistance) * Math.cos(scatter) -
          (toCup.z / cupDistance) * Math.sin(scatter),
        z:
          (toCup.x / cupDistance) * Math.sin(scatter) +
          (toCup.z / cupDistance) * Math.cos(scatter),
      };
      const massFactor = Math.min(
        1,
        Math.max(0.55, Math.sqrt(GOLF_BALL_MASS_KG / loose.ball.massKg) * 1.4),
      );
      const carry = Math.min(7, Math.max(3.5, cupDistance * 0.38 * massFactor));
      const flightTime = 0.9 + carry / 14;
      const landingY = SHELF_GEOMETRY.groundY + loose.ball.contactHeight;
      const launch = toWorldDirection({
        x: (dir.x * carry) / flightTime,
        y:
          (landingY -
            loose.position.y +
            0.5 * GOLF_GRAVITY * flightTime * flightTime) /
          flightTime,
        z: (dir.z * carry) / flightTime,
      });
      const strikePosition = toWorld(loose.position);
      const horizontalSpeed = Math.hypot(launch.x, launch.z);
      const response = meadowPhysicalResponse({
        normalSpeed: 0,
        tangentSpeed: horizontalSpeed,
        massKg: loose.ball.massKg,
        footprint: loose.ball.radius * 2,
      });
      publishMeadowPhysicalEvent({
        kind: "impact",
        startX: strikePosition.x,
        startZ: strikePosition.z,
        endX: strikePosition.x,
        endZ: strikePosition.z,
        y: strikePosition.y,
        directionX: horizontalSpeed > 1e-5 ? launch.x / horizontalSpeed : 0,
        directionZ: horizontalSpeed > 1e-5 ? launch.z / horizontalSpeed : 0,
        ...response,
      });
      loose.ball.strike(new THREE.Vector3(launch.x, launch.y, launch.z));
      sceneAudio.play("golf-strike", strikePosition, 0.9);
      loose.phase = "struck";
      loose.struckFor = 0;
    },
    [cup, surfaceAt, toWorld, toWorldDirection],
  );

  useEffect(() => {
    const unregister: Array<() => void> = [];
    if (club.current) {
      unregister.push(
        registerSceneInteraction({
          id: "golf-club:strike",
          label: "Swing golf club",
          showLabel: false,
          root: club.current,
          activeUnits: [index],
          touchPriority: 30,
          activateOnFirstTouch: true,
          projectedLocalBounds: GOLF_CLUB_PROJECTED_LOCAL_BOUNDS,
          activation: {
            kind: "action",
            label: "Swing golf club",
            run: tapClub,
          },
          hover: { kind: "none" },
        }),
      );
    }
    return () => unregister.forEach((run) => run());
  }, [index, tapClub]);

  const restoreAuthoredState = useCallback(() => {
    resetGolfSession(balls.current, queue.current, stepper.current);
    for (const loose of looseBalls.current.values()) {
      if (loose.slot) loose.ball.show();
      loose.slot = null;
      loose.phase = "away";
    }
    setLabelVisible(false);
    setConfettiActive(false);
    window.clearTimeout(labelTimer.current);
    window.clearTimeout(confettiTimer.current);
    if (club.current) {
      club.current.position.copy(CLUB_REST_PIVOT);
      club.current.rotation.set(-0.08, 0.04, 0, "YXZ");
    }
    clubHint.current = 0;
    if (clubVisual.current)
      clubVisual.current.rotation.set(0, GOLF_CLUB_MODEL_YAW, 0);
  }, []);

  useEffect(() => {
    return () => {
      if (shouldResetGolfSession("unmount")) restoreAuthoredState();
    };
  }, [restoreAuthoredState]);

  useEffect(() => {
    const hooks = window.__stacks;
    if (!hooks) return;
    hooks.golf = {
      state: () => ({
        queue: queue.current.snapshot(),
        balls: balls.current.map((ball) => ({
          id: ball.id,
          phase: ball.phase,
          outcome: ball.outcome,
          position: { ...ball.position },
          holed: ball.holed,
        })),
        shotBag: bag.current.snapshot(),
        reducedMotion: !motion.clubSwing,
      }),
      forceNext: (outcome) => bag.current.force(outcome),
      // The loose props the bay is watching, and a way to tap one without a
      // pointer, so a headless run can prove the handoff end to end.
      loose: () =>
        [...looseBalls.current.values()].map((loose) => {
          const bottom = {
            ...loose.position,
            y: loose.position.y - loose.ball.contactHeight,
          };
          return {
            id: loose.id,
            golf: loose.golf,
            slot: loose.slot,
            phase: loose.phase,
            position: { ...loose.position },
            world: toWorld(loose.position),
            still: loose.ball.still(),
            teed: inGolfHittingBay(bottom),
          };
        }),
      tapLoose: (key) => tapLooseBall(key),
    };
    return () => {
      if (window.__stacks) delete window.__stacks.golf;
    };
  }, [motion.clubSwing, tapLooseBall, toWorld]);

  useFrame((_, delta) => {
    if (document.hidden) {
      stepper.current.clear();
      return;
    }
    const stacks = useStacks.getState();
    const active = stacks.golfFocused;

    // Which of the Grabbable spheres are teed up in the bay this frame.
    const registered = hittableBallsFor(index);
    for (const key of looseBalls.current.keys())
      if (!registered.some((ball) => ball.key === key))
        looseBalls.current.delete(key);
    for (const ball of registered) {
      let loose = looseBalls.current.get(ball.key);
      if (!loose) {
        loose = {
          id: ball.key,
          ball,
          golf: ball.golf === true,
          slot: null,
          phase: "away",
          position: { x: 0, y: 0, z: 0 },
          struckFor: 0,
        };
        looseBalls.current.set(ball.key, loose);
      }
      loose.ball = ball;
      const bottom = toLocal(ball.bottom(looseWorld));
      loose.position = hittableContactPoint(bottom, ball.contactHeight);
      const still = ball.still();
      const teed = still && inGolfHittingBay(bottom);
      if (loose.phase === "away") {
        if (teed) loose.phase = "ready";
      } else if (loose.phase === "ready") {
        if (!teed) loose.phase = "away";
      } else if (loose.phase === "struck") {
        loose.struckFor += delta;
        // Away once it has actually left, or after a second if the solver
        // never took the strike, so a ball cannot get stuck unhittable.
        if (!still || loose.struckFor > 1) loose.phase = "away";
      }
    }

    const pendingStrike = queue.current.snapshot();
    const followRequested = golfClubPointerFollowRequested(
      active,
      pendingStrike,
    );
    clubHint.current = THREE.MathUtils.damp(
      clubHint.current,
      followRequested ? 1 : 0,
      10,
      Math.min(delta, 0.05),
    );
    clubPointer.current.x = THREE.MathUtils.damp(
      clubPointer.current.x,
      followRequested ? clubPointerTarget.current.x : 0,
      8,
      Math.min(delta, 0.05),
    );
    clubPointer.current.y = THREE.MathUtils.damp(
      clubPointer.current.y,
      followRequested ? clubPointerTarget.current.y : 0,
      8,
      Math.min(delta, 0.05),
    );
    if (shouldAdvanceGolfStrike(active, pendingStrike)) {
      const impact = queue.current.advance(Math.min(delta, 0.1));
      const strike = queue.current.snapshot();
      const struckLoose = impact ? looseBalls.current.get(impact) : undefined;
      if (struckLoose) strikeLooseBall(struckLoose);
      animateClub(
        club.current,
        clubVisual.current,
        strike,
        [...balls.current, ...looseBalls.current.values()],
        cup,
        !motion.clubSwing,
      );
      const idleBlend = golfClubIdleBlend(strike);
      if (club.current && idleBlend > 0 && motion.clubSwing) {
        const hint = golfClubHintRotation(
          clubHint.current * idleBlend,
          clubPointer.current.x,
          clubPointer.current.y,
        );
        club.current.rotation.x += hint.x;
        club.current.rotation.y += hint.y;
        club.current.rotation.z += hint.z;
        club.current.position.y += hint.lift;
      }
    }
    stepper.current.advance(delta, (dt) =>
      stepGolfWorld(balls.current, world, dt),
    );

    for (const ball of balls.current) {
      const trail = ballTrails.current[ball.id];
      const tangentSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
      if (ball.phase === "roll" && tangentSpeed >= MEADOW_TRAIL.minSpeed) {
        trail.elapsed += Math.min(delta, 0.1);
        const distance = Math.hypot(
          ball.position.x - trail.x,
          ball.position.z - trail.z,
        );
        if (meadowTrailReady(trail.elapsed, distance, tangentSpeed)) {
          const worldPosition = toWorld(ball.position);
          const worldDirection = toWorldDirection(ball.velocity);
          const response = meadowPhysicalResponse({
            normalSpeed: 0,
            tangentSpeed,
            massKg: GOLF_BALL_MASS_KG,
            footprint: ball.radius * 2,
            trailing: true,
          });
          const worldStart = toWorld({
            x: trail.x,
            y: ball.position.y,
            z: trail.z,
          });
          publishMeadowPhysicalEvent({
            kind: "trail",
            startX: worldStart.x,
            startZ: worldStart.z,
            endX: worldPosition.x,
            endZ: worldPosition.z,
            y: worldPosition.y,
            directionX: worldDirection.x / tangentSpeed,
            directionZ: worldDirection.z / tangentSpeed,
            ...response,
          });
          trail.x = ball.position.x;
          trail.z = ball.position.z;
          trail.elapsed = 0;
        }
      } else {
        trail.x = ball.position.x;
        trail.z = ball.position.z;
        trail.elapsed = 0;
      }
      const group = ballGroups.current[ball.id];
      const material = ballMaterials.current[ball.id];
      const visibleOpacity = golfBallCupOpacity(ball, cup.y, meadowVisible);
      if (group) {
        group.visible = !GHOST_HIDDEN_PHASES.has(ball.phase);
        const visualScale = golfBallRenderedScale(
          golfBallVisualScale(ball, cup),
          gl.getPixelRatio(),
        );
        group.position.set(
          ball.position.x,
          ball.position.y - ball.radius * (1 - visualScale),
          ball.position.z,
        );
        group.scale.setScalar(visualScale);
        const spin = ballSpins.current[ball.id];
        if (spin) {
          const step = golfVisualSpinStep(ball.angularVelocity, delta);
          spin.rotation.x += step.x;
          spin.rotation.y += step.y;
          spin.rotation.z += step.z;
        }
      }
      if (material) material.opacity = visibleOpacity;
      const mark = ballMarks.current[ball.id];
      if (mark) mark.opacity = visibleOpacity;
      const glint = glints.current[ball.id];
      if (glint) {
        const speed = Math.hypot(
          ball.velocity.x,
          ball.velocity.y,
          ball.velocity.z,
        );
        glint.visible = motion.glint && speed > 1.4 && visibleOpacity > 0.2;
        (glint.material as THREE.MeshBasicMaterial).opacity = Math.min(
          0.32,
          speed * 0.025,
        );
      }
    }
    puffs.current.forEach((puff) => {
      if (!puff.mesh || puff.age >= 1.2) return;
      puff.age += delta;
      puff.mesh.scale.setScalar(0.45 + puff.age * 1.2);
      puff.mesh.position.y += delta * 0.08;
      (puff.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        0.2 * (1 - puff.age / 1.2),
      );
      if (puff.age >= 1.2) puff.mesh.visible = false;
    });
  });

  return (
    <group name="training-golf-experience">
      <group
        ref={club}
        position={CLUB_REST_PIVOT}
        rotation={[-0.08, 0.04, 0, "YXZ"]}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          if ((event.delta ?? 0) > 6) return;
          event.stopPropagation();
          tapClub();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          useStacks.getState().setHovered("golf-club:strike");
        }}
        onPointerOut={() => useStacks.getState().setHovered(null)}
      >
        <group
          ref={clubVisual}
          position={[0, -GOLF_CLUB_GRIP_HEIGHT, 0]}
          rotation={[0, GOLF_CLUB_MODEL_YAW, 0]}
        >
          <InteractionClaim>
            <React.Suspense fallback={null}>
              <ModelProp
                url="/models/golf-club.glb"
                dark={dark}
                variant="tinted"
                tints={{
                  M_PCL_Flat_Black: palette.hub,
                  M_PCL_Flat_Grey_Light: dark
                    ? GOLF_CLUB_FINISH.dark
                    : GOLF_CLUB_FINISH.light,
                  M_PCL_Flat_White_Darker: dark
                    ? GOLF_CLUB_FINISH.groovesDark
                    : GOLF_CLUB_FINISH.groovesLight,
                }}
                materialProperties={{
                  M_PCL_Flat_Grey_Light: {
                    metalness: GOLF_CLUB_FINISH.metalness,
                    roughness: GOLF_CLUB_FINISH.roughness,
                  },
                  M_PCL_Flat_White_Darker: {
                    metalness: 0.52,
                    roughness: 0.24,
                  },
                }}
                scale={GOLF_CLUB_SCALE}
              />
            </React.Suspense>
          </InteractionClaim>
        </group>
        <mesh position={[0, -GOLF_CLUB_GRIP_HEIGHT / 2, 0]}>
          <cylinderGeometry args={[0.22, 0.22, GOLF_CLUB_GRIP_HEIGHT, 10]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh position={[0, -GOLF_CLUB_GRIP_HEIGHT + 0.09, 0]}>
          <boxGeometry args={[0.34, 0.24, 0.38]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      {GOLF_BALL_IDS.map((id) => (
        <group
          key={id}
          ref={(group) => {
            ballGroups.current[id] = group;
          }}
          position={[
            GOLF_BALL_STARTS[id].x,
            GOLF_BALL_STARTS[id].y,
            GOLF_BALL_STARTS[id].z,
          ]}
          visible={false}
          // The ghost: rendered only in flight and on the green. It owns no
          // pointer handling; the GolfBallProp below is what you touch.
          raycast={() => null}
        >
          <group
            ref={(group) => {
              ballSpins.current[id] = group;
            }}
          >
            <mesh castShadow dispose={null} geometry={BALL_GEOMETRY}>
              <meshStandardMaterial
                ref={(material) => {
                  ballMaterials.current[id] = material;
                }}
                bumpMap={BALL_BUMP}
                bumpScale={0.01}
                color={dark ? GOLF_BALL_FINISH.dark : palette.pages}
                fog={GOLF_BALL_FINISH.fog}
                metalness={0}
                roughness={
                  dark
                    ? GOLF_BALL_FINISH.darkRoughness
                    : GOLF_BALL_FINISH.lightRoughness
                }
                transparent
              />
            </mesh>
            <mesh position={[0, 0, 0.0504]}>
              <planeGeometry args={[0.035, 0.006]} />
              <meshBasicMaterial
                ref={(material) => {
                  ballMarks.current[id] = material;
                }}
                color={dark ? GOLF_BALL_FINISH.darkMark : "#33434e"}
                fog={GOLF_BALL_FINISH.fog}
                toneMapped={false}
                transparent
              />
            </mesh>
          </group>
          <mesh
            ref={(mesh) => {
              glints.current[id] = mesh;
            }}
            visible={false}
            position={[0.028, 0.03, 0.018]}
          >
            <sphereGeometry args={[0.012, 8, 8]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      {/* The golf balls you can pick up. Ball one rests on the planted tee
          until that tee is pulled, then settles to the ground beside it. */}
      {GOLF_BALL_IDS.map((id) => {
        const start =
          id === "one" && plantedTeeRemoved
            ? GOLF_BALL_UNTEED_START
            : GOLF_BALL_STARTS[id];
        return (
          <GolfBallProp
            key={id}
            unitIndex={index}
            palette={palette}
            dark={dark}
            id={id}
            base={[start.x, start.y - GOLF_BALL_RADIUS, start.z]}
            standsOn="floor"
          />
        );
      })}

      {puffs.current.map((_, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            puffs.current[index]!.mesh = mesh;
          }}
          visible={false}
          rotation={[-Math.PI / 2, 0, index]}
        >
          <circleGeometry args={[0.12, 12]} />
          <meshBasicMaterial
            color={dark ? "#736a54" : "#c2b488"}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}

      <ConfettiBurst
        origin={cup}
        serial={celebration}
        suppressed={!motion.confetti}
        active={confettiActive}
      />
      {meadowVisible &&
        motion.staticCupGlow &&
        celebration > 0 &&
        labelVisible && (
          <mesh
            position={[cup.x, cup.y + 0.012, cup.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry
              args={[GOLF_CUP.radius * 1.2, GOLF_CUP.radius * 1.85, 32]}
            />
            <meshBasicMaterial
              color="#f5d86c"
              transparent
              opacity={0.72}
              toneMapped={false}
            />
          </mesh>
        )}
      {labelVisible && (
        <Html
          position={[cup.x, cup.y + 0.72, cup.z]}
          center
          distanceFactor={8}
          style={{ pointerEvents: "none" }}
        >
          <div className="whitespace-nowrap rounded-full bg-black/55 px-3 py-1 font-serif text-sm text-white shadow-sm backdrop-blur-sm">
            Hole in one!
          </div>
          <span className="sr-only" role="status" aria-live="polite">
            Hole in one!
          </span>
        </Html>
      )}
    </group>
  );
}

function animateClub(
  group: THREE.Group | null,
  visual: THREE.Group | null,
  strike: ReturnType<GolfStrikeQueue["snapshot"]>,
  balls: ReadonlyArray<{ id: string; position: GolfVec3 }>,
  cup: GolfVec3,
  still: boolean,
) {
  if (!group) return;
  const ball = still
    ? null
    : (balls.find((candidate) => candidate.id === strike.current)?.position ??
      null);
  const pose = golfClubPose(
    still
      ? { current: null, queued: strike.queued, elapsed: 0, stage: "idle" }
      : strike,
    ball,
    cup,
  );
  group.position.set(pose.position.x, pose.position.y, pose.position.z);
  group.rotation.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, "YXZ");
  if (visual) visual.rotation.set(0, GOLF_CLUB_MODEL_YAW + pose.shaftTwist, 0);
}
