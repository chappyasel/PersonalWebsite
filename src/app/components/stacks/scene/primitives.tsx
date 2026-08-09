"use client";

// Shelf-world primitives ported from the approved prototype: shelf units,
// packed book rows, piles, lamp + glow, frames, and training props.
// Box props use RoundedBox — edge highlights are the cheapest "crafted vs
// primitive" signal; perfect 90° corners are the strongest primitive tell.
import { Image as DreiImage, RoundedBox } from "@react-three/drei";
import React, { useMemo } from "react";
import * as THREE from "three";

import { type Palette, proxied, rand } from "../theme";
import { useStacks } from "../store";

export type RowItem =
  | { kind: "spine"; x: number; w: number; h: number; color: string }
  | { kind: "cover"; x: number; url: string; key: string };

export function packRow(
  width: number,
  covers: { url: string; key: string }[],
  palette: Palette,
  salt: number,
): RowItem[] {
  const items: RowItem[] = [];
  let x = -width / 2 + 0.1;
  let coverIdx = 0;
  let i = 0;
  while (x < width / 2 - 0.25) {
    const roll = rand(i, salt);
    if (roll > 0.7 && coverIdx < covers.length) {
      const w = 0.34;
      items.push({ kind: "cover", x: x + w / 2, ...covers[coverIdx]! });
      x += w + 0.04;
      coverIdx++;
    } else if (roll < 0.04) {
      x += 0.06 + rand(i, salt + 1) * 0.08;
    } else {
      const w = 0.055 + rand(i, salt + 2) * 0.075;
      const h = 0.4 + rand(i, salt + 3) * 0.2;
      const color =
        palette.spines[Math.floor(rand(i, salt + 4) * palette.spines.length)]!;
      items.push({ kind: "spine", x: x + w / 2, w, h, color });
      x += w + 0.012;
    }
    i++;
  }
  return items;
}

/** Swallows texture-load failures for a single cover so one broken URL
 * degrades to a blank book instead of killing the canvas. */
export class CoverBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function BookRowMesh({
  items,
  palette,
  salt,
  textured = true,
  coverWidth = 384,
  onCoverClick,
}: {
  items: RowItem[];
  palette: Palette;
  salt: number;
  /** false = proximity LOD says far: covers render as blank boards so the
   * packing silhouette is stable while textures stay unmounted. */
  textured?: boolean;
  coverWidth?: 256 | 384;
  onCoverClick?: (key: string) => void;
}) {
  const hovered = useStacks((s) => s.hovered);
  const setHovered = useStacks((s) => s.setHovered);
  return (
    <group>
      {items.map((item, i) =>
        item.kind === "spine" ? (
          <RoundedBox
            key={i}
            castShadow
            args={[item.w, item.h, 0.3]}
            radius={0.012}
            smoothness={4}
            position={[item.x, item.h / 2 + 0.035, 0]}
            rotation={[0, 0, rand(i, salt + 5) * 0.04 - 0.02]}
          >
            <meshStandardMaterial
              color={item.color}
              roughness={0.55 + rand(i, salt + 6) * 0.35}
            />
          </RoundedBox>
        ) : !textured ? (
          <group
            key={item.key}
            position={[item.x, 0.295, 0.06]}
            rotation={[0, (i % 2 === 0 ? 1 : -1) * 0.05, 0]}
          >
            <RoundedBox castShadow args={[0.36, 0.52, 0.048]} radius={0.008} smoothness={4}>
              <meshStandardMaterial color={palette.cover} roughness={0.7} />
            </RoundedBox>
          </group>
        ) : (
          <CoverBoundary
            key={item.key}
            fallback={
              <RoundedBox
                castShadow
                args={[0.34, 0.5, 0.045]}
                radius={0.008}
                smoothness={4}
                position={[item.x, 0.285, 0.06]}
              >
                <meshStandardMaterial color="#9c8567" roughness={0.8} />
              </RoundedBox>
            }
          >
            <group
              position={[
                item.x,
                0.295,
                hovered === `book:${item.key}` ? 0.16 : 0.06,
              ]}
              rotation={[0, (i % 2 === 0 ? 1 : -1) * 0.05, 0]}
            >
              <RoundedBox
                castShadow
                args={[0.36, 0.52, 0.048]}
                radius={0.008}
                smoothness={4}
                position={[0, 0, -0.027]}
              >
                <meshStandardMaterial color={palette.cover} roughness={0.7} />
              </RoundedBox>
              <React.Suspense fallback={null}>
                <DreiImage
                  url={proxied(item.url, coverWidth)}
                  scale={[0.34, 0.5]}
                  position={[0, 0, -0.002]}
                  toneMapped={false}
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    setHovered(`book:${item.key}`);
                  }}
                  onPointerOut={() => {
                    // over(B) can land before out(A) — only clear our own hover
                    // or the late out event would drop B's lift mid-animation.
                    if (useStacks.getState().hovered === `book:${item.key}`)
                      setHovered(null);
                  }}
                  onClick={
                    onCoverClick
                      ? (e) => {
                          // r3f fires onClick even after a swipe that starts
                          // and ends on a mesh — delta gates only
                          // onPointerMissed upstream.
                          if ((e.delta ?? 0) > 6) return;
                          e.stopPropagation();
                          onCoverClick(item.key);
                        }
                      : undefined
                  }
                />
              </React.Suspense>
            </group>
          </CoverBoundary>
        ),
      )}
    </group>
  );
}

