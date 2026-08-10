"use client";

// Shelf-world primitives ported from the approved prototype: shelf units,
// packed book rows, piles, lamp + glow, frames, and training props.
// Box props use RoundedBox — edge highlights are the cheapest "crafted vs
// primitive" signal; perfect 90° corners are the strongest primitive tell.
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useMemo, useRef } from "react";
import * as THREE from "three";

import { type Palette, proxied, rand } from "../theme";
import { useStacks } from "../store";
import { ContactShade } from "./GroundPool";
import Lift from "./Lift";
import LitImage from "./LitImage";

export type RowItem =
  | { kind: "spine"; x: number; w: number; h: number; color: string }
  | { kind: "flat"; x: number; n: number; colors: string[] }
  | { kind: "lean"; x: number; w: number; h: number; color: string }
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
  let flatUsed = false;
  while (x < width / 2 - 0.25) {
    const roll = rand(i, salt);
    if (roll > 0.7 && coverIdx < covers.length) {
      const w = 0.34;
      items.push({ kind: "cover", x: x + w / 2, ...covers[coverIdx]! });
      x += w + 0.04;
      coverIdx++;
    } else if (roll < 0.04) {
      x += 0.06 + rand(i, salt + 1) * 0.08;
    } else if (!flatUsed && roll >= 0.04 && roll < 0.1) {
      // One horizontal stack lying on the row — real shelves are never all
      // vertical (audit §3-Books).
      const n = 2 + Math.round(rand(i, salt + 6));
      items.push({
        kind: "flat",
        x: x + 0.17,
        n,
        colors: Array.from(
          { length: n },
          (_, j) =>
            palette.spines[Math.floor(rand(i + j, salt + 7) * palette.spines.length)]!,
        ),
      });
      x += 0.34 + 0.03;
      flatUsed = true;
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
  // One spine leaning against the row's end — the packed block otherwise
  // terminates in a dead vertical edge.
  items.push({
    kind: "lean",
    x: x + 0.05,
    w: 0.06,
    h: 0.4 + rand(i, salt + 3) * 0.1,
    color: palette.spines[Math.floor(rand(i, salt + 4) * palette.spines.length)]!,
  });
  return items;
}

// Ridge bands + occasional title dashes for the widest spines, drawn on a
// transparent overlay so the spine keeps its material color. Cached by
// variant — the canvas count stays O(variants), not O(spines).
const spineDetailCache = new Map<string, THREE.CanvasTexture>();
function spineDetailTexture(ink: string, variant: number): THREE.CanvasTexture {
  const key = `${ink}|${variant}`;
  const hit = spineDetailCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  for (const y of [18, 30, 218, 230]) ctx.fillRect(6, y, 52, 5);
  if (variant % 2 === 0) {
    // Title marks — unreadable-by-design dashes where a title would sit.
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.6;
    let y = 68;
    for (let j = 0; j < 3 + (variant % 3); j++) {
      const h = 14 + rand(j, variant) * 22;
      ctx.fillRect(26, y, 11, h);
      y += h + 12;
      if (y > 190) break;
    }
    ctx.globalAlpha = 1;
  }
  const texture = new THREE.CanvasTexture(canvas);
  spineDetailCache.set(key, texture);
  return texture;
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
          <group
            key={i}
            position={[item.x, item.h / 2, 0]}
            rotation={[0, 0, rand(i, salt + 5) * 0.04 - 0.02]}
          >
            <RoundedBox
              castShadow
              args={[item.w, item.h, 0.3]}
              radius={0.012}
              smoothness={4}
            >
              <meshStandardMaterial
                color={item.color}
                roughness={0.55 + rand(i, salt + 6) * 0.35}
              />
            </RoundedBox>
            {item.w >= 0.09 && (
              <mesh position={[0, 0, 0.151]}>
                <planeGeometry args={[item.w * 0.9, item.h * 0.94]} />
                <meshStandardMaterial
                  map={spineDetailTexture(palette.ink, Math.floor(rand(i, salt + 8) * 6))}
                  transparent
                  depthWrite={false}
                  roughness={0.7}
                />
              </mesh>
            )}
          </group>
        ) : item.kind === "flat" ? (
          <group key={i} position={[item.x, 0, 0]}>
            {item.colors.map((color, j) => (
              <RoundedBox
                key={j}
                castShadow
                args={[0.32, 0.052, 0.24]}
                radius={0.008}
                smoothness={4}
                position={[j * 0.012, 0.024 + j * 0.054, 0]}
                rotation={[0, rand(i + j, salt + 9) * 0.16 - 0.08, 0]}
              >
                <meshStandardMaterial color={color} roughness={0.7} />
              </RoundedBox>
            ))}
          </group>
        ) : item.kind === "lean" ? (
          // Contact: rotZ drops one bottom corner — lift by the exact
          // h/2·cos + w/2·sin so the corner stays on the wood.
          <RoundedBox
            key={i}
            castShadow
            args={[item.w, item.h, 0.3]}
            radius={0.012}
            smoothness={4}
            position={[
              item.x,
              (item.h / 2) * Math.cos(0.17) + (item.w / 2) * Math.sin(0.17),
              0,
            ]}
            rotation={[0, 0, 0.17]}
          >
            <meshStandardMaterial color={item.color} roughness={0.65} />
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

// Palette-locked tiling wood grain — long streaks + rare knots drawn over
// the theme's wood hex, doubling as a subtle roughness map (its green
// channel carries the streak variation). Cached per hex × orientation;
// theme flips just switch cache entries.
const woodTextureCache = new Map<string, THREE.CanvasTexture>();
function woodGrainTexture(hex: string, vertical: boolean): THREE.CanvasTexture {
  const key = `${hex}|${vertical ? "v" : "h"}`;
  const hit = woodTextureCache.get(key);
  if (hit) return hit;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 42; i++) {
    const y = rand(i, 301) * size;
    const dark = rand(i, 302) > 0.45;
    ctx.strokeStyle = dark
      ? `rgba(0, 0, 0, ${0.04 + rand(i, 303) * 0.07})`
      : `rgba(255, 240, 210, ${0.03 + rand(i, 304) * 0.05})`;
    ctx.lineWidth = 0.8 + rand(i, 305) * 1.4;
    ctx.beginPath();
    ctx.moveTo(-8, y);
    for (let x = 0; x <= size + 16; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.02 + i * 3.7) * 2.4 + rand(i + x, 306) * 1.6 - 0.8);
    }
    ctx.stroke();
  }
  for (let k = 0; k < 3; k++) {
    const cx = rand(k, 307) * size;
    const cy = rand(k, 308) * size;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.10)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 5 + rand(k, 309) * 7, 2.2 + rand(k, 310) * 2.4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  if (vertical) {
    texture.rotation = Math.PI / 2;
    texture.center.set(0.5, 0.5);
  }
  texture.anisotropy = 4;
  woodTextureCache.set(key, texture);
  return texture;
}

