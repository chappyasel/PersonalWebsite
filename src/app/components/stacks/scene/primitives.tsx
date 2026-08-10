"use client";

// Shelf-world primitives ported from the approved prototype: shelf units,
// packed book rows, piles, lamp + glow, frames, and training props.
// Box props use RoundedBox — edge highlights are the cheapest "crafted vs
// primitive" signal; perfect 90° corners are the strongest primitive tell.
import { RoundedBox } from "@react-three/drei";
import React, { useMemo } from "react";
import * as THREE from "three";

import { type Palette, proxied, rand } from "../theme";
import { useStacks } from "../store";
import { ContactShade } from "./GroundPool";
import Lift from "./Lift";
import LitImage from "./LitImage";

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
            position={[item.x, item.h / 2, 0]}
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
            position={[item.x, 0.26, 0.06]}
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
                position={[item.x, 0.25, 0.06]}
              >
                <meshStandardMaterial color="#9c8567" roughness={0.8} />
              </RoundedBox>
            }
          >
            <Lift
              hoverKey={`book:${item.key}`}
              base={[item.x, 0.26, 0.06]}
              offset={[0, 0.05, 0.06]}
            >
              <group rotation={[0, (i % 2 === 0 ? 1 : -1) * 0.05, 0]}>
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
                  <LitImage
                    url={proxied(item.url, coverWidth)}
                    width={0.34}
                    height={0.5}
                    radius={0.012}
                    roughness={0.6}
                    position={[0, 0, -0.002]}
                    onPointerOver={(e) => {
                      e.stopPropagation();
                      setHovered(`book:${item.key}`);
                    }}
                    onPointerOut={() => {
                      // over(B) can land before out(A) — only clear our own
                      // hover or the late out would drop B's lift mid-anim.
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
            </Lift>
          </CoverBoundary>
        ),
      )}
    </group>
  );
}

/** The two shelf surfaces in unit-local y. Both content groups sit AT the
 * wood, so every prop's local y=0 IS its contact plane — the two competing
 * offset conventions that made half the props float are gone. */
export const SHELF = { top: 0.035, lower: -0.6925 } as const;

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
      {/* Straps run all the way to the ground plane (−1.115) with a small
          plinth foot — the bookcase stands instead of hovering. 0.07² so the
          straps are never thinner than the plank they carry, plus a cleat
          block under each lower-plank end: the joinery that makes the plank
          read as CARRIED (v3's 0.72-width plank touched nothing). */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (width / 2 - 0.25), 0, -0.32]}>
          <RoundedBox
            castShadow
            args={[0.07, 1.115, 0.07]}
            radius={0.012}
            smoothness={4}
            position={[0, -0.5575, 0]}
          >
            <meshStandardMaterial color={palette.strap} roughness={0.7} />
          </RoundedBox>
          <RoundedBox
            args={[0.12, 0.05, 0.12]}
            radius={0.008}
            smoothness={4}
            position={[0, -1.09, 0]}
          >
            <meshStandardMaterial color={palette.strap} roughness={0.7} />
          </RoundedBox>
          <RoundedBox
            args={[0.1, 0.06, 0.1]}
            radius={0.008}
            smoothness={4}
            position={[0, -0.7775, 0]}
          >
            <meshStandardMaterial color={palette.strap} roughness={0.7} />
          </RoundedBox>
        </group>
      ))}
      <RoundedBox
        castShadow
        receiveShadow
        args={[width, 0.055, 0.6]}
        radius={0.012}
        smoothness={4}
        position={[0, -0.72, -0.08]}
      >
        <meshStandardMaterial color={palette.wood} roughness={0.75} />
      </RoundedBox>
      <group position={[0, SHELF.top, 0]}>{children}</group>
      <group position={[0, SHELF.lower, 0]}>{lower}</group>
    </group>
  );
}

/** Three stacked books. `salt` varies rotation AND color order per unit so
 * the same pile never repeats across units (v3 reused it verbatim). Spacing
 * 0.066 = 0.06 book + 0.006 kiss; the page block sits INSIDE the covers
 * (centered, 0.044 of 0.06) peeking out only at fore-edge and front —
 * correct book anatomy (v3's block hung below the cover). */
export function BookPile({
  palette,
  x = 0,
  salt = 9,
}: {
  palette: Palette;
  x?: number;
  salt?: number;
}) {
  return (
    <group position={[x, 0, 0]}>
      <ContactShade
        color={palette.shadow}
        width={0.62}
        position={[0.02, 0.03, 0.02]}
      />
      {palette.pile.map((_, i) => (
        <group
          key={i}
          // 0.026 = half height 0.03 sunk by ~radius/2 to bury the bevel rim.
          position={[i * 0.02, 0.026 + i * 0.066, 0]}
          rotation={[0, rand(i, salt) * 0.5 - 0.25, 0]}
        >
          <RoundedBox castShadow args={[0.46, 0.06, 0.32]} radius={0.008} smoothness={4}>
            <meshStandardMaterial
              color={palette.pile[(i + salt) % palette.pile.length]}
              roughness={0.8}
            />
          </RoundedBox>
          <RoundedBox args={[0.44, 0.044, 0.31]} radius={0.008} smoothness={4} position={[0.014, 0, 0.014]}>
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

/** Bulb glow + warm light for the GLB desk lamp — sits at the lamp's head
 * so the room still reads as lit by the lamp, not the model. */
export function LampGlow({ palette }: { palette: Palette }) {
  return (
    <group>
      <group position={[0, 0.36, 0.1]}>
        <GlowSprite opacity={palette.glowOpacity} />
      </group>
      <pointLight
        position={[0, 0.35, 0.35]}
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
          // +0.0013 compensates the 0.08 tilt so the rim kisses the wood.
          position={[plate.x, plate.r + 0.0013, -0.1]}
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
  const setHovered = useStacks((s) => s.setHovered);
  return (
    <group>
      {frames.map(({ src, key }, i) => {
        // Frames at 0.76 wide on 2.6-row slots leave ~0.1 air between them;
        // per-frame yaw/roll jitter + a z-stagger kill the edge-to-edge
        // "thumbnail band" read. The roll drops one bottom corner, so the
        // base lifts by halfWidth·|roll| to keep that corner on the wood.
        const roll = (rand(i, 71) - 0.5) * 0.08;
        const yaw = (1 - i) * 0.05 + (rand(i, 73) - 0.5) * 0.12;
        const x =
          (i - (frames.length - 1) / 2) * (width / frames.length) +
          (rand(i, 74) - 0.5) * 0.05;
        const z = i % 2 === 0 ? -0.075 : -0.04;
        return (
          <Lift
            key={key}
            hoverKey={`frame:${key}`}
            base={[x, 0.2445 + Math.abs(roll) * 0.4, z]}
            offset={[0, 0.04, 0.03]}
          >
            <group rotation={[-0.1, yaw, roll]}>
              <RoundedBox
                castShadow
                args={[0.76, 0.48, 0.035]}
                radius={0.008}
                smoothness={4}
                position={[0, 0, -0.02]}
              >
                <meshStandardMaterial color={palette.frame} roughness={0.6} />
              </RoundedBox>
              {textured ? (
                <React.Suspense fallback={null}>
                  <LitImage
                    url={src}
                    width={0.68}
                    height={0.4}
                    roughness={0.5}
                    position={[0, 0, -0.001]}
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
                  <planeGeometry args={[0.68, 0.4]} />
                  <meshStandardMaterial color={palette.cover} roughness={0.85} />
                </mesh>
              )}
            </group>
          </Lift>
        );
      })}
    </group>
  );
}
