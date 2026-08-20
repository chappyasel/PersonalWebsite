"use client";

// Damped hover lift — wraps a hover target and eases the wrapper group
// toward base or base+offset depending on whether `hoverKey` owns the
// store's hovered slot. The store is read imperatively inside useFrame, so
// hovering re-renders nothing (the old ternaries re-rendered the whole row
// and its Suspense subtrees); the damp snaps and idles once settled.
//
// The photographs want two channels the props never did: they are placed at
// a random tilt, and letting the hover ease a few degrees of it away — with
// a hair of scale — reads as the print turning toward you. Both are opt-in,
// so a caller that passes neither still pays for the position damp alone.
//
// Everything else in the world now tilts too, and gets it WITHOUT asking: a
// prop whose call site authored no rotation response of its own nods toward
// the viewer about the bottom edge that keeps it above its support. See TIP
// and hingeFor(). Rising
// and tipping are one gesture rather than two settings each call site has to
// remember, which is the whole point — the complaint this answers is that the
// response was arbitrary from prop to prop.
import { useStacks } from "../store";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { cameraFacingHoverTilt } from "./hoverTilt";
import {
  type Hinge,
  InteractionClaim,
  TILT_MAX_SIZE,
  hingeFor,
  hingePivotForTilt,
} from "./interaction";
import { scenePerformanceController } from "./scenePerformance";
import { useUnitFrame } from "./unitActivity";

/** ~95% of the travel in 300ms. Exported because ModelProp's universal hover
 * floor eases on the same curve — every hover in the world settles alike. */
export const LIFT_LAMBDA = 10;
const LAMBDA = LIFT_LAMBDA;

/** One scene-wide legibility control for hover distance. This intentionally
 * scales displacement, rotation and swell DELTA without changing the damping
 * curve: props move twice as far, not twice as abruptly. */
export const HOVER_MOTION_SCALE = 2;

/** Radians of automatic nod, for a prop whose call site authored no rotation
 * response of its own. The original 0.06-radian gesture was difficult to see
 * at shelf distance; the shared scale makes it ~6.9° while the hinge keeps the
 * correct bottom contact edge planted. Exported so Grabbable and ModelProp nod
 * by exactly the same amount. */
export const TIP = 0.06 * HOVER_MOTION_SCALE;

/** Apply the global scale around the neutral value rather than multiplying
 * the value itself. In particular, 1.02 grows to 1.04, not 2.04. Exported for
 * the small deterministic contract test. */
export function amplifyHoverMotion(
  offset: [number, number, number],
  settle: number,
  grow: number,
  tip: number,
) {
  return {
    offset: offset.map((value) => value * HOVER_MOTION_SCALE) as [
      number,
      number,
      number,
    ],
    settle: settle * HOVER_MOTION_SCALE,
    grow: 1 + (grow - 1) * HOVER_MOTION_SCALE,
    tip: tip * HOVER_MOTION_SCALE,
  };
}

/** Walk one euler component `by` radians toward level, never past it. */
const toward = (v: number, by: number) =>
  v > 0 ? Math.max(0, v - by) : Math.min(0, v + by);

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const eulerScratch = new THREE.Euler();
const quatScratch = new THREE.Quaternion();
const shiftScratch = new THREE.Vector3();
const pivotScratch = new THREE.Vector3();

/**
 * Translation that pins the hinge edge in place while the group turns.
 *
 * A three.js group rotates about its own ORIGIN, and for most props on these
 * shelves the origin is the middle of the footprint — so a nod drives the back
 * half of the base down through the plank, which is the exact class of bug
 * this scene has regrown in eleven places (see scripts/stacks-floaters.mjs).
 * The fix is not eleven call sites, it is the pivot: rotate as usual, then
 * translate by (R_rest·pivot − R_now·pivot) so the chosen edge is the one
 * point that does not move. At rest the two rotations are equal and the shift
 * is identically zero, so a prop nobody is pointing at is where it always was.
 */
