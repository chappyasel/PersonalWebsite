"use client";

// Easter eggs — quiet, physical, discoverable interactions on the props.
// House rules: a prop only answers when its unit is the ACTIVE one (anywhere
// else the click falls through untouched so unit-tap travel keeps working);
// swipes are not taps (delta gate); all animation runs through refs +
// useFrame + damp — zero React re-renders per frame; prefers-reduced-motion
// skips the motion eggs (the lamp toggle stays — it's a state change, not
// motion). This is a museum at dawn, not an arcade: no confetti, no sound.
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import React, { useMemo, useRef } from "react";
import * as THREE from "three";

import { type Palette } from "../theme";
import { useStacks } from "../store";
import { FootPool } from "./GroundPool";
import ModelProp from "./ModelProp";
import { ClockFace, type ClockSweep } from "./objects";
import { LampGlow } from "./primitives";

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Click/hover shell shared by every egg. Fires only on the active unit —
 * on any other unit the handlers return WITHOUT stopPropagation, so the
 * event continues to the unit's invisible tap plane and travel still works.
 * Hover only claims the store's cursor slot on the active unit, so faraway
 * props never advertise a pointer they won't honor. */
export function EggTrigger({
  unitIndex,
  hoverKey,
  onTrigger,
  children,
}: {
  unitIndex: number;
  hoverKey: string;
  onTrigger: () => void;
  children: React.ReactNode;
}) {
  const setHovered = useStacks((s) => s.setHovered);
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if ((e.delta ?? 0) > 6) return; // swipe, not a tap
        if (useStacks.getState().activeUnit !== unitIndex) return; // fall through → travel
        e.stopPropagation();
        onTrigger();
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        if (useStacks.getState().activeUnit !== unitIndex) return;
        e.stopPropagation();
        setHovered(hoverKey);
      }}
      onPointerOut={() => {
        // Clear only our own hover — a late out must never drop another
        // prop's freshly claimed slot (same rule as the book covers).
        if (useStacks.getState().hovered === hoverKey) setHovered(null);
      }}
    >
      {children}
    </group>
  );
}

/** Desk lamp that clicks OFF and back ON. The egg owns ALL the dimming:
 * a damped 0..1 factor drives a traverse over the LampGlow subtree that
 * scales every light's intensity, every emissive material, and every
 * transparent mesh material's opacity (base values captured on first
 * touch) — so the toggle survives whatever rig LampGlow becomes. Sprites
 * are skipped: they have their own per-frame opacity writer (GlowSprite),
 * which multiplies the same factor in via `litRef`. */
export function EggLamp({
  unitIndex,
  palette,
  dark,
  yaw,
}: {
  unitIndex: number;
  palette: Palette;
  dark: boolean;
  yaw: number;
}) {
  const target = useRef(1);
  const lit = useRef(1);
  const glow = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const g = glow.current;
    if (!g) return;
    let next = THREE.MathUtils.damp(lit.current, target.current, 9, delta);
    if (Math.abs(next - target.current) < 1e-3) next = target.current;
    if (next === lit.current) return;
    // Leaving fully-lit re-captures every base: at factor 1 the current
    // values ARE the rig's own, including anything React rewrote while the
    // lamp sat ON (a theme flip changes palette-driven opacities).
    const refresh = lit.current === 1;
    lit.current = next;
    g.traverse((o) => {
      if (o instanceof THREE.Light) {
        const data = o.userData as { eggBase?: number };
        if (refresh || data.eggBase === undefined) data.eggBase = o.intensity;
        o.intensity = data.eggBase * next;
        return;
      }
      if (o instanceof THREE.Sprite || !(o instanceof THREE.Mesh)) return;
      if (Array.isArray(o.material)) return;
      const material = o.material as THREE.Material & {
        emissiveIntensity?: number;
      };
      const data = material.userData as {
        eggBaseEmissive?: number;
        eggBaseOpacity?: number;
      };
      if (typeof material.emissiveIntensity === "number") {
        if (refresh || data.eggBaseEmissive === undefined)
          data.eggBaseEmissive = material.emissiveIntensity;
        material.emissiveIntensity = data.eggBaseEmissive * next;
      }
      if (material.transparent) {
        if (refresh || data.eggBaseOpacity === undefined)
          data.eggBaseOpacity = material.opacity;
        material.opacity = data.eggBaseOpacity * next;
      }
    });
  });
  return (
    <group>
      <EggTrigger
        unitIndex={unitIndex}
        hoverKey={`egg:lamp:${unitIndex}`}
        onTrigger={() => {
          target.current = target.current ? 0 : 1;
        }}
      >
        <React.Suspense fallback={null}>
          <ModelProp
            url="/models/desk-lamp.glb"
            dark={dark}
            rotation={[0, yaw, 0]}
          />
        </React.Suspense>
      </EggTrigger>
      {/* Sibling of the trigger, never a child — the additive glow sprite
          must not become a giant invisible click target. yaw keeps the
          cone rig pointed out the shade's real opening. */}
      <group ref={glow}>
        <LampGlow palette={palette} yaw={yaw} litRef={lit} />
      </group>
    </group>
  );
}

