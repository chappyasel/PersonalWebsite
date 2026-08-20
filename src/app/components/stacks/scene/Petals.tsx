"use client";

// Loose flower petals on the wind, visible in both themes.
//
// Petals are passive evidence of the meadow's weather, not tiny wildlife.
// Forty-nine deterministic residents are sourced from real flower and seed
// heads across the seven Units. A small fixed-step state machine lets them
// loosen, lift, tumble, settle into grass, and occasionally re-enter a gust.
// The camera only chooses which residents enter the one instanced draw; it
// never changes their world positions.
import { UNIT_COUNT } from "../data";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { golfSurfaceAt } from "./golf/golfCourse";
import {
  getMeadowDisturbance,
  visitMeadowImpactsSince,
} from "./meadowDisturbance";
import { buildFlowerPositions, meadowHeight } from "./meadowField";
import { shelfBackEdgeAt } from "./meadowInteraction";
import {
  PETALS_PER_UNIT,
  PETAL_FIXED_STEP,
  PETAL_MAX_FRAME_DELTA,
  type PetalMotion,
  type PetalPhase,
  type PetalSource,
  advancePetal,
  burstPetal,
  createPetalMotion,
  disturbPetal,
  impulsePetal,
  petalNoise,
  petalRenderScale,
  petalShockwaveImpulse,
} from "./petalMotion";
import { UNIT_SPACING } from "./worldLayout";

/** A petal, not a leaf: 2 × 3 cm at the meadow's scale. */
const PETAL_W = 0.02;
const PETAL_H = 0.03;
const SOURCE_HALF_WIDTH = 2.15;
const SOURCE_MIN_Z = -4.5;
const SOURCE_MAX_Z = 3.4;
const SHELF_CLEARANCE = 0.08;
const SOURCE_SPACING = 0.239;
const VISIBLE_X_RADIUS = 7.2;
const VISIBLE_Z_MIN = -4.5;
const VISIBLE_Z_MAX = 4.2;
const DARK_LAMBDA = 3.5;
const AMBIENT_ACTIVE_PER_UNIT = 2;
const PETAL_DRAG_RADIUS = 0.85;

const PETAL_COLORS = {
  cornflower: {
    light: new THREE.Color("#8b9be0"),
    dark: new THREE.Color("#6672aa"),
  },
  poppy: {
    light: new THREE.Color("#e8a25e"),
    dark: new THREE.Color("#8b6254"),
  },
  cream: {
    light: new THREE.Color("#f2e8d2"),
    dark: new THREE.Color("#aaa397"),
  },
} as const;

