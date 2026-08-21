"use client";

import { sceneAudio } from "../../audio/sceneAudio";
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
import {
  createDimpledGolfBallGeometry,
  createGolfBallBumpTexture,
} from "../units/trainingGolfBall";
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

import { golfClubHintRotation, golfClubPose } from "./golfClubRig";
import { GOLF_CUP, GOLF_FLAG_LOCAL, golfSurfaceAt } from "./golfCourse";
import {
  GOLF_BALL_IDS,
  GOLF_BALL_STARTS,
  GOLF_CLUB_GRIP_HEIGHT,
  GOLF_CLUB_MODEL_YAW,
  GOLF_CLUB_REST_BASE,
  GOLF_CLUB_SCALE,
} from "./golfLayout";
import {
  GOLF_BALL_RADIUS,
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
  nextReadyGolfBall,
  shouldAdvanceGolfStrike,
} from "./golfStrikeQueue";
import { planGolfTrajectory } from "./golfTrajectory";
import type {
  GolfBallId,
  GolfBallState,
  GolfPhysicsEvent,
  GolfVec3,
} from "./golfTypes";

const BALL_GEOMETRY = createDimpledGolfBallGeometry();
const BALL_BUMP = createGolfBallBumpTexture();
const CLUB_REST_PIVOT = new THREE.Vector3(
  GOLF_CLUB_REST_BASE.x,
  GOLF_CLUB_REST_BASE.y + GOLF_CLUB_GRIP_HEIGHT,
  GOLF_CLUB_REST_BASE.z,
);
const CONFETTI_DUMMY = new THREE.Object3D();
const GOLF_BALL_MASS_KG = 0.046;
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
}: Pick<UnitProps, "palette" | "dark" | "index">) {
  const gl = useThree((state) => state.gl);
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
  const stepper = useRef(new GolfFixedStepper());
  const queue = useRef(new GolfStrikeQueue());
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
        if (motion.turfPuff) {
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
        celebrate(event.position);
      } else if (event.type === "reset") {
        const ball = balls.current.find(
          (candidate) => candidate.id === event.ballId,
        );
        if (ball?.outcome === "hole-bound" && !event.holed)
          bag.current.retryWinner();
        queue.current.release(event.ballId);
      }
    },
    [celebrate, motion.turfPuff, toWorld, toWorldDirection],
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

  const tapBall = useCallback((id: GolfBallId) => {
    if (!useStacks.getState().golfFocused) return;
    const ball = balls.current.find((candidate) => candidate.id === id);
    if (ball?.phase !== "ready" || !queue.current.tap(id)) return;
    ball.phase = "queued";
  }, []);

  const tapClub = useCallback(() => {
    const available = nextReadyGolfBall(balls.current, GOLF_BALL_IDS);
    if (available) tapBall(available);
  }, [tapBall]);

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
          projectedLocalBounds: {
            min: [-0.34, -GOLF_CLUB_GRIP_HEIGHT - 0.18, -0.34],
            max: [0.4, 0.25, 0.4],
          },
          activation: {
            kind: "action",
            label: "Swing golf club",
            run: tapClub,
          },
          hover: { kind: "none" },
        }),
      );
    }
    for (const id of GOLF_BALL_IDS) {
      const root = ballGroups.current[id];
      if (!root) continue;
      unregister.push(
        registerSceneInteraction({
          id: `golf-ball:${id}`,
          label: "Hit golf ball",
          showLabel: false,
          root,
          activeUnits: [index],
          touchPriority: 40,
          activateOnFirstTouch: true,
          projectedLocalBounds: {
            min: [-0.22, -0.22, -0.22],
            max: [0.22, 0.22, 0.22],
          },
          activation: {
            kind: "action",
            label: "Hit golf ball",
            run: () => tapBall(id),
          },
          hover: { kind: "none" },
        }),
      );
    }
    return () => unregister.forEach((run) => run());
  }, [index, tapBall, tapClub]);

  const restoreAuthoredState = useCallback(() => {
    resetGolfSession(balls.current, queue.current, stepper.current);
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
    };
    return () => {
      if (window.__stacks) delete window.__stacks.golf;
    };
  }, [motion.clubSwing]);

  useFrame((_, delta) => {
    if (document.hidden) {
      stepper.current.clear();
      return;
    }
    const stacks = useStacks.getState();
    const active = stacks.golfFocused;
    const pendingStrike = queue.current.snapshot();
    const hintedInteraction = stacks.focusedInteraction ?? stacks.hovered ?? "";
    const hintRequested =
      active &&
      (hintedInteraction.startsWith("golf-club:") ||
        hintedInteraction.startsWith("golf-ball:")) &&
      pendingStrike.current === null &&
      pendingStrike.queued.length === 0;
    clubHint.current = THREE.MathUtils.damp(
      clubHint.current,
      hintRequested ? 1 : 0,
      10,
      Math.min(delta, 0.05),
    );
    if (shouldAdvanceGolfStrike(active, pendingStrike)) {
      const impact = queue.current.advance(Math.min(delta, 0.1));
      const strike = queue.current.snapshot();
      if (strike.current) {
        const ball = balls.current.find(
          (candidate) => candidate.id === strike.current,
        )!;
        if (ball.phase === "queued") ball.phase = "addressed";
      }
      if (impact) {
        const ball = balls.current.find(
          (candidate) => candidate.id === impact,
        )!;
        const outcome = bag.current.next();
        const trajectory = planGolfTrajectory(
          ball.position,
          cup,
          outcome,
          Math.random,
          (x, z) => surfaceAt(x, z).height,
        );
        const strikePosition = toWorld(ball.position);
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
        launchGolfBall(ball, trajectory.velocity, outcome);
        sceneAudio.play("golf-strike", toWorld(ball.position), 0.9);
      }
      animateClub(
        club.current,
        clubVisual.current,
        strike,
        balls.current,
        cup,
        !motion.clubSwing,
      );
      if (
        club.current &&
        !strike.current &&
        strike.queued.length === 0 &&
        motion.clubSwing
      ) {
        const hint = golfClubHintRotation(clubHint.current);
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
      if (group) {
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
      if (material) material.opacity = ball.opacity;
      const mark = ballMarks.current[ball.id];
      if (mark) mark.opacity = ball.opacity;
      const glint = glints.current[ball.id];
      if (glint) {
        const speed = Math.hypot(
          ball.velocity.x,
          ball.velocity.y,
          ball.velocity.z,
        );
        glint.visible = motion.glint && speed > 1.4 && ball.opacity > 0.2;
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
          onClick={(event: ThreeEvent<MouseEvent>) => {
            if ((event.delta ?? 0) > 6) return;
            event.stopPropagation();
            tapBall(id);
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            useStacks.getState().setHovered(`golf-ball:${id}`);
          }}
          onPointerOut={() => useStacks.getState().setHovered(null)}
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
          <mesh userData={{ physicsIgnore: true }}>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}

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
      {motion.staticCupGlow && celebration > 0 && labelVisible && (
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
  balls: GolfBallState[],
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
