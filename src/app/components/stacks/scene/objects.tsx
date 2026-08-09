"use client";

// New scene props for the About, Blog, and Systems units.
import { Image as DreiImage } from "@react-three/drei";
import React, { useMemo } from "react";
import * as THREE from "three";

import { type Palette, rand } from "../theme";
import { useStacks } from "../store";

/** Framed standing portrait — the identity anchor of the About unit. */
export function PortraitFrame({
  src,
  palette,
  textured,
}: {
  src: string;
  palette: Palette;
  textured: boolean;
}) {
  return (
    <group position={[0, 0.62, -0.08]} rotation={[-0.06, 0.06, 0]}>
      <mesh castShadow position={[0, 0, -0.024]}>
        <boxGeometry args={[1.02, 1.24, 0.04]} />
        <meshStandardMaterial color={palette.frame} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, -0.002]}>
        <planeGeometry args={[0.94, 1.16]} />
        <meshStandardMaterial color={palette.pages} roughness={0.9} />
      </mesh>
      {textured && (
        <React.Suspense fallback={null}>
          <DreiImage url={src} scale={[0.86, 1.08]} toneMapped={false} />
        </React.Suspense>
      )}
    </group>
  );
}

/** Small stack of calling cards. */
export function CardStack({ palette }: { palette: Palette }) {
  return (
    <group>
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          castShadow
          position={[i * 0.006, 0.04 + i * 0.011, i * 0.004]}
          rotation={[0, rand(i, 41) * 0.5 - 0.25, 0]}
        >
          <boxGeometry args={[0.3, 0.01, 0.18]} />
          <meshStandardMaterial
            color={i === 3 ? palette.paper : palette.pages}
            roughness={0.9}
          />
        </mesh>
      ))}
    </group>
  );
}

export function Mug({ palette }: { palette: Palette }) {
  return (
    <group position={[0, 0.1, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.07, 0.062, 0.13, 24]} />
        <meshStandardMaterial color={palette.plate} roughness={0.45} />
      </mesh>
      <mesh position={[0.085, 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.038, 0.011, 10, 20]} />
        <meshStandardMaterial color={palette.plate} roughness={0.45} />
      </mesh>
    </group>
  );
}