export function ShelfUnit({
  children,
  lower,
  palette,
  width = 3.2,
}: {
  children?: React.ReactNode;
  lower?: React.ReactNode;
  palette: Palette;
  width?: number;
}) {
  return (
    <group>
      <RoundedBox castShadow receiveShadow args={[width, 0.07, 0.85]} radius={0.012} smoothness={4}>
        <meshStandardMaterial color={palette.wood} roughness={0.75} />
      </RoundedBox>
      {[-1, 1].map((side) => (
        <RoundedBox
          key={side}
          castShadow
          args={[0.05, 0.72, 0.05]}
          radius={0.012}
          smoothness={4}
          position={[side * (width / 2 - 0.25), -0.36, -0.32]}
        >
          <meshStandardMaterial color={palette.strap} roughness={0.7} />
        </RoundedBox>
      ))}
      <RoundedBox
        castShadow
        receiveShadow
        args={[width * 0.72, 0.055, 0.6]}
        radius={0.012}
        smoothness={4}
        position={[0, -0.72, -0.08]}
      >
        <meshStandardMaterial color={palette.wood} roughness={0.75} />
      </RoundedBox>
      <group>{children}</group>
      <group position={[0, -0.72, 0]}>{lower}</group>
    </group>
  );
}

export function BookPile({ palette, x = 0 }: { palette: Palette; x?: number }) {
  return (
    <group position={[x, 0, 0]}>
      {palette.pile.map((color, i) => (
        <group
          key={color}
          position={[i * 0.02, 0.065 + i * 0.085, 0]}
          rotation={[0, rand(i, 9) * 0.4 - 0.2, 0]}
        >
          <RoundedBox castShadow args={[0.46, 0.06, 0.32]} radius={0.008} smoothness={4}>
            <meshStandardMaterial color={color} roughness={0.8} />
          </RoundedBox>
          <RoundedBox args={[0.44, 0.036, 0.31]} radius={0.008} smoothness={4} position={[0.014, -0.012, 0.014]}>
            <meshStandardMaterial color={palette.pages} roughness={0.9} />
          </RoundedBox>
        </group>
      ))}
    </group>
  );
}