/** One low-poly, gently cupped petal shared by every resident. */
function createPetalGeometry() {
  const halfW = PETAL_W * 0.5;
  const halfH = PETAL_H * 0.5;
  const rows = [
    { y: -halfH, width: 0, fold: 0 },
    { y: -halfH * 0.72, width: halfW * 0.4, fold: 0.0006 },
    { y: -halfH * 0.3, width: halfW * 0.8, fold: 0.0018 },
    { y: halfH * 0.2, width: halfW, fold: 0.0028 },
    { y: halfH * 0.67, width: halfW * 0.74, fold: 0.0018 },
    { y: halfH * 0.93, width: halfW * 0.3, fold: 0.0007 },
    { y: halfH, width: 0, fold: 0 },
  ];
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row < rows.length; row++) {
    const current = rows[row]!;
    positions.push(-current.width, current.y, 0);
    positions.push(
      Math.sin((row / (rows.length - 1)) * Math.PI) * 0.00045,
      current.y,
      current.fold,
    );
    positions.push(current.width * 0.88, current.y, 0);
    const endFade = Math.sin((row / (rows.length - 1)) * Math.PI);
    colors.push(0.7, 0.7, 0.7);
    colors.push(
      0.82 + 0.18 * endFade,
      0.82 + 0.18 * endFade,
      0.82 + 0.18 * endFade,
    );
    colors.push(0.74, 0.74, 0.74);
    if (row === rows.length - 1) continue;
    const here = row * 3;
    const next = here + 3;
    indices.push(
      here,
      next,
      here + 1,
      here + 1,
      next,
      next + 1,
      here + 1,
      next + 1,
      here + 2,
      here + 2,
      next + 1,
      next + 2,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Keep each species recognizable at night without letting an unlit basic
 * material glow at its daytime value. The damped blend matches the rest of
 * the meadow's theme transition.
 */
export function petalColorForTheme(
  tint: number,
  darkAmount: number,
  target = new THREE.Color(),
) {
  const colors =
    tint < 0.55
      ? PETAL_COLORS.cornflower
      : tint < 0.75
        ? PETAL_COLORS.poppy
        : PETAL_COLORS.cream;
  return target.copy(colors.light).lerp(colors.dark, darkAmount);
}

/**
 * Seven well-separated, deterministic donor heads per Unit. The occasional
 * pale seed-head resident reads as windblown chaff; heads suppressed by the
 * golf surface mask cannot produce anything.
 */
export function buildPetalSources(): PetalSource[] {
  const flowers = buildFlowerPositions();
  const sources: PetalSource[] = [];
  for (let unitIndex = 0; unitIndex < UNIT_COUNT; unitIndex += 1) {
    const centerX = unitIndex * UNIT_SPACING;
    const candidates: number[] = [];
    for (let index = 0; index < flowers.count; index += 1) {
      const x = flowers.x[index]!;
      const z = flowers.z[index]!;
      if (
        Math.abs(x - centerX) <= SOURCE_HALF_WIDTH &&
        z >= SOURCE_MIN_Z &&
        z <= SOURCE_MAX_Z &&
        z >= shelfBackEdgeAt(x) + SHELF_CLEARANCE &&
        golfSurfaceAt(x, z) === "rough"
      )
        candidates.push(index);
    }
    candidates.sort(
      (a, b) =>
        petalNoise(a, unitIndex * 19 + 101) -
        petalNoise(b, unitIndex * 19 + 101),
    );

    const selected: number[] = [];
    for (const index of candidates) {
      if (
        selected.every(
          (other) =>
            Math.hypot(
              flowers.x[index]! - flowers.x[other]!,
              flowers.z[index]! - flowers.z[other]!,
            ) >= SOURCE_SPACING,
        )
      )
        selected.push(index);
      if (selected.length === PETALS_PER_UNIT) break;
    }
    // The authored field currently clears the spacing rule in every Unit.
    // Keep a deterministic fallback so future density edits cannot delete a
    // resident population from one shelf.
    for (const index of candidates) {
      if (selected.length === PETALS_PER_UNIT) break;
      if (!selected.includes(index)) selected.push(index);
    }
    for (const index of selected) {
      sources.push({
        unitIndex,
        x: flowers.x[index]!,
        y: flowers.y[index]! + 0.036,
        z: flowers.z[index]!,
        tint: flowers.tint[index]!,
      });
    }
  }
  return sources;
}

function nearestPassivePetal(
  motions: readonly PetalMotion[],
  x: number,
  z: number,
  radius: number,
  excluded: number,
) {
  let best = -1;
  let bestDistance = radius;
  for (let index = 0; index < motions.length; index += 1) {
    if (index === excluded || motions[index]!.phase === "airborne") continue;
    const motion = motions[index]!;
    const distance = Math.hypot(motion.position.x - x, motion.position.z - z);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

const DUMMY = new THREE.Object3D();
const INSTANCE_COLOR = new THREE.Color();
const RENDER_PHASES: readonly PetalPhase[] = [
  "airborne",
  "loosening",
  "settled",
];

function PetalField({
  dark,
  visibleLimit,
}: {
  dark: boolean;
  visibleLimit: number;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => createPetalGeometry(), []);
  const sources = useMemo(() => buildPetalSources(), []);
  const initialMotions = useMemo(
    () => sources.map((source, index) => createPetalMotion(index, source)),
    [sources],
  );
  const motions = useRef(initialMotions);
  const accumulator = useRef(0);
  const simulationTime = useRef(0);
  const darkAmount = useRef(dark ? 1 : 0);
  const activeByUnit = useMemo(() => new Uint8Array(UNIT_COUNT), []);
  const handledPulses = useRef(
    new Float64Array(getMeadowDisturbance().pulses.length).fill(-1),
  );
  const pulseTouches = useRef(
    Array.from({ length: getMeadowDisturbance().pulses.length }, () =>
      new Float64Array(initialMotions.length).fill(-1),
    ),
  );
  const handledImpact = useRef(getMeadowDisturbance().impact.revision);
  const lastBrushRelease = useRef(-Infinity);

  useEffect(() => {
    const instance = mesh.current;
    if (!instance) return;
    DUMMY.scale.setScalar(0);
    DUMMY.updateMatrix();
    for (let index = 0; index < motions.current.length; index += 1) {
      instance.setMatrixAt(index, DUMMY.matrix);
      instance.setColorAt(
        index,
        petalColorForTheme(
          motions.current[index]!.source.tint,
          darkAmount.current,
          INSTANCE_COLOR,
        ),
      );
    }
    instance.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instance.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    instance.instanceMatrix.needsUpdate = true;
    if (instance.instanceColor) instance.instanceColor.needsUpdate = true;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ camera }, delta) => {
    const instance = mesh.current;
    if (!instance) return;
    darkAmount.current = THREE.MathUtils.damp(
      darkAmount.current,
      dark ? 1 : 0,
      DARK_LAMBDA,
      delta,
    );
    accumulator.current += Math.min(delta, PETAL_MAX_FRAME_DELTA);
    const disturbance = getMeadowDisturbance();
    while (accumulator.current >= PETAL_FIXED_STEP) {
      accumulator.current -= PETAL_FIXED_STEP;
      simulationTime.current += PETAL_FIXED_STEP;
      const time = simulationTime.current;

      handledImpact.current = visitMeadowImpactsSince(
        handledImpact.current,
        (impact) => {
          const groundY = meadowHeight(impact.x, impact.z);
          if (
            visibleLimit > 7 &&
            impact.strength > 0 &&
            impact.y <= groundY + 0.18
          ) {
            const radius = 0.55 + impact.strength * 0.25;
            const releaseCount = impact.strength >= 0.55 ? 2 : 1;
            let first = -1;
            for (let release = 0; release < releaseCount; release += 1) {
              const index = nearestPassivePetal(
                motions.current,
                impact.x,
                impact.z,
                radius,
                first,
              );
              if (index < 0) break;
              if (first < 0) first = index;
              disturbPetal(
                motions.current[index]!,
                time,
                impact.x,
                impact.z,
                radius,
                impact.directionX,
                impact.directionZ,
                Math.max(0.12, impact.strength * 0.2),
              );
            }
          }
        },
      );

      // A click first lifts at most two nearby petals, then the meadow's real
      // expanding ring reaches every other petal once. This makes the flower
      // and loose-petal responses read as one shockwave without repeatedly
      // accelerating residents inside the completed disk.
      if (visibleLimit > 7) {
        for (let layer = 0; layer < disturbance.pulses.length; layer += 1) {
          const pulse = disturbance.pulses[layer]!;
          if (pulse.startedAt < 0 || pulse.strength <= 0) continue;
          if (pulse.startedAt !== handledPulses.current[layer]) {
            handledPulses.current[layer] = pulse.startedAt;
            let first = -1;
            for (let release = 0; release < 2; release += 1) {
              const index = nearestPassivePetal(
                motions.current,
                pulse.x,
                pulse.z,
                0.9,
                first,
              );
              if (index < 0) break;
              if (first < 0) first = index;
              burstPetal(
                motions.current[index]!,
                time,
                pulse.x,
                pulse.z,
                0.9,
                0.17,
              );
            }
          }

          const touches = pulseTouches.current[layer]!;
          const band = 0.11 + pulse.radius * 0.07;
          for (let index = 0; index < motions.current.length; index += 1) {
            if (touches[index] === pulse.startedAt) continue;
            const motion = motions.current[index]!;
            const dx = motion.position.x - pulse.x;
            const dz = motion.position.z - pulse.z;
            const distance = Math.hypot(dx, dz);
            const waveStrength = petalShockwaveImpulse(
              distance,
              pulse.radius,
              band,
              pulse.strength,
            );
            if (waveStrength <= 0) continue;
            touches[index] = pulse.startedAt;
            impulsePetal(
              motion,
              time,
              distance > 1e-5 ? dx / distance : 0,
              distance > 1e-5 ? dz / distance : -1,
              Math.max(0.035, waveStrength),
            );
          }
        }

        // Petals are lighter and less rooted than grass, so they feel a wider
        // wake than the visible stem bend. The cooldown keeps a long drag from
        // becoming a continuous emitter while airborne residents entrain.
        if (disturbance.brushStrength > 0.025) {
          const dragStrength = Math.min(0.3, disturbance.brushStrength * 1.35);
          for (const motion of motions.current) {
            if (motion.phase !== "airborne") continue;
            disturbPetal(
              motion,
              time,
              disturbance.brushX,
              disturbance.brushZ,
              PETAL_DRAG_RADIUS,
              disturbance.directionX,
              disturbance.directionZ,
              dragStrength,
            );
          }
          if (time - lastBrushRelease.current >= 0.35) {
            const index = nearestPassivePetal(
              motions.current,
              disturbance.brushX,
              disturbance.brushZ,
              PETAL_DRAG_RADIUS,
              -1,
            );
            if (
              index >= 0 &&
              disturbPetal(
                motions.current[index]!,
                time,
                disturbance.brushX,
                disturbance.brushZ,
                PETAL_DRAG_RADIUS,
                disturbance.directionX,
                disturbance.directionZ,
                dragStrength,
              )
            )
              lastBrushRelease.current = time;
          }
        }
      }

      activeByUnit.fill(0);
      for (const motion of motions.current)
        if (motion.phase === "airborne" || motion.phase === "loosening")
          activeByUnit[motion.source.unitIndex]! += 1;
      for (const motion of motions.current) {
        const wasActive =
          motion.phase === "airborne" || motion.phase === "loosening";
        advancePetal(motion, {
          time,
          step: PETAL_FIXED_STEP,
          groundY: meadowHeight(motion.position.x, motion.position.z),
          // Ambient weather releases at most two residents per Unit. Direct
          // interaction may briefly add another member to a coherent gust.
          canRelease:
            (activeByUnit[motion.source.unitIndex] ?? 0) <
            AMBIENT_ACTIVE_PER_UNIT,
          windAmplitude: disturbance.windAmplitude || undefined,
          backstopZ: shelfBackEdgeAt(motion.position.x) + SHELF_CLEARANCE,
        });
        const isActive =
          motion.phase === "airborne" || motion.phase === "loosening";
        if (!wasActive && isActive) activeByUnit[motion.source.unitIndex]! += 1;
      }
    }

    // Pack only nearby visible residents into the front of the instance
    // buffer. The simulation remains world-resident; this is culling, not
    // camera attachment. Airborne motion wins the budget before quiet rests.
    const time = simulationTime.current;
    let written = 0;
    for (const phase of RENDER_PHASES) {
      for (const motion of motions.current) {
        if (written >= visibleLimit || motion.phase !== phase) continue;
        if (
          Math.abs(motion.position.x - camera.position.x) > VISIBLE_X_RADIUS ||
          motion.position.z < VISIBLE_Z_MIN ||
          motion.position.z > VISIBLE_Z_MAX
        )
          continue;
        const scale = petalRenderScale(motion, time);
        if (scale <= 0.001) continue;
        DUMMY.position.set(
          motion.position.x,
          motion.position.y,
          motion.position.z,
        );
        DUMMY.rotation.set(
          motion.rotation.x,
          motion.rotation.y,
          motion.rotation.z,
        );
        DUMMY.scale.setScalar(scale);
        DUMMY.updateMatrix();
        instance.setMatrixAt(written, DUMMY.matrix);
        instance.setColorAt(
          written,
          petalColorForTheme(
            motion.source.tint,
            darkAmount.current,
            INSTANCE_COLOR,
          ),
        );
        written += 1;
      }
    }
    instance.count = written;
    instance.instanceMatrix.needsUpdate = true;
    if (instance.instanceColor) instance.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      geometry={geometry}
      args={[undefined, undefined, motions.current.length]}
      frustumCulled={false}
      raycast={() => null}
    >
      <meshBasicMaterial
        side={THREE.DoubleSide}
        vertexColors
        toneMapped={false}
      />
    </instancedMesh>
  );
}

/** Reduced motion omits airborne decoration rather than freezing it in place. */
export default function Petals({
  dark,
  visibleLimit = 18,
}: {
  dark: boolean;
  visibleLimit?: number;
}) {
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  if (reduced) return null;
  return <PetalField dark={dark} visibleLimit={visibleLimit} />;
}