/** One slow damped revolution per click (the globe). Wrap this at the
 * prop's own position — the spin is about the wrapper's origin. */
export function SpinProp({
  unitIndex,
  hoverKey,
  children,
}: {
  unitIndex: number;
  hoverKey: string;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const target = useRef(0);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g || g.rotation.y === target.current) return;
    const next = THREE.MathUtils.damp(g.rotation.y, target.current, 1.4, delta);
    g.rotation.y =
      Math.abs(next - target.current) < 1e-3 ? target.current : next;
  });
  return (
    <EggTrigger
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      onTrigger={() => {
        // Mid-spin clicks stack another lap — a globe you can keep spinning
        // faster is more honest than one that ignores you.
        if (!reducedMotion()) target.current += Math.PI * 2;
      }}
    >
      <group ref={ref}>{children}</group>
    </EggTrigger>
  );
}

/** One soft vertical bounce that lands exactly back at rest (the
 * basketball): an impulse + softened gravity + restitution mini-sim, cut
 * off after the small second hop so it settles instead of dribbling. */
export function BounceProp({
  unitIndex,
  hoverKey,
  children,
}: {
  unitIndex: number;
  hoverKey: string;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const vy = useRef(0);
  const airborne = useRef(false);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g || !airborne.current) return;
    const dt = Math.min(delta, 1 / 30); // a tab-switch delta would tunnel
    vy.current -= 5.4 * dt; // softened gravity — museum, not gym
    g.position.y += vy.current * dt;
    if (g.position.y <= 0) {
      g.position.y = 0;
      vy.current = -vy.current * 0.45;
      if (vy.current < 0.3) {
        vy.current = 0;
        airborne.current = false;
      }
    }
  });
  return (
    <EggTrigger
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      onTrigger={() => {
        if (reducedMotion() || airborne.current) return;
        vy.current = 1.35; // apex ≈ 0.17 — clears the shelf books, not the plank above
        airborne.current = true;
      }}
    >
      <group ref={ref}>{children}</group>
    </EggTrigger>
  );
}

/** Clock egg. The clocks show the VISITOR'S live local time at rest; a
 * click winds the hands clockwise to 3:45 — the owner's wake time — holds
 * a beat, then winds on around to the live time again. That contrast is
 * the whole joke. All sweep math lives in ClockFace; the trigger only
 * stamps the start time. */
export function EggClock({
  unitIndex,
  hoverKey,
  facePosition,
  faceRadius,
  children,
}: {
  unitIndex: number;
  hoverKey: string;
  facePosition: [number, number, number];
  faceRadius: number;
  children: React.ReactNode;
}) {
  const sweep = useRef<ClockSweep | null>(null);
  return (
    <EggTrigger
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      onTrigger={() => {
        if (reducedMotion() || sweep.current) return;
        sweep.current = { start: performance.now() };
      }}
    >
      {children}
      <group position={facePosition}>
        <ClockFace radius={faceRadius} sweepRef={sweep} />
      </group>
    </EggTrigger>
  );
}

// --- Tea steam ---------------------------------------------------------

const WISPS = [
  { delay: 0, x: -0.01, phase: 0 },
  { delay: 0.42, x: 0.014, phase: 2.1 },
  { delay: 0.85, x: 0.002, phase: 4.4 },
];
const STEAM_LIFE = 1.7;
const STEAM_TOTAL = 0.85 + STEAM_LIFE;

let steamTexture: THREE.CanvasTexture | null = null;
function getSteamTexture(): THREE.CanvasTexture {
  if (steamTexture) return steamTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2,
  );
  grad.addColorStop(0, "rgba(255, 246, 232, 0.9)");
  grad.addColorStop(0.55, "rgba(255, 246, 232, 0.28)");
  grad.addColorStop(1, "rgba(255, 246, 232, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  steamTexture = new THREE.CanvasTexture(canvas);
  return steamTexture;
}

/** Cup of tea that answers a click with three faint steam wisps (~2.5s).
 * Sprites live OUTSIDE the trigger group so the invisible quads never
 * intercept taps; they stay visible=false except mid-animation. Additive
 * blending reads as lit vapor at night but physically cannot show against
 * the light theme's near-white sky, so light falls back to normal-blend
 * alpha mist. */
