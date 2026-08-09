"use client";

// Analytic soft ground pool — an elliptical radial-gradient CanvasTexture on
// a ground plane (the GlowSprite pattern), one shared texture for all units.
// Replaces the per-frame 2048² directional shadow map: the scene is static,
// so a painted pool grounds each unit with zero render-to-texture and no
// GPU-dependent bake behavior. Offset opposite the warm key light.
import { useMemo } from "react";
import * as THREE from "three";

let sharedTexture: THREE.CanvasTexture | null = null;

function poolTexture(): THREE.CanvasTexture {
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
      position={[-0.2, -1.115, -0.12]}
      scale={[3.9, 1.75, 1]}
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
