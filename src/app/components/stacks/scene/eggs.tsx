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
import ModelProp, { SPIN_NODE } from "./ModelProp";
import { ClockFace, type ClockSweep } from "./objects";
import { LampGlow } from "./primitives";

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Ambient motion runs on the unit you are looking at and its immediate
 * neighbours, and nowhere else. Seven units' worth of idling props is work
 * nobody can see, and `getState` is a plain read — no subscription, no
 * re-render — so this is cheap enough to call per prop per frame. */
function nearActive(unitIndex: number): boolean {
  return Math.abs(useStacks.getState().activeUnit - unitIndex) <= 1;
}

/** Is `node` still attached under `root`? A prop rebuilt by ModelProp's memo
 * (a theme flip clones a fresh scene) leaves any cached child orphaned. */
function isDescendantOf(node: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = node; o; o = o.parent) {
    if (o === root) return true;
  }
  return false;
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
  scale = 1.49,
}: {
  unitIndex: number;
  palette: Palette;
  dark: boolean;
  yaw: number;
  /** Model AND rig together — never scale the ModelProp alone.
   *
   * desk-lamp.glb is 0.4163 tall, which at the room's shelf scale (~2.0 world
   * units per metre, from the books) is a 0.21 m lamp: half of the real
   * thing. The reason it stayed that way is that LampGlow's constants —
   * MOUTH [0, 0.3989, 0.0107], MOUTH_R, AXIS and every offset derived from
   * them — are measured in UNSCALED model space and the rig is a SIBLING of
   * the ModelProp, so scaling the model alone tears the light off the shade.
   * Scaling the shared parent moves both together and keeps the mouth
   * registered to the hole it was measured from.
   * 1.49, not the 1.92 a 0.40 m lamp wants: both lamps sit on a LOWER shelf
   * and the plank above is 0.6575 away. 1.49 lands 0.620, which also matches
   * the table lamp on Musings (0.3249 x 1.9 = 0.617) — the two silhouettes
   * differ, their heights should not. */
  scale?: number;
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
    // The scale lives HERE, on the shared parent, so the model and the light
    // rig move as one object. Scaling the ModelProp alone would leave
    // LampGlow's measured mouth behind at the old size.
    <group scale={scale}>
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
        {/* A parent scale moves the lights but does NOT touch their `distance`
            — that is a world-space property, not a transform — so the reach
            has to be scaled by hand or a bigger lamp lights a smaller pool. */}
        <LampGlow palette={palette} yaw={yaw} litRef={lit} reach={scale} />
      </group>
    </group>
  );
}

/** One slow damped revolution per click (the globe), over a continuous idle
 * drift. The drift is what makes the room read as running rather than
 * paused: everything else in the scene only moves because you moved it.
 * A globe turning once every couple of minutes is slow enough that you
 * notice it the second time you look, which is the right speed for a
 * thing sitting on a shelf. Wrap this at the prop's own position — the
 * spin is about the wrapper's origin.
 *
 * If the wrapped prop isolated a part under SPIN_NODE (ModelProp's
 * `spinPart`), that node is turned INSTEAD of the wrapper — the globe's ball
 * revolves inside its stand and meridian ring rather than the whole thing
 * rotating like a turntable. Everything else is unchanged: same damping, same
 * click-adds-a-lap, same idle drift, same reduced-motion and near-active
 * gates. Only the node being written to differs. */
