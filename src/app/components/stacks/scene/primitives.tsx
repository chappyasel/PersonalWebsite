"use client";

// Shelf-world primitives ported from the approved prototype: shelf units,
// packed book rows, piles, lamp + glow, frames, and training props.
// Box props use RoundedBox — edge highlights are the cheapest "crafted vs
// primitive" signal; perfect 90° corners are the strongest primitive tell.
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { type Palette, proxied, rand } from "../theme";
import { useStacks } from "../store";
import { ContactShade } from "./GroundPool";
import Lift from "./Lift";
import PropLink from "./links";
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

/** A scenery book in a packed row: a plain positioned group, or — when the
 * row knows its unit — a door into the library with the standard hover lift.
 * The five featured covers keep their own modal; everything else on the
 * shelf is the rest of the library, so it opens the library. */
function ShelfBook({
  linkUnit,
  hoverKey,
  base,
  lift,
  children,
}: {
  linkUnit?: number;
  hoverKey: string;
  base: [number, number, number];
  lift: [number, number, number];
  children: React.ReactNode;
}) {
  if (linkUnit === undefined) return <group position={base}>{children}</group>;
  return (
    <PropLink
      unitIndex={linkUnit}
      to="books"
      hoverKey={hoverKey}
      base={base}
      lift={lift}
    >
      {children}
    </PropLink>
  );
}

const SPINE_LIFT: [number, number, number] = [0, 0.035, 0.02];
const FLAT_LIFT: [number, number, number] = [0, 0.025, 0.025];

