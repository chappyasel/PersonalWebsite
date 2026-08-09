"use client";

// Analytic soft shadows — elliptical radial-gradient CanvasTexture quads
// (the GlowSprite pattern), one shared texture for everything. Replaces the
// per-frame 2048² directional shadow map: the scene is static, so painted
// pools ground each unit with zero render-to-texture and no GPU-dependent
// bake behavior. GroundPool is the unit's floor shadow; ContactPool is the
// small per-prop pool that seats props on the shelf wood.
import { useMemo } from "react";
import * as THREE from "three";

let sharedTexture: THREE.CanvasTexture | null = null;

export function poolTexture(): THREE.CanvasTexture {
  if (sharedTexture) return sharedTexture;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, "rgba(255, 255, 255, 1)");
  grad.addColorStop(0.42, "rgba(255, 255, 255, 0.78)");
  grad.addColorStop(0.72, "rgba(255, 255, 255, 0.3)");
  grad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  sharedTexture = new THREE.CanvasTexture(canvas);
  return sharedTexture;
}

// Offset −0.55 in x opposite the key light (light sits at +4x, +6.5y) and
// z-tightened to the plank footprint — the old 0.33 front overhang read as
// a puddle the bookcase hovered over, not a shadow it casts.
export default function GroundPool({
  color,
  opacity,
}: {
  color: string;
  opacity: number;
}) {
  const texture = useMemo(() => poolTexture(), []);
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[-0.55, -1.115, -0.12]}
      scale={[3.4, 1.15, 1]}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}

/** Small contact pool under a prop — place inside a shelf content group
 * (local y=0 is the wood) at ~1.6× the prop's footprint. */
export function ContactPool({
  color,
  size,
  position = [0, 0, 0],
  opacity = 0.3,
}: {
  color: string;
  size: [number, number];
  position?: [number, number, number];
  opacity?: number;
}) {
  const texture = useMemo(() => poolTexture(), []);
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[position[0], position[1] + 0.001, position[2]]}
      scale={[size[0], size[1], 1]}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}
