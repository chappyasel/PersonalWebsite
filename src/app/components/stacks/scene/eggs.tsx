"use client";

// Easter eggs — quiet, physical, discoverable interactions on the props.
// House rules: a prop only answers when its unit is the ACTIVE one (anywhere
// else the click falls through untouched so unit-tap travel keeps working);
// swipes are not taps (delta gate); all animation runs through refs +
// useFrame + damp — zero React re-renders per frame; prefers-reduced-motion
// skips the motion eggs (the lamp toggle stays — it's a state change, not
// motion). This is a museum at dawn, not an arcade: no confetti, no sound.
import { isWorldRevealed } from "../boot/worldBootSession";
import { arrivalBeatRef, useStacks } from "../store";
import { type Palette } from "../theme";
import { type ThreeEvent } from "@react-three/fiber";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { FootPool } from "./GroundPool";
import ModelProp, { SPIN_NODE } from "./ModelProp";
import { DESK_LAMP_HEAD_PIVOT, type QuaternionTuple } from "./deskLampHead";
import { clearanceAbove, meshBoxInLocal } from "./interaction";
import {
  getSceneInteraction,
  registerSceneInteraction,
  runSceneInteractionActivation,
} from "./interactionRegistry";
import { type Island, extractTriangles, findIslands } from "./islands";
import { getMeadowDisturbance } from "./meadowDisturbance";
import { sampleMeadowWind } from "./meadowMotion";
import { ClockFace, type ClockFaceStyle, type ClockSweep } from "./objects";
import { LampGlow } from "./primitives";
import { propReactionIsEngaged } from "./reactionEngagement";
import {
  SCENE_IMPULSE_LIGHT_DURATION,
  getSceneImpulse,
  sceneImpulseLightScale,
  sceneImpulseStrengthAt,
} from "./sceneImpulse";
import { useUnitRealLights } from "./scenePerformance";
import type { SpinHandle } from "./spinHandle";
import { type SteamSample, writeSteamSample } from "./steamMotion";
import { createSwaySpring, stepSway } from "./swayMotion";
import { useUnitFrame } from "./unitActivity";

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
  activeUnitIndexes,
  hoverKey,
  onTrigger,
  touchable = true,
  activateOnFirstTouch = false,
  reducedMotionBehavior = "skip",
  children,
}: {
  unitIndex: number;
  /** Inter-unit fixtures can belong to both adjacent stops. */
  activeUnitIndexes?: readonly number[];
  hoverKey: string;
  onTrigger: () => void;
  /** False when touch owns a separate focus-only interaction for this prop. */
  touchable?: boolean;
  /** Run on the first stationary tap instead of requiring Touch Focus first. */
  activateOnFirstTouch?: boolean;
  reducedMotionBehavior?: "skip" | "state-only";
  children: React.ReactNode;
}) {
  const setHovered = useStacks((s) => s.setHovered);
  const root = useRef<THREE.Group>(null);
  const trigger = useRef(onTrigger);
  trigger.current = onTrigger;
  useEffect(() => {
    if (!root.current) return;
    return registerSceneInteraction({
      id: hoverKey,
      root: root.current,
      activeUnits: [...(activeUnitIndexes ?? [unitIndex])],
      touchable,
      activateOnFirstTouch,
      activation: {
        kind: "egg",
        run: () => {
          if (!reducedMotion() || reducedMotionBehavior === "state-only")
            trigger.current();
        },
        reducedMotion: reducedMotionBehavior,
      },
      hover: { kind: "none" },
    });
  }, [
    activateOnFirstTouch,
    activeUnitIndexes,
    hoverKey,
    reducedMotionBehavior,
    touchable,
    unitIndex,
  ]);
  return (
    <group
      ref={root}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if ((e as unknown as { pointerType?: string }).pointerType === "touch")
          return;
        if ((e.delta ?? 0) > 6) return; // swipe, not a tap
        if (!runSceneInteractionActivation(hoverKey)) return;
        e.stopPropagation();
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
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

/** The switch behind every lamp in the room. Click the lamp and it goes out;
 * click again and it comes back. Nothing is persisted — a reload lights it.
 *
 * The switch owns ALL the dimming: a damped 0..1 factor drives a traverse over
 * the lamp subtree that scales every light's intensity, every emissive
 * material, and every transparent mesh material's opacity (base values
 * captured on first touch) — so the toggle survives whether a treatment lives
 * on the exact lamp surface or in the sibling rig. That is why this is a
 * wrapper rather than something baked into
 * EggLamp: the room has three lamps of three different constructions (a desk
 * lamp with LampGlow, a table lamp with a bare pointLight, a floor lamp with a
 * spot plus emissive discs plus a ground pool) and one dimmer covers all of
 * them without any of them knowing about it.
 *
 * Two rules the geometry forces:
 * - The rig is a SIBLING of the click target, never a child. An additive glow
 *   sprite is a metre-wide transparent quad; inside the trigger it becomes a
 *   giant invisible hit box that swallows the shelf behind it.
 * - Sprites are skipped by the traverse. They have their own per-frame opacity
 *   writer (GlowSprite), which would clobber anything written here, so they
 *   multiply the factor in themselves — pass the same `litRef` to both.
 *
 * At this camera some shade openings are nearly edge-on and a lit lamp whose
 * only evidence is a pool reads as switched off. The source-aligned aperture
 * halo supplies that visible proof without billboarding; diagnostics retain
 * the former sprites for comparison. Both follow the same factor.
 */
export function LampSwitch({
  unitIndex,
  activeUnitIndexes,
  hoverKey,
  litRef,
  rig,
  children,
}: {
  unitIndex: number;
  activeUnitIndexes?: readonly number[];
  hoverKey: string;
  /** Shared 0..1 lit factor. Pass one whenever the rig contains a GlowSprite,
   * ApertureHalo, or anything else that writes opacity per frame. */
  litRef?: { current: number };
  /** The light rig: lights, emissive shades, aperture treatments, pools. */
  rig?: React.ReactNode;
  /** The lamp body — the click target, and the only thing that is a hit box. */
  children: React.ReactNode;
}) {
  const target = useRef(1);
  const own = useRef(1);
  const lit = litRef ?? own;
  const dimmed = useRef<THREE.Group>(null);
  const dimmer = useRef(lit.current);
  const previousOutput = useRef(lit.current);
  const previousArrivalScale = useRef(1);
  const handledSceneImpulse = useRef(getSceneImpulse().revision);
  const shockAge = useRef<number | null>(null);
  const shockStrength = useRef(0);
  const shockWorld = useMemo(() => new THREE.Vector3(), []);
  useUnitFrame((_, delta) => {
    const g = dimmed.current;
    if (!g) return;
    let next = THREE.MathUtils.damp(dimmer.current, target.current, 9, delta);
    if (Math.abs(next - target.current) < 1e-3) next = target.current;
    dimmer.current = next;
    const sceneImpulse = getSceneImpulse();
    if (handledSceneImpulse.current !== sceneImpulse.revision) {
      handledSceneImpulse.current = sceneImpulse.revision;
      if (sceneImpulse.palette === "coordination") {
        g.getWorldPosition(shockWorld);
        const strength = sceneImpulseStrengthAt(sceneImpulse, shockWorld);
        if (strength > 0) {
          shockStrength.current = Math.max(
            shockStrength.current,
            Math.min(1, strength * 1.35),
          );
          // Start at the bottom of the voltage drop so the response is visible
          // on the same frame as the network burst, not one frame later.
          shockAge.current = 0.025;
        }
      }
    }
    let shockScale = 1;
    if (shockAge.current !== null) {
      shockScale = sceneImpulseLightScale(
        shockAge.current,
        shockStrength.current,
      );
      shockAge.current += Math.min(delta, 1 / 30);
      if (shockAge.current >= SCENE_IMPULSE_LIGHT_DURATION) {
        shockAge.current = null;
        shockStrength.current = 0;
      }
    }
    const output = next * shockScale;
    const arrivalScale =
      unitIndex === 0 ? 1 + arrivalBeatRef.aboutLampBloom * 0.45 : 1;
    if (
      Math.abs(output - previousOutput.current) < 0.001 &&
      Math.abs(arrivalScale - previousArrivalScale.current) < 0.001
    )
      return;
    // Leaving fully-lit re-captures every base: at factor 1 the current
    // values ARE the rig's own, including anything React rewrote while the
    // lamp sat ON (a theme flip changes palette-driven opacities).
    const refresh = previousOutput.current === 1 && output < 1;
    lit.current = output;
    g.traverse((o) => {
      if (o instanceof THREE.Light) {
        const data = o.userData as { eggBase?: number };
        if (refresh || data.eggBase === undefined) data.eggBase = o.intensity;
        o.intensity = data.eggBase * output * arrivalScale;
        return;
      }
      // ApertureHalo owns an imperative opacity writer like GlowSprite. It is
      // a Mesh only so it can retain the source plane instead of billboarding.
      if (
        o instanceof THREE.Sprite ||
        o.userData.stacksSelfDimmed === true ||
        !(o instanceof THREE.Mesh)
      )
        return;
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
        material.emissiveIntensity =
          data.eggBaseEmissive * output * arrivalScale;
      }
      if (material.transparent) {
        if (refresh || data.eggBaseOpacity === undefined)
          data.eggBaseOpacity = material.opacity;
        material.opacity =
          data.eggBaseOpacity * output * Math.min(1.35, arrivalScale);
      }
    });
    previousOutput.current = output;
    previousArrivalScale.current = arrivalScale;
  });
  return (
    <group ref={dimmed}>
      <EggTrigger
        unitIndex={unitIndex}
        activeUnitIndexes={activeUnitIndexes}
        hoverKey={hoverKey}
        onTrigger={() => {
          target.current = target.current ? 0 : 1;
        }}
        reducedMotionBehavior="state-only"
      >
        {children}
      </EggTrigger>
      {/* Sibling of the trigger, never a child — see the note above. */}
      <group>{rig}</group>
    </group>
  );
}

/** Desk lamp that clicks OFF and back ON — LampSwitch plus the desk-lamp
 * model and its LampGlow rig, which is the pairing two units want verbatim. */
export function EggLamp({
  unitIndex,
  palette,
  dark,
  yaw,
  scale = 1.55,
  aimOffset,
  spillScale,
  headQuaternion,
  captureLightEmphasis = false,
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
   * MOUTH [0, 0.2981, 0.0546], MOUTH_R, AXIS and every offset `along()`
   * derives from them — are measured in UNSCALED model space and the rig is a
   * SIBLING of the ModelProp, so scaling the model alone tears the light off
   * the shade. Scaling the shared parent moves both together and keeps the
   * mouth registered to the opening it was measured from.
   * At 1.55 the model lands 0.645 high, comfortably inside the expanded
   * 0.8075 lower-shelf headroom. Retaining that scale keeps the About, Blog
   * and Systems practicals in one silhouette family while the lighting rig
   * supplies the stronger presence the composition needs. */
  scale?: number;
  /** Optional local target correction for the spot cone. The model, mouth and
   * light source stay registered; only the surface the cone aims at moves. */
  aimOffset?: [number, number, number];
  spillScale?: number;
  /** Extra articulation around the measured arm/shade hinge. The same
   * quaternion carries the recovered model head and every emitted light. */
  headQuaternion?: QuaternionTuple;
  /** Offline social-card emphasis. Reuses the mounted practical rig; it does
   * not allocate another effect or change the visitor-facing lamp. */
  captureLightEmphasis?: boolean;
}) {
  const lit = useRef(1);
  const realLights = useUnitRealLights(unitIndex);
  const postfx = useStacks((state) => state.postfx);
  return (
    // ONE group carries the scale AND the yaw, and both the model and the
    // light rig hang from it. That is the whole structural fix of v6: the yaw
    // used to be handed separately to the ModelProp and to LampGlow, so the
    // shade's orientation was written down twice and could disagree, and the
    // rig's measured mouth was registered to a pose the model did not
    // necessarily hold. The only child-space transform is the optional,
    // measured head hinge below; it wraps the recovered shade and the entire
    // light rig with the same quaternion. Independent position, yaw, or scale
    // still has no place on either sibling.
    <group scale={scale} rotation={[0, yaw, 0]}>
      <LampSwitch
        unitIndex={unitIndex}
        hoverKey={`egg:lamp:${unitIndex}`}
        litRef={lit}
        rig={
          // A parent scale moves the lights but does NOT touch their
          // `distance` — that is a world-space property, not a transform — so
          // the reach has to be scaled by hand or a bigger lamp lights a
          // smaller pool.
          headQuaternion ? (
            <group position={DESK_LAMP_HEAD_PIVOT}>
              <group quaternion={headQuaternion}>
                <group
                  position={[
                    -DESK_LAMP_HEAD_PIVOT[0],
                    -DESK_LAMP_HEAD_PIVOT[1],
                    -DESK_LAMP_HEAD_PIVOT[2],
                  ]}
                >
                  <LampGlow
                    unitIndex={unitIndex}
                    palette={palette}
                    litRef={lit}
                    reach={scale}
                    aimOffset={aimOffset}
                    spillScale={spillScale}
                    meadowId={`desk-lamp-${unitIndex}`}
                    realLights={realLights}
                    captureLightEmphasis={captureLightEmphasis}
                  />
                </group>
              </group>
            </group>
          ) : (
            <LampGlow
              unitIndex={unitIndex}
              palette={palette}
              litRef={lit}
              reach={scale}
              aimOffset={aimOffset}
              spillScale={spillScale}
              meadowId={`desk-lamp-${unitIndex}`}
              realLights={realLights}
              captureLightEmphasis={captureLightEmphasis}
            />
          )
        }
      >
        <React.Suspense fallback={null}>
          <ModelProp
            url="/models/desk-lamp.glb"
            dark={dark}
            deskLampHeadQuaternion={headQuaternion}
            deskLampShadeGlowColor={postfx ? "#ffffff" : "#ffb26a"}
            deskLampShadeGlowOpacity={
              (dark ? 0.94 : 1) *
              (postfx ? 0.78 : 0.7) *
              (captureLightEmphasis ? 1.18 : 1)
            }
          />
        </React.Suspense>
      </LampSwitch>
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
/**
 * How much faster a spinning prop turns while you point at it.
 *
 * Nine times. The globe's authored drift is 0.11 rad/s — "slow enough that you
 * notice it the second time you look" — which is the problem: a multiple of
 * near-stillness is still near-stillness, and 4x (the first cut) drew "globe
 * spin faster pls". At 9x it is 0.99 rad/s, a lap every six and a half
 * seconds, which is a globe someone has just spun rather than one drifting.
 *
 * This is now genuinely near the click's gesture, and that is accepted: the
 * click's whole point was a lap you asked for, and a hover that nearly matches
 * it makes the click read as "again, harder" rather than as the only thing the
 * globe does. The damp in and out is what keeps it from being a jump cut.
 */
const HOVER_SPIN_GAIN = 8;
/** How fast a released hand's speed bleeds off, per second: a flick coasts
 * for about a second and settles rather than spinning on. */
const SPIN_FLING_DECAY = 3;

export function SpinProp({
  unitIndex,
  hoverKey,
  idleRate = 0,
  handle,
  fixedAngle,
  trigger = true,
  children,
}: {
  unitIndex: number;
  hoverKey: string;
  /** Radians per second of unprompted rotation. */
  idleRate?: number;
  /** A hand on the prop (spinHandle.ts): while held the prop follows it
   * 1:1, after release it coasts, and while calm it does not drift. */
  handle?: SpinHandle;
  /** Pin the spun node to this yaw and suppress every spin path. */
  fixedAngle?: number;
  /** Register the click-adds-a-lap egg. Off when the carrier owns the tap
   * for something else (the globe's tap brings it to the camera). */
  trigger?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const target = useRef(0);
  /** Damped 0..1 hover engagement, feeding HOVER_SPIN_GAIN. */
  const hoverSpin = useRef(0);
  const spinNode = useRef<THREE.Object3D | null>(null);
  const written = useRef<THREE.Object3D | null>(null);
  const still = useMemo(() => reducedMotion(), []);
  useUnitFrame((_, delta) => {
    const root = ref.current;
    if (!root) return;
    if (!isWorldRevealed()) return;
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
    // Hand the angle over cleanly when the node being written changes. Two
    // cases. The prop loads behind Suspense, so the first frames turn the
    // WRAPPER; without the reset the wrapper keeps that residual rotation
    // forever and the stand sits permanently askew while the ball turns
    // inside it. And a theme flip rebuilds the model, so a FRESH spin node
    // appears at angle zero while `target` has been accumulating drift for
    // as long as the page has been open: damping from zero to that target
    // whipped the globe through every lap it had ever drifted, in a second.
    // The new node inherits the old one's angle instead, so a rebuild is
    // invisible and the damp only ever closes the gap the drift opened.
    const previous = written.current;
    if (previous && previous !== g) {
      g.rotation.y = previous.rotation.y;
      previous.rotation.y = 0;
    }
    written.current = g;
    if (fixedAngle !== undefined) {
      target.current = fixedAngle;
      hoverSpin.current = 0;
      if (handle) {
        handle.state.pending = 0;
        handle.state.velocity = 0;
      }
      g.rotation.y = fixedAngle;
      return;
    }
    // SIGNATURE REACTION (ADR 0020): a globe answers by turning faster.
    //
    // A HELD RATE rather than a held pose. The glossary asks every archetype
    // to resolve to a state that still reads as selected with no timeout, and
    // for a prop whose whole character is that it revolves, the state that
    // reads is the rate. Parking it at some angle instead would stop the one
    // thing it does. Eased in and out so it does not snap to a new speed.
    // The hand, when there is one. Queued radians land on the target at
    // once; a release's speed bleeds off over about a second; while held or
    // calm the prop neither drifts nor answers hover, because the person is
    // turning it themselves or reading it.
    const hand = handle?.state;
    const held = hand?.held ?? false;
    const calm = hand?.calm ?? false;
    const step = Math.min(delta, 1 / 30);
    if (hand) {
      if (hand.pending !== 0) {
        target.current += hand.pending;
        hand.pending = 0;
      }
      if (!held && hand.velocity !== 0) {
        target.current += hand.velocity * step;
        hand.velocity = THREE.MathUtils.damp(
          hand.velocity,
          0,
          SPIN_FLING_DECAY,
          delta,
        );
        if (Math.abs(hand.velocity) < 1e-3) hand.velocity = 0;
      }
    }
    const wantsHover =
      !still &&
      !held &&
      !calm &&
      propReactionIsEngaged(useStacks.getState(), hoverKey);
    hoverSpin.current =
      Math.abs(hoverSpin.current - (wantsHover ? 1 : 0)) < 1e-3
        ? wantsHover
          ? 1
          : 0
        : THREE.MathUtils.damp(hoverSpin.current, wantsHover ? 1 : 0, 3, delta);
    // Advance the target rather than the rotation, so a click's extra lap
    // rides on top of the drift instead of fighting it — and don't advance
    // it at all off-screen, or coming back would spin up the difference in
    // one lurch.
    if (idleRate && !still && !held && !calm && nearActive(unitIndex)) {
      target.current +=
        idleRate * (1 + hoverSpin.current * HOVER_SPIN_GAIN) * step;
    } else if (g.rotation.y === target.current) return;
    if (held) {
      // A hand is exact: no damping between the finger and the ball.
      g.rotation.y = target.current;
      return;
    }
    const next = THREE.MathUtils.damp(g.rotation.y, target.current, 1.4, delta);
    g.rotation.y =
      Math.abs(next - target.current) < 1e-3 ? target.current : next;
  });
  const wrapped = <group ref={ref}>{children}</group>;
  if (!trigger) return wrapped;
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
      {wrapped}
    </EggTrigger>
  );
}

/**
 * A ball that spins on the spot and hops when you point at it (the basketball).
 *
 * SIGNATURE REACTION (ADR 0020), and the one the design grill was sharpest
 * about: the basketball is the ONLY prop in the scene with `shape="sphere"`,
 * and the shared nod had it tilting about a front-bottom support edge that a
 * sphere does not have. The gesture was not merely generic, it described the
 * wrong solid.
 *
 * THE FIRST CUT ROTATED IT INTO THE SHELF. It turned about a canted HORIZONTAL
 * axis, and the axis ran through the group's origin — which for a Grabbable is
 * the prop's contact point on the plank, not the middle of the ball. So the
 * ball did not roll in place, it swung on a 0.33-unit arm and buried itself in
 * the wood below. Owner, 2026-08-20: "it just slowly rotates into the bottom
 * shelf haha", and "should do a 360 spin from the center".
 *
 * Both halves of that are fixed here and they are separate fixes:
 *
 *  - FROM THE CENTER. The subtree's box is measured once and the pivot is its
 *    middle, pinned by the same shift `hingeShift` uses. A vertical axis alone
 *    would very nearly do it — the model sits directly over the origin — but
 *    "very nearly" is how the first version was wrong, and measuring costs one
 *    mesh walk on first hover.
 *  - A 360, not a drift. Spinning about the vertical means every revolution
 *    returns the ball exactly where it started, so continuous spin IS repeated
 *    360s: legible while hovered and holding no strange pose when it stops.
 *    It also cannot sweep the ball through anything, which a tumble can.
 *
 * The hop rides the scene's own spring at flutter damping, so it overshoots
 * once and settles — a ball that eased up would read as a lift rather than a
 * bounce. Its height is capped by `clearanceAbove`, the same measurement that
 * keeps a stacked book out of its neighbour: whatever is over this ball, the
 * hop stays under it.
 *
 * Deliberately NOT wrapped around the physics carrier. This writes a child
 * node, so a ball in flight — where the solver owns the transform — is
 * untouched, and the spin resumes when it comes to rest.
 */
/** Radians per second at full engagement: a revolution every 1.3 seconds. */
const SPIN_RATE = 4.8;
/** Spin-down when the pointer merely leaves: ~95% gone in 0.75 s, a coast. */
const SPIN_COAST_LAMBDA = 4;
/** Spin-down when a hand closes on it: ~95% gone in 0.17 s. */
const SPIN_STOP_LAMBDA = 18;
/** How far a carrier's quaternion may stray from identity and still count as
 * sitting on its shelf. The solver writes the carrier for a carry, a throw and
 * a tumble; the authored rest pose keeps rotation on the model below it. */
const HANDLED_ROTATION_EPSILON = 0.02;
/** Hop height as a share of the ball's own radius, before the headroom cap. */
const HOP_RADIUS_SHARE = 0.26;

export function RollProp({
  hoverKey,
  children,
}: {
  hoverKey: string;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const angle = useRef(0);
  const level = useRef(0);
  const hop = useMemo(() => createSwaySpring(), []);
  /** Measured once: [pivotX, pivotZ, hopHeight]. Null until the GLB is in. */
  const measured = useRef<[number, number, number] | null>(null);
  const still = useMemo(() => reducedMotion(), []);
  const pivot = useMemo(() => new THREE.Vector3(), []);
  const shifted = useMemo(() => new THREE.Vector3(), []);
  useUnitFrame((_, delta) => {
    const g = ref.current;
    if (!g || still) return;
    // HANDS OFF THE MOMENT IT IS PICKED UP. Owner, 2026-08-20: "the basketball
    // should stop spinning pretty quickly once actually grabbed cuz it messes
    // with the physics."
    //
    // The mechanism, and it is not merely cosmetic: this writes a CHILD of the
    // Grabbable's carrier while the solver writes the carrier itself, and the
    // collider is built by walking that subtree. A ball whose child node is
    // turning while it is being carried is a ball whose hull is being remeasured
    // mid-flight. The hop is worse — it is a vertical offset, so a spinning,
    // hopping ball sits proud of the hand that is holding it.
    //
    // Two tests, because a grab is not the only way this prop leaves the shelf.
    // `dragging` catches the carry. A carrier quaternion away from identity
    // catches everything the solver owns after that: the throw, the tumble and
    // wherever it comes to rest. That last one is a deliberate trade — a ball
    // that has been thrown across the room and settled askew will not spin
    // under the pointer again until it is parked. It is a physics object now,
    // and this is the safe half of the trade rather than the pretty one.
    const state = useStacks.getState();
    const carrier = getSceneInteraction(hoverKey)?.root;
    const handled =
      state.dragging === hoverKey ||
      (carrier !== undefined &&
        carrier.quaternion.x ** 2 +
          carrier.quaternion.y ** 2 +
          carrier.quaternion.z ** 2 >
          HANDLED_ROTATION_EPSILON ** 2);
    const wants = propReactionIsEngaged(state, hoverKey) && !handled;
    if (wants && !measured.current) {
      const box = meshBoxInLocal(g);
      if (box) {
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        const room = clearanceAbove(g, box);
        measured.current = [
          centre.x,
          centre.z,
          Math.min(
            (size.y / 2) * HOP_RADIUS_SHARE,
            Number.isFinite(room) ? Math.max(0, room - 0.01) : Infinity,
          ),
        ];
      }
    }
    const target = wants ? 1 : 0;
    // A pointer leaving is a ball coasting to a stop; a hand closing on it is
    // a ball being stopped. Spinning down over three quarters of a second is
    // right for the first and far too slow for the second, so the rate the
    // spin decays at depends on WHY it is decaying. The spin angle itself is
    // never unwound either way — only the rate goes to zero, which is what a
    // caught ball actually does.
    const lambda = handled ? SPIN_STOP_LAMBDA : SPIN_COAST_LAMBDA;
    if (Math.abs(level.current - target) < 1e-3) level.current = target;
    else
      level.current = THREE.MathUtils.damp(
        level.current,
        target,
        lambda,
        delta,
      );
    // The hop drops without its bounce when the ball is in hand: overshooting
    // back down through the palm is exactly the fight this is here to end.
    const settled = stepSway(hop, target, delta, 340, handled ? 48 : 17);
    // Nothing to do and nothing in flight: leave the ball exactly where it
    // last came to rest. Unlike every other reaction in the scene this one
    // does NOT rewind to its authored pose — a ball that snapped back to the
    // same angle each time you looked away would be the one obviously fake
    // thing on the shelf, and a sphere gives no clue that it moved.
    if (level.current === 0 && settled) return;
    const step = Math.min(delta, 1 / 30);
    angle.current =
      (angle.current + SPIN_RATE * level.current * step) % (Math.PI * 2);
    g.rotation.y = angle.current;
    const centre = measured.current;
    if (!centre) return;
    // Pin the ball's middle: rotate as usual, then undo the translation the
    // rotation applied to that point. Same identity as `hingeShift`, with the
    // middle of the solid instead of a contact edge.
    pivot.set(centre[0], 0, centre[1]);
    shifted.copy(pivot).applyEuler(g.rotation);
    g.position.set(
      pivot.x - shifted.x,
      hop.angle * centre[2],
      pivot.z - shifted.z,
    );
  });
  return <group ref={ref}>{children}</group>;
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
  useUnitFrame((_, delta) => {
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
function SecondHand({
  radius,
  color = "#9c3a2c",
}: {
  radius: number;
  color?: string;
}) {
  const ref = useRef<THREE.Group>(null);
  const still = useMemo(() => reducedMotion(), []);
  useUnitFrame((_, delta) => {
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
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[0, -radius * 0.12, 0]}>
        <boxGeometry args={[radius * 0.06, radius * 0.24, 0.0012]} />
        <meshStandardMaterial color={color} roughness={0.5} />
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
  useUnitFrame(({ clock }) => {
    const g = ref.current;
    if (!g || still || !nearActive(unitIndex)) return;
    if (!isWorldRevealed()) {
      g.rotation.x = 0;
      g.rotation.z = 0;
      return;
    }
    const t = clock.elapsedTime * rate + phase;
    // Two incommensurate rates on each axis, so the path is a slow wander
    // rather than a metronome. The x term is the smaller of the two — a
    // plant nodding toward the viewer reads as a bug.
    g.rotation.z = amount * (0.72 * Math.sin(t) + 0.28 * Math.sin(t * 1.71));
    g.rotation.x = amount * 0.45 * Math.sin(t * 0.83 + 1.1);
  });
  return <group ref={ref}>{children}</group>;
}

// --- Pendulum ----------------------------------------------------------

/** Name of the node `Pendulum` isolates out of a single-mesh clock. Named
 * because pixels cannot say WHICH object moved — the camera carries a
 * permanent idle bob, so every region of the frame reports motion. The
 * harness reads `window.__stacks.node("stacks-pendulum")` instead, the same
 * reason SPIN_NODE has a name. */
export const PENDULUM_NODE = "stacks-pendulum";

/**
 * The hanging assembly inside a single-mesh clock: the long thin vertical
 * island (the rod) plus whatever hangs on its lower end (the bob).
 *
 * Identified by SHAPE, never by island index — traversal order is an exporter
 * artifact and the next re-export through scripts/stacks-models.mjs could
 * reorder it silently (see islands.ts). On grandfather-clock.glb the rod's
 * height/thickness aspect reads 50.9 against 10.6 for the next nearest
 * island, and the case is excluded up front as the one island holding most of
 * the triangles (354 of 547), so the discriminator has a wide margin.
 *
 * The pivot is the TOP of the rod on the rod's own vertical line, which is
 * where the suspension spring would be.
 */
function findPendulumParts(
  islands: Island[],
): { parts: Island[]; pivot: THREE.Vector3 } | null {
  if (islands.length < 3) return null;
  // The case is the body — much the largest island, and never a candidate.
  const body = islands.reduce((a, b) =>
    b.triangles.length > a.triangles.length ? b : a,
  );
  let rod: Island | null = null;
  let aspect = 0;
  for (const isle of islands) {
    if (isle === body) continue;
    const thick = Math.max(isle.extent.x, isle.extent.z);
    if (thick <= 0) continue;
    const a = isle.extent.y / thick;
    if (a > aspect) {
      aspect = a;
      rod = isle;
    }
  }
  // Nothing in this prop is rod-shaped. Better to swing the whole thing (or
  // nothing) than to swing a random finial.
  if (!rod || aspect < 8) return null;
  const reach = Math.max(rod.extent.y * 0.35, 0.05);
  const parts: Island[] = [rod];
  for (const isle of islands) {
    if (isle === rod || isle === body) continue;
    // On the rod's line, and hanging at its lower end rather than sitting
    // beside it further up.
    if (Math.abs(isle.center.x - rod.center.x) > reach) continue;
    if (Math.abs(isle.center.z - rod.center.z) > reach) continue;
    if (isle.center.y > rod.min.y + rod.extent.y * 0.1) continue;
    if (isle.max.y < rod.min.y - reach) continue;
    parts.push(isle);
  }
  return {
    parts,
    pivot: new THREE.Vector3(rod.center.x, rod.max.y, rod.center.z),
  };
}

/**
 * Cut the pendulum out of a loaded prop and re-hang it under its own pivot.
 *
 * Layout produced (the twin of ModelProp's splitSpinPart):
 *   mesh              everything except the pendulum, untouched
 *     └ PENDULUM_NODE at the pivot; an animator writes rotation here
 *         └ mesh      rod + bob, baked into that frame
 *
 * Only the CLONE is touched: `mesh.geometry = restGeometry` replaces this
 * instance's reference and never the useGLTF cache's geometry. Both new
 * geometries carry extractTriangles' `owned` flag, so ModelProp's disposal
 * effect frees them when the prop rebuilds (a theme flip clones a fresh
 * scene, which is also why the caller re-resolves the node every frame).
 */
function splitPendulum(root: THREE.Object3D): THREE.Object3D | null {
  let mesh: THREE.Mesh | null = null;
  let best = -1;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const geo = o.geometry as THREE.BufferGeometry;
    const n = geo.index?.count ?? geo.attributes.position?.count ?? 0;
    if (n > best) {
      best = n;
      mesh = o;
    }
  });
  // `traverse` hides the assignment from the narrower, so say it plainly.
  const target = mesh as THREE.Mesh | null;
  if (!target) return null;
  const geometry = target.geometry;
  const found = findPendulumParts(findIslands(geometry));
  if (!found) {
    console.error(
      "[stacks] Pendulum: no rod-shaped island found; prop left whole. " +
        "Run `node scripts/stacks-render.mjs <name> --islands` to see them.",
    );
    return null;
  }
  const swingTriangles = found.parts
    .flatMap((p) => p.triangles)
    .sort((a, b) => a - b);
  const swinging = new Set(swingTriangles);
  const total =
    (geometry.index
      ? geometry.index.count
      : (geometry.attributes.position?.count ?? 0)) / 3;
  const restTriangles: number[] = [];
  for (let t = 0; t < total; t++) if (!swinging.has(t)) restTriangles.push(t);

  const swingMesh = new THREE.Mesh(
    extractTriangles(geometry, swingTriangles, found.pivot),
    target.material,
  );
  swingMesh.castShadow = target.castShadow;
  swingMesh.receiveShadow = target.receiveShadow;
  const swing = new THREE.Group();
  swing.name = PENDULUM_NODE;
  swing.position.copy(found.pivot);
  swing.add(swingMesh);

  target.geometry = extractTriangles(geometry, restTriangles);
  // Child of the MESH, so the pivot stays in the frame the islands were
  // measured in (the mesh may carry a transform from the GLB's node graph).
  target.add(swing);
  if (process.env.NODE_ENV === "development") {
    console.info(
      `[stacks] Pendulum: ${swingTriangles.length}/${total} tris swinging, ` +
        `pivot y ${found.pivot.y.toFixed(4)}`,
    );
  }
  return swing;
}

/**
 * The bottom half of a longcase clock, doing the one thing it is for.
 *
 * Swings its children through a pivot at local `pivotY`. If the subtree turns
 * out to be a single-mesh GLB with a pendulum inside it — which is exactly
 * what grandfather-clock.glb is — the rod and bob are cut out of that mesh and
 * only THEY swing, inside a case that stays still. That is the difference
 * between a clock and a clock-shaped object waving at you.
 *
 * Two deliberate choices worth defending:
 *
 * - It swings about Z, not X. A pendulum turning about X moves toward and away
 *   from the camera, and the camera sits about 2 degrees above the shelf line,
 *   so that motion is foreshortened to nearly nothing. About Z it travels
 *   across the screen, which is the whole point of animating it. `axis="x"` is
 *   there for a prop hung side-on.
 * - The default period is a full 2 s — one beat per second, matching the
 *   second hand EggClock puts on the same dial. A real seconds pendulum is
 *   0.994 m and this one measures about 0.7 m, so the arithmetic wants ~1.7 s;
 *   the clock reading as ONE mechanism is worth more than the two decimal
 *   places, and nobody times a pendulum against a stopwatch.
 *
 * The arc is small on purpose. A seconds pendulum swings a few degrees, not a
 * metronome's forty-five, and the default 0.05 rad is 2.9 degrees each way.
 */
export function Pendulum({
  children,
  pivotY = 0,
  amplitude = 0.05,
  period = 2,
  axis = "z",
  unitIndex,
}: {
  children: React.ReactNode;
  /** Pivot height in the wrapper's own space. Ignored when a pendulum is
   * isolated out of a GLB — the measured suspension point wins over a
   * hand-typed one. */
  pivotY?: number;
  /** Peak lean in radians. */
  amplitude?: number;
  /** Seconds per full back-and-forth. */
  period?: number;
  axis?: "x" | "z";
  /** Idle only next to the unit you are looking at. Omit and it always runs
   * (one sine and one write per frame, which is nothing). */
  unitIndex?: number;
}) {
  const root = useRef<THREE.Group>(null);
  const whole = useRef<THREE.Group>(null);
  const node = useRef<THREE.Object3D | null>(null);
  /** The mesh the split was last attempted against — a failed split must not
   * re-run the union-find every frame, and a rebuilt prop must re-run it. */
  const attempted = useRef<THREE.Object3D | null>(null);
  const still = useMemo(() => reducedMotion(), []);
  useUnitFrame(({ clock }) => {
    const g = root.current;
    if (!g || still) return;
    if (unitIndex !== undefined && !nearActive(unitIndex)) return;
    let swing = node.current;
    if (swing && !isDescendantOf(swing, g)) swing = null;
    if (!swing) {
      swing = g.getObjectByName(PENDULUM_NODE) ?? null;
      if (!swing) {
        let first: THREE.Object3D | null = null;
        g.traverse((o) => {
          if (!first && o instanceof THREE.Mesh) first = o;
        });
        const mesh = first as THREE.Object3D | null;
        // Nothing loaded yet (the prop mounts behind Suspense) — try again
        // next frame. Something loaded and we have not tried it — try once.
        if (!mesh) return;
        if (mesh && attempted.current !== mesh) {
          attempted.current = mesh;
          swing = splitPendulum(g);
        }
      }
      node.current = swing;
    }
    // Before the GLB existed there was no pendulum to animate. Older code
    // rotated this fallback group anyway, then left that rotation behind once
    // the real pendulum was isolated, permanently separating the case from
    // its canvas face.
    if (swing && whole.current) {
      whole.current.rotation.x = 0;
      whole.current.rotation.z = 0;
    }
    // No isolated part: swing the whole subtree about `pivotY` instead, which
    // is what a caller wrapping their own rod and bob in JSX wants.
    const write = swing ?? whole.current;
    if (!write) return;
    const a = amplitude * Math.sin((clock.elapsedTime * Math.PI * 2) / period);
    if (axis === "x") write.rotation.x = a;
    else write.rotation.z = a;
  });
  return (
    <group ref={root}>
      {/* Rotate-about-a-height, spelled out: hinge up to the pivot, hang the
          children back down from it. Left at identity whenever a part was
          isolated, so the case never moves. */}
      <group ref={whole} position={[0, pivotY, 0]}>
        <group position={[0, -pivotY, 0]}>{children}</group>
      </group>
    </group>
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
  faceStyle = "alarm",
  children,
}: {
  unitIndex: number;
  hoverKey: string;
  facePosition: [number, number, number];
  faceRadius: number;
  faceStyle?: ClockFaceStyle;
  children: React.ReactNode;
}) {
  const sweep = useRef<ClockSweep | null>(null);
  const shiver = useRef<THREE.Group>(null);
  const shiverLevel = useRef(0);
  const still = useMemo(() => reducedMotion(), []);
  // SIGNATURE REACTION (ADR 0020): an alarm clock answers by looking like it
  // is about to go off.
  //
  // Gated on `faceStyle` rather than on a new flag, because the question is
  // "is this an alarm clock" and the component is already asked that. A
  // grandfather clock shivering would be absurd — it is furniture, and it
  // already has a pendulum and a case shove of its own.
  //
  // A held tremble rather than a burst. Touch Focus has no timeout, so a
  // one-shot rattle would leave a selected clock looking unselected; and a
  // clock trembling continuously would be idle motion, which the scene
  // reserves for things that are genuinely always moving. Held only while
  // pointed at is the third thing, and it is the one that reads.
  const shivers = faceStyle === "alarm" && !still;
  useUnitFrame((state, delta) => {
    const node = shiver.current;
    if (!node || !shivers) return;
    const target = propReactionIsEngaged(useStacks.getState(), hoverKey)
      ? 1
      : 0;
    if (Math.abs(shiverLevel.current - target) < 1e-3) {
      if (shiverLevel.current === target && target === 0) {
        // Settled at rest: land exactly on zero and stop writing. A prop
        // nobody is pointing at must be EXACTLY where it was authored, or
        // the physics collider and the contact shade drift off it.
        if (
          node.rotation.z !== 0 ||
          node.position.x !== 0 ||
          node.position.y !== 0
        ) {
          node.rotation.z = 0;
          node.position.set(0, 0, 0);
        }
        return;
      }
      shiverLevel.current = target;
    } else {
      shiverLevel.current = THREE.MathUtils.damp(
        shiverLevel.current,
        target,
        14,
        delta,
      );
    }
    // Three channels at frequencies that do not divide into each other, so it
    // reads as a rattle rather than a wobble. The first cut used two at 0.011
    // rad and 1.1 mm and drew "more buzz for alarm": two channels beat against
    // each other into something closer to a slow swing, and the amplitude was
    // chosen to be safe rather than to be seen.
    //
    // 0.026 rad is 1.5 degrees of roll and 2.6 mm of travel at the shelves'
    // 2 units/m — roughly a millimetre in the room, which is what a bell
    // housing on a hard surface actually does. The vertical channel is the
    // one that sells it: a clock that only shakes sideways reads as sliding.
    const t = state.clock.elapsedTime;
    const v = shiverLevel.current;
    node.rotation.z = Math.sin(t * 53) * 0.026 * v;
    node.position.x = Math.sin(t * 71 + 1.3) * 0.0026 * v;
    node.position.y = Math.abs(Math.sin(t * 37 + 0.6)) * 0.0018 * v;
  });
  return (
    <EggTrigger
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      onTrigger={() => {
        if (faceStyle === "alarm")
          useStacks.getState().armVisionRideModifier("night");
        if (reducedMotion() || sweep.current) return;
        sweep.current = { start: performance.now() };
      }}
    >
      {/* The face rides INSIDE the shiver, not beside it. A case that
          trembles while its dial hangs still is a broken prop, and the dial
          is the part of a clock anyone is actually looking at. */}
      <group ref={shiver}>
        {children}
        <group position={facePosition}>
          {faceStyle === "grandfather" ? (
            <mesh
              position={[0, faceRadius * 0.12, -0.002]}
              scale={[1, 1.55, 1]}
            >
              <circleGeometry args={[faceRadius * 1.18, 32]} />
              <meshStandardMaterial color="#f4e5bf" roughness={0.82} />
            </mesh>
          ) : null}
          <ClockFace
            radius={faceRadius}
            sweepRef={sweep}
            faceStyle={faceStyle}
          />
          <SecondHand
            radius={faceRadius}
            color={faceStyle === "grandfather" ? "#8e6d2d" : undefined}
          />
        </group>
      </group>
    </EggTrigger>
  );
}

// --- Tea steam ---------------------------------------------------------

const WISPS = [
  { delay: 0, life: 2.08, x: -0.006, z: 0.002, phase: 0.2, size: 0.042 },
  { delay: 0.2, life: 2.34, x: 0.009, z: -0.004, phase: 2.1, size: 0.038 },
  { delay: 0.43, life: 1.96, x: -0.011, z: 0.005, phase: 4.4, size: 0.04 },
  { delay: 0.67, life: 2.42, x: 0.004, z: 0.001, phase: 1.25, size: 0.043 },
  { delay: 0.9, life: 2.16, x: 0.012, z: 0.004, phase: 5.35, size: 0.036 },
  { delay: 1.16, life: 2.29, x: -0.003, z: -0.005, phase: 3.15, size: 0.041 },
  { delay: 1.39, life: 2.01, x: -0.01, z: -0.002, phase: 6.05, size: 0.037 },
  { delay: 1.65, life: 2.38, x: 0.007, z: 0.004, phase: 0.85, size: 0.042 },
  { delay: 1.88, life: 2.12, x: 0.001, z: -0.003, phase: 3.9, size: 0.039 },
];
const STEAM_TOTAL = Math.max(...WISPS.map((wisp) => wisp.delay + wisp.life));

type SteamParticleState = {
  birth: THREE.Vector3;
  cycle: number;
  burst: number;
  inheritedVelocity: THREE.Vector3;
  rotation: number;
  sample: SteamSample;
};

let steamTexture: THREE.CanvasTexture | null = null;
function getSteamTexture(): THREE.CanvasTexture {
  if (steamTexture) return steamTexture;
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const puff = (x: number, y: number, radius: number, alpha: number) => {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, `rgba(255, 252, 246, ${alpha})`);
    grad.addColorStop(0.46, `rgba(255, 250, 241, ${alpha * 0.46})`);
    grad.addColorStop(1, "rgba(255, 246, 232, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };
  // A narrow, asymmetric condensation filament: denser in the middle with
  // feathered gaps at either edge, instead of a stack of smoke-like circles.
  puff(48, 77, 17, 0.38);
  puff(43, 64, 20, 0.52);
  puff(52, 49, 21, 0.5);
  puff(42, 34, 18, 0.36);
  puff(51, 21, 14, 0.2);
  ctx.globalCompositeOperation = "destination-out";
  puff(29, 48, 13, 0.34);
  puff(68, 63, 12, 0.28);
  ctx.globalCompositeOperation = "source-over";
  steamTexture = new THREE.CanvasTexture(canvas);
  return steamTexture;
}

/** Cup of tea with a buoyant, wind-advected world-space vapor plume.
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
  const burst = useRef(0);
  /** Damped 0..1 hover engagement. A plateau, not a decay — see the frame. */
  const hoverSteam = useRef(0);
  const emitter = useRef<THREE.Group>(null);
  const sprites = useRef<(THREE.Sprite | null)[]>([]);
  const particles = useRef<SteamParticleState[]>(
    WISPS.map(() => ({
      birth: new THREE.Vector3(),
      cycle: Number.NaN,
      burst: -1,
      inheritedVelocity: new THREE.Vector3(),
      rotation: 0,
      sample: {
        x: 0,
        y: 0,
        z: 0,
        width: 0,
        height: 0,
        opacity: 0,
        flowX: 0,
        flowY: 0,
        flowZ: 0,
      },
    })),
  );
  const emitterWorld = useMemo(() => new THREE.Vector3(), []);
  const previousEmitterWorld = useMemo(() => new THREE.Vector3(), []);
  const emitterVelocity = useMemo(() => new THREE.Vector3(), []);
  const particleWorld = useMemo(() => new THREE.Vector3(), []);
  const emitterReady = useRef(false);
  const texture = useMemo(getSteamTexture, []);
  const still = useMemo(() => reducedMotion(), []);
  useUnitFrame((state, delta) => {
    const root = emitter.current;
    if (!root) return;
    const active = nearActive(unitIndex);
    if (!active || still) {
      for (const sprite of sprites.current) if (sprite) sprite.visible = false;
      emitterReady.current = false;
      return;
    }
    root.updateWorldMatrix(true, false);
    root.getWorldPosition(emitterWorld);
    if (emitterReady.current && delta > 0) {
      emitterVelocity
        .copy(emitterWorld)
        .sub(previousEmitterWorld)
        .divideScalar(Math.min(0.05, delta));
      if (emitterVelocity.lengthSq() > 0.36 ** 2)
        emitterVelocity.setLength(0.36);
    } else {
      emitterVelocity.set(0, 0, 0);
      emitterReady.current = true;
    }
    previousEmitterWorld.copy(emitterWorld);
    const sceneTime = state.clock.elapsedTime;
    const disturbance = getMeadowDisturbance();
    const wind = sampleMeadowWind(
      emitterWorld.x,
      emitterWorld.z,
      sceneTime,
      disturbance.windAmplitude || undefined,
    );
    const fade = dark && useStacks.getState().postfx ? 0.5 : 1;
    const nowMs = performance.now();
    const boost =
      always && started.current
        ? Math.max(0, 1 - (nowMs - started.current) / 1600)
        : 0;
    // SIGNATURE REACTION (ADR 0020): a hot drink answers a pointer with more
    // steam. Held rather than one-shot — Touch Focus has no timeout, so a cup
    // that puffed once and settled would look unselected while still selected.
    // It is a separate term from `boost` on purpose: that one is the click's
    // decaying puff and this one is a plateau, and adding them lets a click
    // land on top of a hover the way it does on the shelf.
    //
    // The Grabbable wrapping this cup carries `signature="steam"`, which
    // stands the shared nod down. Both halves share one hoverKey, so without
    // that the cup nodded and steamed off the same pointer.
    const wantsHover = propReactionIsEngaged(useStacks.getState(), hoverKey)
      ? 1
      : 0;
    hoverSteam.current =
      Math.abs(hoverSteam.current - wantsHover) < 1e-3
        ? wantsHover
        : THREE.MathUtils.damp(hoverSteam.current, wantsHover, 4, delta);
    const hover = hoverSteam.current;
    // +55% / +20% was the first cut and the owner could not see it at all.
    // The reason is structural rather than a bad number: this cup steams
    // `always`, so the hover is a DELTA on something already in motion, and a
    // half-again denser plume is invisible next to one that is already
    // rolling. The click's `boost` gets away with 0.7 because it also arrives
    // instantly, and an onset is legible where a level is not.
    //
    // MOST OF THE INCREASE GOES INTO SIZE RATHER THAN OPACITY, which is the
    // opposite of the obvious move and is deliberate. These wisps blend
    // ADDITIVELY in the dark theme and there are nine of them overlapping, so
    // opacity is radiance that compounds — the same trap that had just turned
    // the trophy into a white cut-out one file over. A bigger plume reads as
    // more steam; a brighter one reads as a lamp, and then clips.
    const peak = (dark ? 0.2 : 0.255) * (1 + boost * 0.7 + hover * 0.6) * fade;
    const sizeMul = (dark ? 1 : 1.32) * (1 + boost * 0.16 + hover * 0.55);

    const renderParticle = (
      index: number,
      progress: number,
      age: number,
      cycle: number,
      burstId: number,
    ) => {
      const sprite = sprites.current[index];
      const particle = particles.current[index]!;
      const wisp = WISPS[index]!;
      if (!sprite || progress <= 0 || progress >= 1) {
        if (sprite) sprite.visible = false;
        return;
      }
      if (particle.cycle !== cycle || particle.burst !== burstId) {
        particleWorld.set(wisp.x, 0, wisp.z);
        root.localToWorld(particleWorld);
        particle.birth.copy(particleWorld);
        particle.inheritedVelocity.copy(emitterVelocity).multiplyScalar(0.38);
        particle.cycle = cycle;
        particle.burst = burstId;
      }
      const sample = writeSteamSample(particle.sample, {
        originX: particle.birth.x,
        originY: particle.birth.y,
        originZ: particle.birth.z,
        progress,
        age,
        time: sceneTime,
        phase: wisp.phase,
        windX: wind.x,
        windZ: wind.z,
        inheritedX: particle.inheritedVelocity.x,
        inheritedY: particle.inheritedVelocity.y,
        inheritedZ: particle.inheritedVelocity.z,
        size: wisp.size * sizeMul,
      });
      particleWorld.set(sample.x, sample.y, sample.z);
      // The birth point stays in world space. Converting only at render time
      // makes already-emitted vapor lag behind a cup moved by Grabbable's
      // authored or cannon-es physics instead of remaining glued above it.
      root.worldToLocal(particleWorld);
      sprite.visible = true;
      sprite.position.copy(particleWorld);
      sprite.scale.set(sample.width, sample.height, 1);
      sprite.material.opacity = peak * sample.opacity;
      const cameraMatrix = state.camera.matrixWorld.elements;
      const screenFlowX =
        sample.flowX * cameraMatrix[0] +
        sample.flowY * cameraMatrix[1] +
        sample.flowZ * cameraMatrix[2];
      const screenFlowY =
        sample.flowX * cameraMatrix[4] +
        sample.flowY * cameraMatrix[5] +
        sample.flowZ * cameraMatrix[6];
      const targetRotation = THREE.MathUtils.clamp(
        -Math.atan2(screenFlowX, Math.max(0.02, screenFlowY)),
        -0.72,
        0.72,
      );
      particle.rotation = THREE.MathUtils.damp(
        particle.rotation,
        targetRotation,
        5,
        delta,
      );
      sprite.material.rotation = particle.rotation;
    };

    // Ambient mode runs off the shared scene clock with each wisp on its own phase,
    // so the particles stagger forever instead of marching in step.
    if (always) {
      for (let i = 0; i < WISPS.length; i++) {
        const w = WISPS[i]!;
        const particleTime = sceneTime - w.delay;
        const cycle = Math.floor(particleTime / w.life);
        const age = particleTime - cycle * w.life;
        renderParticle(i, age / w.life, age, cycle, 0);
      }
      return;
    }
    if (!started.current) return;
    const t = (nowMs - started.current) / 1000;
    for (let i = 0; i < WISPS.length; i++) {
      const w = WISPS[i]!;
      const age = t - w.delay;
      renderParticle(i, age / w.life, age, 0, burst.current);
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
          burst.current += 1;
        }}
      >
        {children}
      </EggTrigger>
      <group ref={emitter} position={steamAt}>
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
  /** Ground-level base (unit-local); the ball center sits 0.022 above it. */
  position: [number, number, number];
}) {
  const ref = useRef<THREE.Group>(null);
  const out = useRef(false);
  useUnitFrame((_, delta) => {
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
          {/* Radius 0.022, not the 0.045 this shipped at. It stands on the
              FLOOR, where the room is modelled at ~0.96 world units per metre
              rather than the shelves' 2.00, so the old 0.09 diameter read as
              0.094 m — a baseball lying next to a driver. 0.044 lands 0.046 m
              against a real 0.0427, and the ball-to-club ratio comes out near
              the 26.9 of the real pair instead of 12.8. */}
          <mesh position={[0, 0.022, 0]}>
            <sphereGeometry args={[0.022, 16, 16]} />
            <meshStandardMaterial color={palette.pages} roughness={0.55} />
          </mesh>
          {/* Generous invisible hit proxy — the ball itself is now a 4cm
              target, so the proxy matters more than it did, not less.
              Zero-opacity mesh, the same trick as the unit tap plane. */}
          <mesh position={[0, 0.05, 0]}>
            <sphereGeometry args={[0.11, 8, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <FootPool color={palette.shadow} size={[0.08, 0.07]} />
        </group>
      </EggTrigger>
    </group>
  );
}
