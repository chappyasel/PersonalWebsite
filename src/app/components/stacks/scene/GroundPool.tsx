"use client";

// Analytic soft shadows — elliptical radial-gradient CanvasTexture quads
// (the GlowSprite pattern), one shared texture for everything. Replaces the
// per-frame 2048² directional shadow map: the scene is static, so painted
// pools ground each unit with zero render-to-texture.
//
// v4 grounding model (audit §1.1): horizontal quads are only legible on the
// GROUND, where the camera sees them at a usable angle — shelf-level pools
// project to ~zero screen area at the ~2° grazing view and were deleted.
// Shelf props ground via camera-facing ContactShade sprites here plus baked
// vertex AO in the models (P2/P4).
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

function PoolQuad({
  color,
  opacity,
  position,
  scale,
}: {
  color: string;
  opacity: number;
  position: [number, number, number];
  scale: [number, number];
}) {
  const texture = useMemo(() => poolTexture(), []);
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={position}
      scale={[scale[0], scale[1], 1]}
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

// Two tight ellipses at the actual strap feet plus one faint smear under the
// lower plank's overhang — shadow where the structure meets the ground, not
// a puddle offset to one side (the old single ellipse at x −0.55 missed the
// right foot entirely). Feet sit 1mm above the smear so the overlap never
// z-fights.
export default function GroundPool({
  color,
  opacity,
  width = 3.2,
}: {
  color: string;
  opacity: number;
  width?: number;
}) {
  const footX = width / 2 - 0.25;
  return (
    <group>
      {[-footX, footX].map((x) => (
        <PoolQuad
          key={x}
          color={color}
          opacity={opacity}
          position={[x, -1.114, -0.32]}
          scale={[0.5, 0.38]}
        />
      ))}
      <PoolQuad
        color={color}
        opacity={opacity * 0.4}
        position={[0, -1.115, -0.08]}
        scale={[width + 0.2, 0.8]}
      />
    </group>
  );
}

/** Small ground ellipse under a floor-standing prop's foot (golf club,
 * ladder, clock, armchair …). Floor quads read correctly — the camera sees
 * the ground at a usable angle, unlike the shelves. */
export function FootPool({
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
  return (
    <PoolQuad
      color={color}
      opacity={opacity}
      position={[position[0], position[1] + 0.001, position[2]]}
      scale={size}
    />
  );
}

/** Camera-facing dark sprite hugging a shelf prop's base — the grazing-angle
 * replacement for the old horizontal contact pools. A billboard never
 * projects to zero area, so the base darkening survives every camera pose.
 * Keep opacity low (~0.12); it reads as ambient occlusion, not shadow. */
export function ContactShade({
  color,
  width,
  height,
  position = [0, 0, 0],
  opacity = 0.12,
}: {
  color: string;
  width: number;
  height?: number;
  position?: [number, number, number];
  opacity?: number;
}) {
  const texture = useMemo(() => poolTexture(), []);
  return (
    <sprite position={position} scale={[width, height ?? width * 0.32, 1]}>
      <spriteMaterial
        map={texture}
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        fog={false}
      />
    </sprite>
  );
}