export function GlowSprite({ opacity }: { opacity: number }) {
  const texture = useMemo(() => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2,
    );
    grad.addColorStop(0, "rgba(255, 190, 115, 1)");
    grad.addColorStop(0.4, "rgba(255, 170, 90, 0.35)");
    grad.addColorStop(1, "rgba(255, 160, 80, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }, []);
  return (
    <sprite scale={[1.6, 1.6, 1]}>
      <spriteMaterial
        map={texture}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </sprite>
  );
}

export function Lamp({ palette }: { palette: Palette }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.095, 0]}>
        <cylinderGeometry args={[0.03, 0.09, 0.12, 24]} />
        <meshStandardMaterial color={palette.strap} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.235, 0]}>
        <sphereGeometry args={[0.08, 24, 24]} />
        <meshStandardMaterial
          color="#ffe0b0"
          emissive="#ffb75e"
          emissiveIntensity={2.4}
          toneMapped={false}
        />
      </mesh>
      <group position={[0, 0.24, 0.05]}>
        <GlowSprite opacity={palette.glowOpacity} />
      </group>
      <pointLight
        position={[0, 0.3, 0.35]}
        color="#ffbe73"
        intensity={1.6}
        distance={3.2}
        decay={2}
      />
    </group>
  );
}

export function Plates({ palette }: { palette: Palette }) {
  return (
    <group>
      {[
        { r: 0.22, x: 0, yaw: 0.5 },
        { r: 0.175, x: 0.36, yaw: 0.42 },
        { r: 0.135, x: 0.63, yaw: 0.34 },
      ].map((plate, i) => (
        <group
          key={i}
          position={[plate.x, plate.r + 0.035, -0.1]}
          rotation={[Math.PI / 2 - 0.08, 0, plate.yaw]}
        >
          <mesh castShadow>
            <cylinderGeometry args={[plate.r, plate.r, 0.045, 40]} />
            <meshStandardMaterial
              color={palette.plate}
              roughness={0.4}
              metalness={0.45}
            />
          </mesh>
          <mesh>
            <cylinderGeometry
              args={[plate.r * 0.28, plate.r * 0.28, 0.06, 24]}
            />
            <meshStandardMaterial
              color={palette.hub}
              roughness={0.5}
              metalness={0.5}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Dumbbell({ palette }: { palette: Palette }) {
  return (
    <group rotation={[0, 0.5, 0]} position={[0, 0.09, 0]}>
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, 0.52, 20]} />
        <meshStandardMaterial
          color={palette.metal}
          roughness={0.4}
          metalness={0.5}
        />
      </mesh>
      {[-0.19, 0.19].map((x) => (
        <mesh
          key={x}
          castShadow
          position={[x, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.095, 0.095, 0.11, 24]} />
          <meshStandardMaterial
            color={palette.plate}
            roughness={0.45}
            metalness={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}

export function FrameRow({
  frames,
  width,
  palette,
  textured = true,
  onFrameClick,
}: {
  frames: { src: string; key: string }[];
  width: number;
  palette: Palette;
  textured?: boolean;
  onFrameClick?: (key: string) => void;
}) {
  const hovered = useStacks((s) => s.hovered);
  const setHovered = useStacks((s) => s.setHovered);
  return (
    <group>
      {frames.map(({ src, key }, i) => {
        const x = (i - (frames.length - 1) / 2) * (width / frames.length);
        const lifted = hovered === `frame:${key}`;
        return (
          <group
            key={key}
            position={[x, lifted ? 0.34 : 0.3, -0.06]}
            rotation={[-0.1, (1 - i) * 0.05, 0]}
          >
            <RoundedBox
              castShadow
              args={[0.9, 0.55, 0.035]}
              radius={0.008}
              smoothness={4}
              position={[0, 0, -0.02]}
            >
              <meshStandardMaterial color={palette.frame} roughness={0.6} />
            </RoundedBox>
            {textured ? (
              <React.Suspense fallback={null}>
                <DreiImage
                  url={src}
                  scale={[0.82, 0.47]}
                  toneMapped={false}
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    setHovered(`frame:${key}`);
                  }}
                  onPointerOut={() => {
                    if (useStacks.getState().hovered === `frame:${key}`)
                      setHovered(null);
                  }}
                  onClick={
                    onFrameClick
                      ? (e) => {
                          if ((e.delta ?? 0) > 6) return; // swipe, not a tap
                          e.stopPropagation();
                          onFrameClick(key);
                        }
                      : undefined
                  }
                />
              </React.Suspense>
            ) : (
              <mesh position={[0, 0, 0.001]}>
                <planeGeometry args={[0.82, 0.47]} />
                <meshStandardMaterial color={palette.cover} roughness={0.85} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
