"use client";

import { useStacks } from "../store";
import type { Palette } from "../theme";
import { useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import Grabbable from "./Grabbable";
import { useMetalShimmer } from "./objects";
import { propReactionIsEngaged } from "./reactionEngagement";
import { TJ_MEDALLION_FACES, TJ_MEDALLION_SOLIDS } from "./tjMedallionGeometry";
import { useUnitFrame } from "./unitActivity";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function shakerPose(elapsedMs: number, reduced = false) {
  if (reduced || elapsedMs < 0 || elapsedMs >= 600) return { yaw: 0, roll: 0 };
  const t = elapsedMs / 600;
  const envelope = Math.sin(Math.PI * t) ** 2;
  const shake = Math.sin(t * Math.PI * 6) * envelope;
  return { yaw: shake * 0.16, roll: -shake * 0.075 };
}

/** Non-branded 20 oz shaker, built from simple faceted geometry. */
function SpiralWhisk() {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = 76;
    for (let index = 0; index <= segments; index++) {
      const t = index / segments;
      const radius = 0.043 * Math.sin(Math.PI * t);
      const angle = t * Math.PI * 13;
      points.push(
        new THREE.Vector3(
          Math.cos(angle) * radius,
          -0.046 + t * 0.092,
          Math.sin(angle) * radius,
        ),
      );
    }
    return new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      segments,
      0.0022,
      3,
      false,
    );
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={[0, 0.105, 0]}>
      <meshStandardMaterial color="#b9c2c3" metalness={0.92} roughness={0.2} />
    </mesh>
  );
}