export function BookRowMesh({
  items,
  palette,
  salt,
  textured = true,
  coverWidth = 384,
  onCoverClick,
  linkUnit,
}: {
  items: RowItem[];
  palette: Palette;
  salt: number;
  /** false = proximity LOD says far: covers render as blank boards so the
   * packing silhouette is stable while textures stay unmounted. */
  textured?: boolean;
  coverWidth?: 256 | 384;
  onCoverClick?: (key: string) => void;
  /** Unit index — set it and every non-cover book in the row becomes a door
   * into the library (gated on that unit being the active one). */
  linkUnit?: number;
}) {
  const setHovered = useStacks((s) => s.setHovered);
  return (
    <group>
      {items.map((item, i) =>
        item.kind === "spine" ? (
          <ShelfBook
            key={i}
            linkUnit={linkUnit}
            hoverKey={`link:row:${linkUnit}:${salt}:${i}`}
            base={[item.x, item.h / 2, 0]}
            lift={SPINE_LIFT}
          >
            <group rotation={[0, 0, rand(i, salt + 5) * 0.04 - 0.02]}>
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
          </ShelfBook>
        ) : item.kind === "flat" ? (
          // Each volume in the horizontal stack is its own door, for the same
          // reason as BookPile: a shared hoverKey lifted the whole stack as
          // one slab.
          <group key={i}>
            {item.colors.map((color, j) => (
              <ShelfBook
                key={j}
                linkUnit={linkUnit}
                hoverKey={`link:row:${linkUnit}:${salt}:${i}:${j}`}
                base={[item.x + j * 0.012, 0.024 + j * 0.054, 0]}
                lift={FLAT_LIFT}
              >
                <RoundedBox
                  castShadow
                  args={[0.32, 0.052, 0.24]}
                  radius={0.008}
                  smoothness={4}
                  rotation={[0, rand(i + j, salt + 9) * 0.16 - 0.08, 0]}
                >
                  <meshStandardMaterial color={color} roughness={0.7} />
                </RoundedBox>
              </ShelfBook>
            ))}
          </group>
        ) : item.kind === "lean" ? (
          // Contact: rotZ drops one bottom corner — lift by the exact
          // h/2·cos + w/2·sin so the corner stays on the wood.
          <ShelfBook
            key={i}
            linkUnit={linkUnit}
            hoverKey={`link:row:${linkUnit}:${salt}:${i}`}
            base={[
              item.x,
              (item.h / 2) * Math.cos(0.17) + (item.w / 2) * Math.sin(0.17),
              0,
            ]}
            lift={SPINE_LIFT}
          >
            <RoundedBox
              castShadow
              args={[item.w, item.h, 0.3]}
              radius={0.012}
              smoothness={4}
              rotation={[0, 0, 0.17]}
            >
              <meshStandardMaterial color={item.color} roughness={0.65} />
            </RoundedBox>
          </ShelfBook>
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
  linkUnit,
}: {
  palette: Palette;
  x?: number;
  salt?: number;
  /** Unit index — set it and the stack (never its contact shade, which stays
   * planted on the wood) becomes a door into the library. */
  linkUnit?: number;
}) {
  // One link PER BOOK, not one for the stack. Wrapping the whole pile in a
  // single PropLink made three books rise together under the pointer, which
  // the owner clocked immediately as "some of the books hover in groups
  // rather than one-by-one" — the pile stopped reading as books and started
  // reading as one moulded object.
  const stack = palette.pile.map((_, i) => {
    // 0.026 = half height 0.03 sunk by ~radius/2 to bury the bevel rim.
    const base: [number, number, number] = [i * 0.02, 0.026 + i * 0.066, 0];
    const book = (
      <group rotation={[0, rand(i, salt) * 0.5 - 0.25, 0]}>
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
    );
    return linkUnit === undefined ? (
      <group key={i} position={base}>
        {book}
      </group>
    ) : (
      <PropLink
        key={i}
        unitIndex={linkUnit}
        to="books"
        hoverKey={`link:pile:${linkUnit}:${salt}:${i}`}
        base={base}
        lift={[0, 0.028, 0.025]}
      >
        {book}
      </PropLink>
    );
  });
  return (
    <group position={[x, 0, 0]}>
      <ContactShade
        color={palette.shadow}
        width={0.62}
        position={[0.02, 0.03, 0.02]}
      />
      {stack}
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

// Bulb halo. The old two-stop gradient ended its ramp with a hard slope
// change at the disc edge, and a slope change in a shallow gradient is a
// Mach band — at lamp scale that printed as a visible circle in the sky,
// which is what the owner saw and called "this line in the background".
// These stops trace a gaussian and arrive at the rim with a near-zero
// derivative, so the halo has no edge to find.
let glowTextureCache: THREE.CanvasTexture | null = null;
function glowTexture(): THREE.CanvasTexture {
  if (glowTextureCache) return glowTextureCache;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2,
  );
  for (const [stop, a] of [
    [0, 1], [0.12, 0.82], [0.24, 0.56], [0.36, 0.34],
    [0.5, 0.17], [0.64, 0.072], [0.78, 0.024], [0.9, 0.005], [1, 0],
  ] as const) {
    grad.addColorStop(stop, `rgba(255, 186, 112, ${a})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  glowTextureCache = new THREE.CanvasTexture(canvas);
  return glowTextureCache;
}

export function GlowSprite({
  opacity: baseOpacity,
  eased = false,
  scale = 1.6,
  factorRef,
}: {
  opacity: number;
  /** Damp opacity by lateral camera distance — an additive sprite over the
   * bright light-theme sky blows out to pure white mid-travel. */
  eased?: boolean;
  scale?: number;
  /** Per-frame 0..1 multiplier read imperatively (the lamp-toggle egg) —
   * never route it through React state. */
  factorRef?: { current: number };
}) {
  const ref = useRef<THREE.Sprite>(null);
  // Additive glow COMPOUNDS in the composer's linear HDR target (pre-
  // tonemap values ride the ACES shoulder) — halve it there or the lamp
  // reads as an orange searchlight.
  const postfx = useStacks((s) => s.postfx);
  const opacity = baseOpacity * (postfx ? 0.45 : 1);
  const texture = useMemo(() => glowTexture(), []);
  const world = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const sprite = ref.current;
    if (!sprite || (!eased && !factorRef)) return;
    let value = opacity;
    if (eased) {
      sprite.getWorldPosition(world);
      const focus = Math.max(0, 1 - Math.abs(camera.position.x - world.x) / 4.4);
      value *= 0.3 + 0.7 * focus;
    }
    sprite.material.opacity = value * (factorRef?.current ?? 1);
  });
  return (
    <sprite ref={ref} scale={[scale, scale, 1]}>
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

/** The lamp's light.
 *
 * v4.7: the mouth is now MEASURED, not guessed. The shade's opening is a
 * hole in desk-lamp.glb, so it is literally a boundary edge loop — the
 * edges used by exactly one triangle. There is exactly one such loop on the
 * shade: 16 points, centre [0, 0.3989, 0.0107], radius 0.0336, standard
 * deviation 0.0000, planar to ±1e-5. A perfect circle, no fitting required.
 *
 * The old rig had the disc at [0, 0.292, 0.09] with radius 0.042 tilted
 * 0.595 rad — 10cm BELOW the real opening, 8cm proud of it, oversized, and
 * 32° off the shade's true axis. That is exactly the crescent of dark down
 * one side of the mouth the owner reported, and why the pool was thrown too
 * far forward: the spot was aimed along [0, −0.56, 0.83] when the shade
 * actually points [0, −0.917, 0.400].
 *
 * v4.4 rebuild. Three previous versions failed the same way — they FAKED
 * light with geometry (a bulb sphere, then a gradient beam cone, under a
 * one-world-unit additive haze sprite). Every fake reads as a decal the
 * moment the camera moves off-axis, and the haze was so wide it doubled as
 * weather. So: nothing here draws light except things that are actually
 * light. A SpotLight down the cup axis makes the pool, a small emissive
 * disc seals the mouth so the source itself is visibly hot, a shade-mouth
 * halo the size of the shade covers the no-composer path, and two weak
 * points warm the cup interior and the props beside it. On desktop the
 * halo you actually see is Bloom's, earned by the disc sitting above the
 * threshold — which is what makes it behave like light instead of a sticker.
 *
 * `litRef` (the lamp-toggle egg's damped 0..1 factor) only threads to the
 * self-animating GlowSprite; lights and emissives are dimmed generically by
 * the egg's traverse, so this rig owns no toggle logic. */
/** Measured from desk-lamp.glb's boundary edge loop — see LampGlow. */
const MOUTH: [number, number, number] = [0, 0.3989, 0.0107];
const MOUTH_R = 0.0336;
/** Rotation about X that lays circleGeometry's +Z normal onto AXIS. */
const MOUTH_TILT = 1.1597;
const AXIS: [number, number, number] = [0, -0.9167, 0.3996];

export function LampGlow({
  palette,
  yaw = 0,
  litRef,
}: {
  palette: Palette;
  yaw?: number;
  litRef?: { current: number };
}) {
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  useEffect(() => {
    if (spotRef.current && targetRef.current)
      spotRef.current.target = targetRef.current;
  }, []);
  return (
    <group rotation={[0, yaw, 0]}>
      {/* Halo, sized to the shade rather than to the bay — a glow wider than
          the object making it is fog, not light. Centred just OUT of the
          mouth along the axis, not on the mouth: centred on the mouth it
          straddles the shade and reads as the whole lamp glowing, which is
          the "trash lamp" failure mode all over again. */}
      <group
        position={[
          MOUTH[0] + AXIS[0] * 0.05,
          MOUTH[1] + AXIS[1] * 0.05,
          MOUTH[2] + AXIS[2] * 0.05,
        ]}
      >
        <GlowSprite
          opacity={palette.glowOpacity}
          eased
          scale={0.18}
          factorRef={litRef}
        />
      </group>
      {/* Emissive disc ON the measured opening plane, a whisker inside the
          rim so it can never silhouette past the shade from any angle. It
          clears Bloom's 0.95 threshold, so on desktop the composer grows the
          soft falloff for us. DoubleSide because the mouth faces down-and-
          forward, i.e. away from a camera that sits above the shelf line. */}
      <mesh position={MOUTH} rotation={[MOUTH_TILT, 0, 0]}>
        <circleGeometry args={[MOUTH_R * 0.96, 28]} />
        <meshStandardMaterial
          color="#fff1d6"
          emissive="#ffc98a"
          emissiveIntensity={3.4}
          roughness={0.4}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* The pool: a spot down the TRUE cup axis — light leaves the opening,
          and it leaves along the direction the shade actually points. */}
      <spotLight
        ref={spotRef}
        position={[MOUTH[0], MOUTH[1] - 0.004, MOUTH[2] + 0.002]}
        color="#ffbe73"
        intensity={7.5}
        angle={0.66}
        penumbra={0.85}
        distance={3.6}
        decay={2}
      />
      <object3D
        ref={targetRef}
        position={[
          MOUTH[0] + AXIS[0] * 1.2,
          MOUTH[1] + AXIS[1] * 1.2,
          MOUTH[2] + AXIS[2] * 1.2,
        ]}
      />
      {/* Inside the cup, ~3cm back up the axis: the shade's own interior has
          to glow or the lamp reads as a torch someone left on a stick. */}
      <pointLight
        position={[
          MOUTH[0] - AXIS[0] * 0.03,
          MOUTH[1] - AXIS[1] * 0.03,
          MOUTH[2] - AXIS[2] * 0.03,
        ]}
        color="#ffcf96"
        intensity={0.22}
        distance={0.42}
        decay={2}
      />
      {/* Ambient kiss on the neighbouring props — the spot is a cone, so
          without this the books a foot away sit in the dark next to a lit
          lamp, which is the one thing a real desk lamp never does. */}
      <pointLight
        position={[
          MOUTH[0] + AXIS[0] * 0.16,
          MOUTH[1] + AXIS[1] * 0.16,
          MOUTH[2] + AXIS[2] * 0.16,
        ]}
        color="#ffbe73"
        intensity={0.85}
        distance={1.9}
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
 * its albedo across themes, so the colors are constants, not palette.
 * `linkUnit` turns the pair into a door to the weightlifting log. */
export function BumperPlates({ linkUnit }: { linkUnit?: number }) {
  const plates = (
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
  if (linkUnit === undefined) return plates;
  return (
    <PropLink
      unitIndex={linkUnit}
      to="weightlifting"
      hoverKey={`link:plates:${linkUnit}`}
      // Iron doesn't leap — the smallest lift in the scene.
      lift={[0, 0.018, 0.015]}
    >
      {plates}
    </PropLink>
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