export function SteamCup({
  unitIndex,
  hoverKey,
  steamAt,
  dark,
  children,
}: {
  unitIndex: number;
  hoverKey: string;
  /** Wisp origin (the cup mouth) in the same space as `children`. */
  steamAt: [number, number, number];
  dark: boolean;
  children: React.ReactNode;
}) {
  const started = useRef(0);
  const sprites = useRef<(THREE.Sprite | null)[]>([]);
  const texture = useMemo(getSteamTexture, []);
  useFrame(() => {
    if (!started.current) return;
    const t = (performance.now() - started.current) / 1000;
    // Additive sprites compound in the composer's linear HDR target — halve
    // there, same rule as GlowSprite. Alpha mist doesn't compound.
    const fade = dark && useStacks.getState().postfx ? 0.5 : 1;
    // Light needs bigger, denser wisps: an alpha veil starts from far less
    // contrast than additive-on-night ever does.
    const peak = dark ? 0.3 : 0.38;
    const sizeMul = dark ? 1 : 1.7;
    for (let i = 0; i < WISPS.length; i++) {
      const sprite = sprites.current[i];
      const w = WISPS[i]!;
      if (!sprite) continue;
      const p = (t - w.delay) / STEAM_LIFE;
      if (p <= 0 || p >= 1) {
        sprite.visible = false;
        continue;
      }
      sprite.visible = true;
      sprite.position.set(
        w.x + Math.sin(p * 5 + w.phase) * 0.016 * p,
        0.015 + p * 0.24,
        0,
      );
      const s = (0.05 + p * 0.08) * sizeMul;
      sprite.scale.set(s, s * 1.35, 1);
      sprite.material.opacity = peak * Math.sin(Math.PI * p) * fade;
    }
    if (t > STEAM_TOTAL) {
      started.current = 0;
      for (const sprite of sprites.current) if (sprite) sprite.visible = false;
    }
  });
  return (
    <group>
      <EggTrigger
        unitIndex={unitIndex}
        hoverKey={hoverKey}
        onTrigger={() => {
          if (reducedMotion() || started.current) return;
          started.current = performance.now();
        }}
      >
        {children}
      </EggTrigger>
      <group position={steamAt}>
        {WISPS.map((w, i) => (
          <sprite
            key={i}
            ref={(el) => {
              sprites.current[i] = el;
            }}
            visible={false}
          >
            <spriteMaterial
              map={texture}
              // Vapor over a BRIGHT sky reads slightly darker, not brighter —
              // pale tints measured ~3% luminance delta (invisible), so light
              // uses the palette's ink at low alpha: a translucent gray veil.
              color={dark ? "#ffffff" : "#6e5d49"}
              transparent
              opacity={0}
              blending={dark ? THREE.AdditiveBlending : THREE.NormalBlending}
              depthWrite={false}
              fog={false}
            />
          </sprite>
        ))}
      </group>
    </group>
  );
}

/** Golf ball that rolls a few cm and settles (damped), alternating
 * direction per click — idly knocked back and forth by the club head. Owns
 * its FootPool so the contact shadow rides along with the roll. */
export function RollBall({
  unitIndex,
  hoverKey,
  palette,
  position,
}: {
  unitIndex: number;
  hoverKey: string;
  palette: Palette;
  /** Ground-level base (unit-local); the ball center sits 0.045 above it. */
  position: [number, number, number];
}) {
  const ref = useRef<THREE.Group>(null);
  const out = useRef(false);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const target = out.current ? 0.22 : 0;
    if (g.position.x === target) return;
    const next = THREE.MathUtils.damp(g.position.x, target, 3.2, delta);
    g.position.x = Math.abs(next - target) < 5e-4 ? target : next;
  });
  return (
    <group position={position}>
      <EggTrigger
        unitIndex={unitIndex}
        hoverKey={hoverKey}
        onTrigger={() => {
          if (!reducedMotion()) out.current = !out.current;
        }}
      >
        <group ref={ref}>
          <mesh position={[0, 0.045, 0]}>
            <sphereGeometry args={[0.045, 16, 16]} />
            <meshStandardMaterial color={palette.pages} roughness={0.55} />
          </mesh>
          {/* Generous invisible hit proxy — the ball itself is a 9cm target.
              Zero-opacity mesh, the same trick as the unit tap plane. */}
          <mesh position={[0, 0.06, 0]}>
            <sphereGeometry args={[0.11, 8, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <FootPool color={palette.shadow} size={[0.14, 0.12]} />
        </group>
      </EggTrigger>
    </group>
  );
}