/** Plank/strap material with grain + per-unit tone jitter. The map carries
 * the palette hex, so `color` is just the ±4% scalar. */
function WoodMaterial({
  hex,
  tone = 1,
  vertical = false,
  repeat,
  roughness = 0.72,
}: {
  hex: string;
  tone?: number;
  vertical?: boolean;
  repeat: [number, number];
  roughness?: number;
}) {
  const { map, color } = useMemo(() => {
    const base = woodGrainTexture(hex, vertical);
    const map = base.clone();
    map.needsUpdate = true;
    map.repeat.set(repeat[0], repeat[1]);
    return { map, color: new THREE.Color(tone, tone, tone) };
  }, [hex, vertical, repeat[0], repeat[1], tone]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <meshStandardMaterial
      map={map}
      roughnessMap={map}
      color={color}
      roughness={roughness}
    />
  );
}

export function ShelfUnit({
  children,
  lower,
  palette,
  width = 3.2,
  toneSeed,
}: {
  children?: React.ReactNode;
  lower?: React.ReactNode;
  palette: Palette;
  width?: number;
  /** Unit index — seeds a ±4% wood tone jitter so seven identical units
   * read as seven planks of the same lumber order, not one copy-paste. */
  toneSeed?: number;
}) {
  const tone = toneSeed === undefined ? 1 : 0.96 + rand(toneSeed, 77) * 0.08;
  return (
    <group>
      <RoundedBox castShadow receiveShadow args={[width, 0.07, 0.85]} radius={0.012} smoothness={4}>
        <WoodMaterial hex={palette.wood} tone={tone} repeat={[2.4, 1]} />
      </RoundedBox>
      {/* end-grain darkening at the plank ends */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (width / 2 - 0.006), 0, 0]}>
          <boxGeometry args={[0.013, 0.072, 0.86]} />
          <meshStandardMaterial color={palette.woodDark} roughness={0.85} />
        </mesh>
      ))}
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
            <WoodMaterial
              hex={palette.strap}
              tone={tone}
              vertical
              repeat={[0.4, 3]}
              roughness={0.68}
            />
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
        <WoodMaterial hex={palette.wood} tone={tone} repeat={[2.4, 0.8]} />
      </RoundedBox>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (width / 2 - 0.006), -0.72, -0.08]}>
          <boxGeometry args={[0.013, 0.057, 0.61]} />
          <meshStandardMaterial color={palette.woodDark} roughness={0.85} />
        </mesh>
      ))}
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

/** L-steel bookend — vertical plate + base tongue that slips under the end
 * books. `flip` mirrors it for the far end of a row. */