export function SpinProp({
  unitIndex,
  hoverKey,
  idleRate = 0,
  children,
}: {
  unitIndex: number;
  hoverKey: string;
  /** Radians per second of unprompted rotation. */
  idleRate?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const target = useRef(0);
  const spinNode = useRef<THREE.Object3D | null>(null);
  const written = useRef<THREE.Object3D | null>(null);
  const still = useMemo(() => reducedMotion(), []);
  useFrame((_, delta) => {
    const root = ref.current;
    if (!root) return;
    // The prop mounts behind Suspense and is rebuilt whenever ModelProp's memo
    // re-runs (a theme flip clones a fresh scene), so a cached node can go
    // stale. Re-resolve only when the cache is empty or detached; the subtree
    // is a handful of nodes and this never runs on a steady frame.
    let node = spinNode.current;
    if (!node || !isDescendantOf(node, root)) {
      node = root.getObjectByName(SPIN_NODE) ?? null;
      spinNode.current = node;
    }
    // No isolated part — turn the whole prop, which is what every other
    // SpinProp caller wants.
    const g = node ?? root;
    // Hand the angle over cleanly when the isolated part appears. The prop
    // loads behind Suspense, so the first frames turn the WRAPPER; without
    // this the wrapper keeps that residual rotation forever and the stand
    // sits permanently askew while the ball turns inside it.
    const previous = written.current;
    if (previous && previous !== g) previous.rotation.y = 0;
    written.current = g;
    // Advance the target rather than the rotation, so a click's extra lap
    // rides on top of the drift instead of fighting it — and don't advance
    // it at all off-screen, or coming back would spin up the difference in
    // one lurch.
    if (idleRate && !still && nearActive(unitIndex)) {
      target.current += idleRate * Math.min(delta, 1 / 30);
    } else if (g.rotation.y === target.current) return;
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

/** The one thing on these shelves that was always going to move on its own
 * and didn't. ClockFace redraws its canvas twice a minute — correct for
 * hour and minute hands, and the reason both clocks read as stopped.
 *
 * A second hand can't live in that texture: it would mean a 256px redraw and
 * a GPU upload every frame. So it is geometry, rotated in place, and it beats
 * once a second rather than sweeping — a deadbeat tick with a hair of
 * overshoot is what a clock in a quiet room actually does, and it is far
 * easier to catch out of the corner of your eye than a smooth crawl. */
function SecondHand({ radius }: { radius: number }) {
  const ref = useRef<THREE.Group>(null);
  const still = useMemo(() => reducedMotion(), []);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const s = still
      ? new Date().getSeconds()
      : Math.floor((Date.now() / 1000) % 60);
    const target = -(s / 60) * Math.PI * 2;
    if (still) {
      g.rotation.z = target;
      return;
    }
    // Shortest way round, so 59 → 0 ticks forward instead of unwinding a
    // whole minute backwards.
    let d = target - g.rotation.z;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    g.rotation.z = THREE.MathUtils.damp(
      g.rotation.z,
      g.rotation.z + d,
      26,
      delta,
    );
  });
  return (
    <group ref={ref} position={[0, 0, 0.0016]}>
      {/* Offset by half its length so the hand pivots at the dial centre,
          with a short counterweight past it — the detail that stops it
          reading as a spinning stick. */}
      <mesh position={[0, radius * 0.31, 0]}>
        <boxGeometry args={[radius * 0.045, radius * 0.86, 0.0012]} />
        <meshStandardMaterial color="#9c3a2c" roughness={0.5} />
      </mesh>
      <mesh position={[0, -radius * 0.12, 0]}>
        <boxGeometry args={[radius * 0.06, radius * 0.24, 0.0012]} />
        <meshStandardMaterial color="#9c3a2c" roughness={0.5} />
      </mesh>
    </group>
  );
}

/** A draught in the room. Plants are the only props with anything flexible
 * about them, so they are the ones that can carry it — a degree and a half
 * of lean, each on its own phase and rate so the shelf never breathes in
 * unison. Pivots at the group origin, which by the scene's convention is
 * where the pot meets the wood. */
export function Sway({
  unitIndex,
  amount = 0.026,
  rate = 0.42,
  phase = 0,
  children,
}: {
  unitIndex: number;
  /** Peak lean in radians. */
  amount?: number;
  /** Radians per second of the driving sine. */
  rate?: number;
  phase?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const still = useMemo(() => reducedMotion(), []);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g || still || !nearActive(unitIndex)) return;
    const t = clock.elapsedTime * rate + phase;
    // Two incommensurate rates on each axis, so the path is a slow wander
    // rather than a metronome. The x term is the smaller of the two — a
    // plant nodding toward the viewer reads as a bug.
    g.rotation.z = amount * (0.72 * Math.sin(t) + 0.28 * Math.sin(t * 1.71));
    g.rotation.x = amount * 0.45 * Math.sin(t * 0.83 + 1.1);
  });
  return <group ref={ref}>{children}</group>;
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
        <SecondHand radius={faceRadius} />
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
  always = false,
  children,
}: {
  unitIndex: number;
  hoverKey: string;
  /** Wisp origin (the cup mouth) in the same space as `children`. */
  steamAt: [number, number, number];
  dark: boolean;
  /** Steam without being asked. A hot drink that only steams when clicked
   * is a button; one that always steams is a hot drink. The click survives
   * as a stronger puff, so the egg is still there to find. */
  always?: boolean;
  children: React.ReactNode;
}) {
  const started = useRef(0);
  const sprites = useRef<(THREE.Sprite | null)[]>([]);
  const texture = useMemo(getSteamTexture, []);
  const still = useMemo(() => reducedMotion(), []);
  useFrame(() => {
    // Ambient mode runs off the wall clock with each wisp on its own phase,
    // so the three of them stagger forever instead of marching in step.
    if (always && !still && nearActive(unitIndex)) {
      const now = performance.now() / 1000;
      const boost = started.current
        ? Math.max(0, 1 - (performance.now() - started.current) / 1600)
        : 0;
      const fade = dark && useStacks.getState().postfx ? 0.5 : 1;
      const peak = (dark ? 0.22 : 0.28) * (1 + boost);
      const sizeMul = (dark ? 1 : 1.7) * (1 + boost * 0.35);
      for (let i = 0; i < WISPS.length; i++) {
        const sprite = sprites.current[i];
        const w = WISPS[i]!;
        if (!sprite) continue;
        const p = ((now + w.delay * 2.2) / STEAM_LIFE) % 1;
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
      return;
    }
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
          if (still) return;
          // In ambient mode the stamp is a boost rather than a start, so a
          // second click while the first is still decaying just refreshes it.
          if (!always && started.current) return;
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