export function hingeShift(
  pivot: THREE.Vector3,
  now: THREE.Euler,
  rest: [number, number, number] | undefined,
): THREE.Vector3 {
  eulerScratch.set(rest?.[0] ?? 0, rest?.[1] ?? 0, rest?.[2] ?? 0);
  quatScratch.setFromEuler(eulerScratch);
  shiftScratch.copy(pivot).applyQuaternion(quatScratch);
  quatScratch.setFromEuler(now);
  return shiftScratch.sub(
    pivotScratch.copy(pivot).applyQuaternion(quatScratch),
  );
}

export default function Lift({
  hoverKey,
  base,
  offset,
  rest,
  settle = 0,
  grow = 1,
  tip,
  children,
}: {
  hoverKey: string;
  base: [number, number, number];
  offset: [number, number, number];
  /** Rest tilt. It belongs to the lift rather than to a wrapping group —
   * a tilt applied outside is out of the hover's reach. */
  rest?: [number, number, number];
  /** Radians of `rest` eased away per axis while hovered. Absolute rather
   * than a fraction: a print turned hard on the shelf would swing if it
   * straightened by proportion, while a nearly-square one would not move. */
  settle?: number;
  /** Uniform scale while hovered. */
  grow?: number;
  /** Radians of automatic nod about the prop's supporting edge. Left unset it
   * decides for itself: a call site that already authored a rotation response
   * (a `rest` tilt that `settle` eases away) keeps only that one, everything
   * else nods by TIP. Pass 0 to refuse it outright. */
  tip?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const settled = useRef(true);
  const previousLifted = useRef(false);
  /** Damped position with the hinge compensation taken back OUT, so the
   * compensation can be recomputed from the rotation the group actually has
   * this frame rather than from the one it is heading for. Mount-only state:
   * reseeding it from a fresh array literal on a parent re-render would
   * teleport a prop mid-hover. */
  const pos = useMemo(
    () => new THREE.Vector3(base[0], base[1], base[2]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  /** undefined = not measured yet, null = measured and refused (furniture, or
   * a prop wearing its own lighting rig). Resolved on the first hover, which
   * is the earliest moment the GLB is certainly there and the cheapest place
   * to pay for it — a prop nobody points at measures nothing, ever. */
  const hinge = useRef<Hinge | null | undefined>(undefined);
  const cameraDirection = useMemo(() => new THREE.Vector3(), []);
  const cameraWorld = useMemo(() => new THREE.Vector3(), []);
  const nodeWorld = useMemo(() => new THREE.Vector3(), []);
  const parentWorld = useMemo(() => new THREE.Quaternion(), []);
  const restInverse = useMemo(
    () =>
      new THREE.Quaternion()
        .setFromEuler(
          new THREE.Euler(rest?.[0] ?? 0, rest?.[1] ?? 0, rest?.[2] ?? 0),
        )
        .invert(),
    [rest],
  );
  const still = useMemo(() => reducedMotion(), []);
  /** A caller-authored rotation response wins; `tip={0}` refuses outright. */
  const authored =
    settle > 0 && !!rest && (rest[0] !== 0 || rest[1] !== 0 || rest[2] !== 0);
  const motion = amplifyHoverMotion(
    offset,
    settle,
    grow,
    tip ?? (authored ? 0 : TIP / HOVER_MOTION_SCALE),
  );
  const wanted = still ? 0 : motion.tip;

  useUnitFrame(({ camera }, delta) => {
    const g = ref.current;
    if (!g) return;
    const interaction = useStacks.getState();
    const pressed = interaction.pressedInteraction === hoverKey;
    const lifted =
      interaction.hovered === hoverKey ||
      interaction.focusedInteraction === hoverKey ||
      pressed;
    if (lifted !== previousLifted.current) {
      previousLifted.current = lifted;
      settled.current = false;
    }
    if (
      scenePerformanceController.getSnapshot().suspendSettledHoverWork &&
      settled.current
    )
      return;
    if (lifted && wanted > 0 && hinge.current === undefined) {
      // `offset[1] === 0` is the call site saying the prop cannot rise, which
      // in this scene is only ever true of something HELD — a print pinned to
      // the corkboard hinges at the brass, not at its bottom edge.
      const measured = hingeFor(g, offset[1] === 0, TILT_MAX_SIZE);
      // A null measurement means the model has not streamed in; leave the ref
      // undefined and ask again next frame rather than caching "no".
      if (measured) {
        hinge.current = measured.reason ? null : measured;
        if (process.env.NODE_ENV === "development") {
          // The same census ModelProp's floor prints, for the same reason: the
          // size cutoff was chosen off a measured population, and the only way
          // to keep choosing it well is to be able to read the population.
          console.info(
            `[stacks] tip ${hoverKey} size=${measured.size.toFixed(3)} → ${measured.reason ?? "ON"}`,
          );
        }
      }
    }
    const measuredHinge = hinge.current ?? null;
    const tx = base[0] + (lifted ? motion.offset[0] : 0);
    const ty = base[1] + (lifted ? motion.offset[1] : 0);
    const tz = base[2] + (lifted ? motion.offset[2] : 0);
    const by = lifted ? motion.settle : 0;
    const restX = rest ? toward(rest[0], by) : 0;
    let cameraTip = 0;
    if (lifted && measuredHinge && wanted > 0) {
      camera.getWorldPosition(cameraWorld);
      g.getWorldPosition(nodeWorld);
      cameraDirection.copy(cameraWorld).sub(nodeWorld);
      if (g.parent) {
        g.parent.getWorldQuaternion(parentWorld).invert();
        cameraDirection.applyQuaternion(parentWorld);
      }
      cameraDirection.applyQuaternion(restInverse);
      cameraTip = cameraFacingHoverTilt(cameraDirection, wanted);
    }
    const pivot = measuredHinge
      ? hingePivotForTilt(measuredHinge, cameraTip || g.rotation.x - restX)
      : null;
    const rx = restX + (lifted && pivot ? cameraTip : 0);
    const ry = rest ? toward(rest[1], by) : 0;
    const rz = rest ? toward(rest[2], by) : 0;
    const ts = pressed ? 0.965 : lifted ? motion.grow : 1;
    const r = g.rotation;
    const error =
      Math.abs(pos.x - tx) +
      Math.abs(pos.y - ty) +
      Math.abs(pos.z - tz) +
      Math.abs(r.x - rx) +
      Math.abs(r.y - ry) +
      Math.abs(r.z - rz) +
      Math.abs(g.scale.x - ts);
    if (error < 1e-4) {
      // Settled: land exactly on the target and stop integrating.
      pos.set(tx, ty, tz);
      r.set(rx, ry, rz);
      g.scale.setScalar(ts);
      settled.current = true;
    } else {
      settled.current = false;
      pos.x = THREE.MathUtils.damp(pos.x, tx, LAMBDA, delta);
      pos.y = THREE.MathUtils.damp(pos.y, ty, LAMBDA, delta);
      pos.z = THREE.MathUtils.damp(pos.z, tz, LAMBDA, delta);
      r.x = THREE.MathUtils.damp(r.x, rx, LAMBDA, delta);
      r.y = THREE.MathUtils.damp(r.y, ry, LAMBDA, delta);
      r.z = THREE.MathUtils.damp(r.z, rz, LAMBDA, delta);
      g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, ts, LAMBDA, delta));
    }
    // The hinge compensation comes off the rotation the group HAS, not the one
    // it is heading for, so the contact edge is pinned at every instant of the
    // ease rather than only at the ends. At rest it is exactly zero.
    if (pivot) g.position.copy(pos).add(hingeShift(pivot, r, rest));
    else g.position.copy(pos);
  });
  return (
    // Named for the same reason SPIN_NODE and hoverNodeName are: pixels cannot
    // say WHICH object moved, and this camera never stops breathing, so every
    // region of a screenshot reports motion over a second. `window.__stacks
    // .node("lift:<hoverKey>")` is the only honest way to check that the prop
    // under the pointer tipped and its neighbours did not.
    <group ref={ref} name={`lift:${hoverKey}`} position={base} rotation={rest}>
      {/* This subtree already lifts under the pointer — ModelProp's universal
          floor must not add a second lift inside it. */}
      <InteractionClaim>{children}</InteractionClaim>
    </group>
  );
}
