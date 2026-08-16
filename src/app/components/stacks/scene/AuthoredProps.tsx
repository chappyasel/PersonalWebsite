"use client";

import type { Palette } from "../theme";
import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import Grabbable from "./Grabbable";

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
          transmission={0.12}
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

function TJMedallionBody({ dark }: { dark: boolean }) {
  const artwork = useLoader(
    THREE.TextureLoader,
    "/images/stacks/tj-medallion.jpg",
  );
  artwork.colorSpace = THREE.SRGBColorSpace;
  return (
    <group>
      <mesh position={[0, 0.018, 0]}>
        <cylinderGeometry args={[0.095, 0.105, 0.036, 16]} />
        <meshStandardMaterial
          color={dark ? "#655746" : "#8a765b"}
          metalness={0.72}
          roughness={0.42}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.057, 0.074, -0.002]}
          rotation={[0, 0, side * -0.32]}
        >
          <boxGeometry args={[0.018, 0.12, 0.022]} />
          <meshStandardMaterial
            color={dark ? "#817563" : "#a7977d"}
            metalness={0.82}
            roughness={0.3}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.202, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.025, 32]} />
        <meshStandardMaterial
          color={dark ? "#7d7468" : "#b9ad98"}
          metalness={0.76}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, 0.202, 0.013]}>
        <circleGeometry args={[0.143, 32]} />
        <meshStandardMaterial map={artwork} roughness={0.52} metalness={0.04} />
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
  name,
  scale,
}: {
  unitIndex: number;
  palette: Palette;
  dark: boolean;
  base: [number, number, number];
  href: string;
  name?: string;
  scale: number;
}) {
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey="grab:tj-medallion:about"
      base={base}
      shadeColor={palette.shadow}
      shadeWidth={0.34}
      shape="box"
      massKg={0.45}
      href={href}
      doorLabel="Visit TJHSST"
      external
    >
      <group name={name} rotation={[0, -0.16, 0]} scale={scale}>
        <TJMedallionBody dark={dark} />
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
  useFrame(() => {
    const group = motion.current;
    const start = startedAt.current;
    if (!group || start === null) return;
    const elapsed = performance.now() - start;
    if (elapsed >= 600) {
      group.rotation.set(0, 0, 0);
      startedAt.current = null;
      return;
    }
    const pose = shakerPose(elapsed);
    group.rotation.y = pose.yaw;
    group.rotation.z = pose.roll;
  });
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={`grab:shaker:${id}`}
      base={base}
      shadeColor={palette.shadow}
      shadeWidth={0.22}
      shape="box"
      massKg={0.25}
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