export function Bookend({
  palette,
  flip = false,
}: {
  palette: Palette;
  flip?: boolean;
}) {
  const s = flip ? -1 : 1;
  return (
    <group>
      <RoundedBox
        castShadow
        args={[0.012, 0.21, 0.13]}
        radius={0.003}
        smoothness={2}
        position={[0, 0.105, 0]}
      >
        <meshStandardMaterial color={palette.metal} metalness={0.4} roughness={0.35} />
      </RoundedBox>
      <RoundedBox
        args={[0.09, 0.008, 0.13]}
        radius={0.003}
        smoothness={2}
        position={[s * 0.048, 0.004, 0]}
      >
        <meshStandardMaterial color={palette.metal} metalness={0.4} roughness={0.35} />
      </RoundedBox>
    </group>
  );
}

export function GlowSprite({
  opacity: baseOpacity,
  eased = false,
}: {
  opacity: number;
  /** Damp opacity by lateral camera distance — an additive sprite over the
   * bright light-theme sky blows out to pure white mid-travel. */
  eased?: boolean;
}) {
  const ref = useRef<THREE.Sprite>(null);
  // Additive glow COMPOUNDS in the composer's linear HDR target (pre-
  // tonemap values ride the ACES shoulder) — halve it there or the lamp
  // reads as an orange searchlight.
  const postfx = useStacks((s) => s.postfx);
  const opacity = baseOpacity * (postfx ? 0.45 : 1);
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
  const world = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const sprite = ref.current;
    if (!sprite || !eased) return;
    sprite.getWorldPosition(world);
    const focus = Math.max(0, 1 - Math.abs(camera.position.x - world.x) / 4.4);
    sprite.material.opacity = opacity * (0.3 + 0.7 * focus);
  });
  return (
    <sprite ref={ref} scale={[1.6, 1.6, 1]}>
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
 * so the room still reads as lit by the lamp, not the model. The emissive
 * bulb is what makes the lamp read ON in the light theme, where the
 * additive sprite nearly vanishes against the bright sky (audit §3-About).
 * `yaw` MUST match the lamp model's y-rotation, and the bulb sits at the
 * MEASURED shade mouth: PCA over the GLB's shade cluster puts the wide
 * opening at local [0, 0.378, −0.037] opening UP-BACK (axis [0,.56,−.83]).
 * Every hand-placed +z offset landed on the cone's solid wall and poked
 * through as a flat disc (two owner "light is broken" screenshots). */
export function LampGlow({
  palette,
  yaw = 0,
}: {
  palette: Palette;
  yaw?: number;
}) {
  return (
    <group rotation={[0, yaw, 0]}>
      <group position={[0, 0.38, -0.04]}>
        <GlowSprite opacity={palette.glowOpacity} eased />
      </group>
      {/* Centered on the rim plane: half the dome peeks over the cup edge
          — an exposed bulb tip, visible from the camera without touching
          the cone wall. */}
      <mesh position={[0, 0.378, -0.037]}>
        <sphereGeometry args={[0.023, 12, 12]} />
        <meshStandardMaterial
          color="#f6e2b8"
          emissive="#ffbe73"
          emissiveIntensity={2.4}
          roughness={0.4}
        />
      </mesh>
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

// Extruded disc with a REAL through-bore — the one feature no proxy mesh
// delivered (v3's cylinders read as "chocolate donuts", the v4 CC-BY dish
// read as dinnerware, per the owner). Real bumper ratio: 450mm disc,
// 50mm bore → hole r ≈ 0.112 × disc r.
const plateGeometryCache = new Map<string, THREE.ExtrudeGeometry>();
function plateGeometry(r: number, depth: number): THREE.ExtrudeGeometry {
  const key = `${r}|${depth}`;
  const hit = plateGeometryCache.get(key);
  if (hit) return hit;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, r, 0, Math.PI * 2, false);
  const bore = new THREE.Path();
  bore.absarc(0, 0, r * 0.112, 0, Math.PI * 2, true);
  shape.holes.push(bore);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 40,
  });
  geo.center();
  plateGeometryCache.set(key, geo);
  return geo;
}

/** Two rubber bumper plates leaning against the shelf back, steel hub
 * rings around the bore. Disc face lies in the extrude's xy plane, so
 * standing them up is the default orientation plus a lean. Rubber keeps
 * its albedo across themes, so the colors are constants, not palette. */
export function BumperPlates() {
  return (
    <group>
      {[
        { r: 0.185, t: 0.052, x: 0, lean: 0.13, yaw: 0.14, color: "#8a4a30" },
        { r: 0.15, t: 0.046, x: 0.31, lean: 0.18, yaw: -0.1, color: "#33302b" },
      ].map((p, i) => (
        <group
          key={i}
          position={[p.x, (p.r + 0.008) * Math.cos(p.lean), 0]}
          rotation={[-p.lean, p.yaw, 0]}
        >
          <mesh castShadow geometry={plateGeometry(p.r, p.t)}>
            <meshStandardMaterial color={p.color} roughness={0.62} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[0, 0, side * (p.t / 2)]}>
              <torusGeometry args={[p.r * 0.112 + 0.011, 0.007, 10, 28]} />
              <meshStandardMaterial
                color="#8a8f94"
                metalness={0.55}
                roughness={0.35}
              />
            </mesh>
          ))}
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