function ShakerBody({
  dark,
  cupColor,
  lidColor,
}: {
  dark: boolean;
  cupColor?: string;
  lidColor?: string;
}) {
  const lid = lidColor ?? "#343a3c";
  const lidDeep = lidColor ?? "#2c3234";
  return (
    <group position={[0, -0.013, 0]}>
      {/* Smoky-clear cup: 12 sides keep the silhouette intentionally low-poly. */}
      <mesh position={[0, 0.155, 0]}>
        <cylinderGeometry args={[0.066, 0.055, 0.28, 12, 1, false]} />
        <meshPhysicalMaterial
          color={cupColor ?? (dark ? "#7f8b8d" : "#b7c0bf")}
          transparent
          opacity={0.42}
          roughness={0.24}
          metalness={0}
          // Non-zero transmission makes Three allocate and resolve a
          // full-viewport multisampled target. Safari has presented that
          // target as a black tile for one frame on this shelf. Ordinary
          // alpha blending already supplies the cup's smoky transparency.
          depthWrite={false}
        />
      </mesh>
      {/* One continuous screw collar and deck. The lid silhouette is based on
          the supplied Classic reference, without copying its branding. */}
      <mesh position={[0, 0.304, 0]}>
        <cylinderGeometry args={[0.077, 0.073, 0.052, 12]} />
        <meshStandardMaterial color={lid} roughness={0.58} />
      </mesh>
      <mesh position={[0, 0.334, 0]}>
        <cylinderGeometry args={[0.061, 0.065, 0.012, 12]} />
        <meshStandardMaterial color={lidDeep} roughness={0.56} />
      </mesh>

      {/* The drinking turret grows out of that deck and the carry arch keys
          into both sides, so the cap reads as one moulded assembly. */}
      <mesh position={[0.025, 0.357, 0]}>
        <cylinderGeometry args={[0.026, 0.03, 0.052, 10]} />
        <meshStandardMaterial color={lidDeep} roughness={0.55} />
      </mesh>
      <mesh position={[0.025, 0.385, 0]}>
        <cylinderGeometry args={[0.03, 0.026, 0.01, 10]} />
        <meshStandardMaterial color={lid} roughness={0.58} />
      </mesh>
      <mesh position={[0, 0.347, 0]}>
        <torusGeometry args={[0.055, 0.007, 4, 18, Math.PI]} />
        <meshStandardMaterial color={lid} roughness={0.58} />
      </mesh>
      {[-0.055, 0.055].map((x) => (
        <mesh key={x} position={[x, 0.346, 0]}>
          <boxGeometry args={[0.014, 0.027, 0.019]} />
          <meshStandardMaterial color={lid} roughness={0.58} />
        </mesh>
      ))}
      {/* The flip mouthpiece is hinged to the left shoulder and rises back
          from it, rather than floating as a second cap above the spout. */}
      <group position={[-0.052, 0.347, 0]} rotation={[0, 0, 0.5]}>
        <mesh position={[0, 0.041, 0]}>
          <boxGeometry args={[0.018, 0.082, 0.026]} />
          <meshStandardMaterial color={lidDeep} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.084, 0]}>
          <cylinderGeometry args={[0.011, 0.009, 0.018, 8]} />
          <meshStandardMaterial color={lidDeep} roughness={0.55} />
        </mesh>
      </group>
      {/* One continuous stainless coil, visible through the smoky cup. */}
      <SpiralWhisk />
      {/* Subtle moulded measurement ticks; deliberately no invented branding. */}
      {[0.1, 0.145, 0.19, 0.235].map((y, index) => (
        <mesh key={y} position={[0.058, y, 0.018]}>
          <boxGeometry args={[index % 2 === 0 ? 0.026 : 0.018, 0.003, 0.003]} />
          <meshStandardMaterial
            color={dark ? "#d6dcda" : "#66706f"}
            transparent
            opacity={0.58}
            roughness={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}

const TJ_MEDALLION_HOVER = "grab:tj-medallion:about";

/** Shape lives in tjMedallionGeometry.js, which the boot-silhouette generator
 * reads too. Only the finishes are the scene's own. */
const TJ_MEDALLION_FINISH = {
  barrel: {
    light: "#8a765b",
    dark: "#655746",
    metalness: 0.72,
    roughness: 0.42,
  },
  strut: { light: "#a7977d", dark: "#817563", metalness: 0.82, roughness: 0.3 },
  rim: { light: "#b9ad98", dark: "#7d7468", metalness: 0.76, roughness: 0.3 },
} as const;

const TJ_MEDALLION_ARTWORK_FACE = TJ_MEDALLION_FACES.find(
  (face) => face.id === "artwork-face",
)!;
const TJ_MEDALLION_SHIMMER_FACE = TJ_MEDALLION_FACES.find(
  (face) => face.id === "shimmer-face",
)!;

function TJMedallionBody({
  dark,
  unitIndex,
}: {
  dark: boolean;
  unitIndex: number;
}) {
  const artwork = useLoader(
    THREE.TextureLoader,
    "/images/stacks/tj-medallion.jpg",
  );
  artwork.colorSpace = THREE.SRGBColorSpace;
  const shimmerFace = useMemo(() => {
    const geometry = new THREE.CircleGeometry(
      TJ_MEDALLION_SHIMMER_FACE.radius,
      TJ_MEDALLION_SHIMMER_FACE.segments,
    );
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index++) {
      uv.setXY(index, position.getX(index), position.getY(index));
    }
    uv.needsUpdate = true;
    return geometry;
  }, []);
  useEffect(() => () => shimmerFace.dispose(), [shimmerFace]);
  const { band, mark, texture } = useMetalShimmer({
    unitIndex,
    hoverKey: TJ_MEDALLION_HOVER,
    idleRoughness: 0.4,
    idleEnv: 2.6,
  });
  return (
    <group>
      {TJ_MEDALLION_SOLIDS.map((solid) => {
        const finish = TJ_MEDALLION_FINISH[solid.finish];
        return (
          <mesh
            key={solid.id}
            position={solid.position}
            rotation={solid.rotation}
          >
            {solid.shape === "cylinder" ? (
              <cylinderGeometry
                args={[
                  solid.args[0]!,
                  solid.args[1]!,
                  solid.args[2]!,
                  solid.args[3]!,
                ]}
              />
            ) : (
              <boxGeometry
                args={[solid.args[0]!, solid.args[1]!, solid.args[2]!]}
              />
            )}
            <meshStandardMaterial
              color={dark ? finish.dark : finish.light}
              metalness={finish.metalness}
              roughness={finish.roughness}
            />
          </mesh>
        );
      })}
      <mesh position={TJ_MEDALLION_ARTWORK_FACE.position}>
        <circleGeometry
          args={[
            TJ_MEDALLION_ARTWORK_FACE.radius,
            TJ_MEDALLION_ARTWORK_FACE.segments,
          ]}
        />
        <meshPhysicalMaterial
          ref={mark}
          map={artwork}
          roughness={0.4}
          metalness={0.12}
          envMapIntensity={2.6}
          clearcoat={0.55}
          clearcoatRoughness={0.2}
        />
      </mesh>
      <mesh
        geometry={shimmerFace}
        position={TJ_MEDALLION_SHIMMER_FACE.position}
      >
        <meshBasicMaterial
          ref={band}
          map={texture}
          color="#fff7e8"
          transparent
          opacity={0}
          visible={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export function TJMedallionProp({
  unitIndex,
  palette,
  dark,
  base,
  href,
  doorLabel = "Visit TJHSST",
  doorDetail,
  name,
  scale,
  yaw = -0.16,
}: {
  unitIndex: number;
  palette: Palette;
  dark: boolean;
  base: [number, number, number];
  href: string;
  /** Door Label copy. About passes what the medallion stands for. */
  doorLabel?: string;
  /** Lines under the Door Label title; see Grabbable. */
  doorDetail?: string | readonly string[];
  name?: string;
  scale: number;
  /** Face yaw; About uses this to catch its nearby desk practical. */
  yaw?: number;
}) {
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={TJ_MEDALLION_HOVER}
      metal
      base={base}
      shadeColor={palette.shadow}
      shadeWidth={0.34}
      shape="box"
      massKg={0.45}
      sceneImpulseReaction="knockdown"
      href={href}
      doorLabel={doorLabel}
      doorDetail={doorDetail}
      external
    >
      <group name={name} rotation={[0, yaw, 0]} scale={scale}>
        <TJMedallionBody dark={dark} unitIndex={unitIndex} />
      </group>
    </Grabbable>
  );
}

export function ShakerProp({
  unitIndex,
  palette,
  dark,
  base,
  id = "training",
  cupColor,
  lidColor,
  interactiveEgg = true,
}: {
  unitIndex: number;
  palette: Palette;
  dark: boolean;
  base: [number, number, number];
  id?: string;
  cupColor?: string;
  lidColor?: string;
  interactiveEgg?: boolean;
}) {
  const motion = useRef<THREE.Group>(null);
  const startedAt = useRef<number | null>(null);
  /** Damped 0..1 hover engagement driving the held slosh. */
  const slosh = useRef(0);
  const hoverKey = `grab:shaker:${id}`;
  useUnitFrame((state, delta) => {
    const group = motion.current;
    if (!group) return;
    const start = startedAt.current;
    if (start !== null) {
      // The click's hard shake owns the group outright while it runs. Adding
      // the slosh under it would read as a wobble on a wobble, and the two
      // write the same two euler channels.
      const elapsed = performance.now() - start;
      if (elapsed >= 600) {
        group.rotation.set(0, 0, 0);
        startedAt.current = null;
        slosh.current = 0;
        return;
      }
      const pose = shakerPose(elapsed);
      group.rotation.y = pose.yaw;
      group.rotation.z = pose.roll;
      return;
    }
    // SIGNATURE REACTION (ADR 0020): a shaker answers with what is inside it
    // moving. The 600 ms click shake was the only thing this prop did and it
    // is a BURST, so under Touch Focus — which has no timeout — the shaker
    // went still while still selected. This is the slow version of the same
    // motion, held for as long as you point at it.
    //
    // Deliberately not `shakerPose`: that curve is a hand shaking a bottle,
    // and running it slowly just looks like the same gesture in treacle. Two
    // slow sinusoids a fifth apart read as liquid finding its level.
    if (prefersReducedMotion()) return;
    const target = propReactionIsEngaged(useStacks.getState(), hoverKey)
      ? 1
      : 0;
    if (Math.abs(slosh.current - target) < 1e-3) {
      if (slosh.current === target && target === 0) {
        if (group.rotation.z !== 0 || group.rotation.y !== 0)
          group.rotation.set(0, 0, 0);
        return; // settled at the authored pose, and writing nothing
      }
      slosh.current = target;
    } else {
      slosh.current = THREE.MathUtils.damp(slosh.current, target, 5, delta);
    }
    const t = state.clock.elapsedTime;
    const v = slosh.current;
    // 0.045 rad is 2.6 degrees at the peak of the roll. A shaker is 0.22 wide
    // and stands on a plank; anything past about 4 degrees starts to look
    // like it is tipping over rather than sloshing.
    group.rotation.z = Math.sin(t * 3.1) * 0.045 * v;
    group.rotation.y = Math.sin(t * 2.05 + 0.9) * 0.03 * v;
  });
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      base={base}
      shadeColor={palette.shadow}
      shadeWidth={0.22}
      shape="box"
      massKg={0.25}
      // A shaker's answer is what is inside it moving. The click already
      // owned the hard shake; this is the slow one it makes when you nudge it.
      signature="slosh"
      egg={interactiveEgg ? { reducedMotion: "skip" } : undefined}
      onTap={
        interactiveEgg
          ? () => {
              if (prefersReducedMotion()) return;
              startedAt.current = performance.now();
            }
          : undefined
      }
    >
      <group ref={motion} name="stacks-shaker-motion">
        <ShakerBody dark={dark} cupColor={cupColor} lidColor={lidColor} />
      </group>
    </Grabbable>
  );
}