/** Row of leaning notebook spines; the front few are clickable blog posts. */
export function NotebookLean({
  palette,
  count = 6,
  clickKeys = [],
  onNotebookClick,
}: {
  palette: Palette;
  count?: number;
  clickKeys?: string[];
  onNotebookClick?: (key: string) => void;
}) {
  const hovered = useStacks((s) => s.hovered);
  const setHovered = useStacks((s) => s.setHovered);
  // Two cool accents among warm neutrals, like the shelf spines.
  const colors = [
    palette.spines[8],
    palette.spines[2],
    palette.spines[7],
    palette.spines[9],
    palette.spines[3],
    palette.spines[5],
  ];
  return (
    <group>
      {Array.from({ length: count }, (_, i) => {
        const key = clickKeys[i];
        const lean = i === count - 1 ? -0.2 : rand(i, 51) * 0.06 - 0.03;
        const isHover = key && hovered === `notebook:${key}`;
        const x = i * 0.105 - (count * 0.105) / 2;
        return (
          <mesh
            key={i}
            castShadow
            position={[
              x + (i === count - 1 ? 0.015 : 0),
              0.29 + (isHover ? 0.04 : 0),
              0,
            ]}
            rotation={[0, 0, lean]}
            onPointerOver={
              key
                ? (e) => {
                    e.stopPropagation();
                    setHovered(`notebook:${key}`);
                  }
                : undefined
            }
            onPointerOut={key ? () => setHovered(null) : undefined}
            onClick={
              key && onNotebookClick
                ? (e) => {
                    e.stopPropagation();
                    onNotebookClick(key);
                  }
                : undefined
            }
          >
            <boxGeometry args={[0.062, 0.52, 0.34]} />
            <meshStandardMaterial
              color={colors[i % colors.length]}
              roughness={0.6 + rand(i, 52) * 0.3}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/** Open notebook lying flat — two angled page halves over a cover. */
export function OpenNotebook({ palette }: { palette: Palette }) {
  return (
    <group rotation={[0, -0.35, 0]}>
      <mesh castShadow position={[0, 0.045, 0]}>
        <boxGeometry args={[0.62, 0.015, 0.42]} />
        <meshStandardMaterial color={palette.strap} roughness={0.7} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          castShadow
          position={[side * 0.15, 0.075, 0]}
          rotation={[0, 0, side * -0.09]}
        >
          <boxGeometry args={[0.3, 0.03, 0.4]} />
          <meshStandardMaterial color={palette.paper} roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 0.095, 0]}>
        <boxGeometry args={[0.02, 0.024, 0.4]} />
        <meshStandardMaterial color={palette.strap} roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Paper stack + pen for the Blog lower shelf. */
export function PaperStack({ palette }: { palette: Palette }) {
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          castShadow
          position={[i * 0.008, 0.02 + i * 0.017, i * -0.006]}
          rotation={[0, rand(i, 61) * 0.3 - 0.15, 0]}
        >
          <boxGeometry args={[0.42, 0.016, 0.3]} />
          <meshStandardMaterial color={palette.paper} roughness={0.95} />
        </mesh>
      ))}
      <mesh
        castShadow
        position={[0.12, 0.075, 0.1]}
        rotation={[0, 0.9, Math.PI / 2]}
      >
        <cylinderGeometry args={[0.012, 0.012, 0.3, 12]} />
        <meshStandardMaterial
          color={palette.hub}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>
    </group>
  );
}

/** Ring binder standing spine-out, label on the spine, ring glints at the
 * pages edge. */
export function Binder({ palette }: { palette: Palette }) {
  return (
    <group rotation={[0, -0.3, 0]}>
      <mesh castShadow position={[0, 0.31, 0]}>
        <boxGeometry args={[0.16, 0.58, 0.42]} />
        <meshStandardMaterial color={palette.spines[6]} roughness={0.55} />
      </mesh>
      {/* pages block inset on the open (right) side */}
      <mesh position={[0.081, 0.31, -0.02]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.36, 0.52]} />
        <meshStandardMaterial color={palette.pages} roughness={0.95} />
      </mesh>
      {[-0.16, 0, 0.16].map((y) => (
        <mesh key={y} position={[0.084, 0.31 + y, -0.02]}>
          <torusGeometry args={[0.032, 0.007, 10, 24]} />
          <meshStandardMaterial
            color={palette.metal}
            roughness={0.35}
            metalness={0.6}
          />
        </mesh>
      ))}
      {/* spine label */}
      <mesh position={[0, 0.4, 0.211]}>
        <planeGeometry args={[0.11, 0.16]} />
        <meshStandardMaterial color={palette.paper} roughness={0.95} />
      </mesh>
    </group>
  );
}

/** Analog alarm clock with hands frozen at 3:45 — the wake-up time. */
export function AlarmClock({ palette }: { palette: Palette }) {
  const faceTexture = useMemo(() => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const c = size / 2;
    ctx.fillStyle = "#f6efdf";
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6e5d49";
    ctx.lineWidth = 6;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r0 = i % 3 === 0 ? 0.78 : 0.86;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * c * r0, c + Math.sin(a) * c * r0);
      ctx.lineTo(c + Math.cos(a) * c * 0.92, c + Math.sin(a) * c * 0.92);
      ctx.stroke();
    }
    // 3:45 — minute hand at 9, hour hand between 3 and 4.
    ctx.strokeStyle = "#443a2d";
    ctx.lineCap = "round";
    const hour = ((3.75 / 12) * Math.PI * 2) - Math.PI / 2;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(hour) * c * 0.45, c + Math.sin(hour) * c * 0.45);
    ctx.stroke();
    const minute = ((45 / 60) * Math.PI * 2) - Math.PI / 2;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(
      c + Math.cos(minute) * c * 0.68,
      c + Math.sin(minute) * c * 0.68,
    );
    ctx.stroke();
    ctx.fillStyle = "#443a2d";
    ctx.beginPath();
    ctx.arc(c, c, 10, 0, Math.PI * 2);
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }, []);

  return (
    <group>
      <mesh
        castShadow
        position={[0, 0.19, -0.02]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.15, 0.15, 0.07, 32]} />
        <meshStandardMaterial
          color={palette.plate}
          roughness={0.4}
          metalness={0.5}
        />
      </mesh>
      <group position={[0, 0.19, 0.016]}>
        <mesh>
          <circleGeometry args={[0.132, 32]} />
          <meshStandardMaterial map={faceTexture} roughness={0.8} />
        </mesh>
      </group>
      {[-0.06, 0.06].map((x) => (
        <mesh key={x} castShadow position={[x * 1.2, 0.315, -0.02]}>
          <sphereGeometry args={[0.028, 16, 16]} />
          <meshStandardMaterial
            color={palette.metal}
            roughness={0.35}
            metalness={0.6}
          />
        </mesh>
      ))}
      {[-0.08, 0.08].map((x) => (
        <mesh
          key={x}
          castShadow
          position={[x, 0.045, 0.02]}
          rotation={[0, 0, x > 0 ? -0.5 : 0.5]}
        >
          <cylinderGeometry args={[0.012, 0.012, 0.09, 10]} />
          <meshStandardMaterial
            color={palette.metal}
            roughness={0.35}
            metalness={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Three quote cards fanned against the shelf back. */
export function QuoteCards({ palette }: { palette: Palette }) {
  return (
    <group>
      {[-1, 0, 1].map((i) => (
        <group
          key={i}
          position={[i * 0.21, 0.19 + Math.abs(i) * -0.012, i * 0.03]}
          rotation={[-0.14, 0, i * 0.12]}
        >
          <mesh castShadow>
            <boxGeometry args={[0.3, 0.36, 0.008]} />
            <meshStandardMaterial
              color={i === 0 ? palette.paper : palette.pages}
              roughness={0.95}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
