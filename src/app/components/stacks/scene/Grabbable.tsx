"use client";

// Pick a prop up and move it. Lift.tsx's louder sibling: where Lift eases a
// few millimetres under the pointer, this hands the object over to you.
//
// There is no physics engine here and that is a deliberate, costed call.
// Rapier is ~830KB gzip against a 180KB homepage budget — 4.6× the whole
// page for an interaction most visitors never trigger, and the first grab
// would stall on the download with the prop Suspense-blanked. cannon-es is
// ~50KB and still cannot pay for itself, because the thing a real solver
// buys you is prop-vs-prop collision, and this scene has nothing to collide
// with: every prop stands alone on open wood.
//
// So the motion is authored rather than simulated, in three phases:
//   held      — follow the pointer on a camera-facing plane, with a damped
//               lag and a tilt into the direction of travel, so the object
//               reads as CARRIED rather than teleported to the cursor;
//   settling  — ballistic fall to the wood, one damped bounce, spin bleeding
//               off with the horizontal velocity;
//   rest      — spring back to the authored pose. Props always come home;
//               a shelf the visitor can permanently rearrange is a shelf
//               that is wrong for the next visitor.
//
// The grounding matters more than the motion. This scene casts no shadows at
// all — there is no shadow-casting light in it, every `castShadow` flag is
// inert, and contact is faked by analytic ground pools and camera-facing
// ContactShade sprites pinned at each prop's rest position. Lift a prop
// without addressing that and its shadow stays behind on the wood, which
// instantly reads as broken. So Grabbable owns its own shade and drives it:
// it tracks the prop's x/z, stays on the wood, and spreads and fades as the
// object rises, which is what a real contact shadow does.
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { useStacks } from "../store";
import { poolTexture } from "./GroundPool";

type Phase = "rest" | "held" | "settling";

/** Damping for the spring home — matches Lift's LAMBDA so a released prop
 * settles at the same rate the shelf's hover affordance moves. */
const HOME_LAMBDA = 6;
/** Deliberately under real gravity: a prop dropped 20cm at 9.81 lands in
 * under a fifth of a second, which reads as a glitch rather than a drop. */
const GRAVITY = 3.4;
/** Matches ContactShade's default so a grabbable prop grounds exactly like
 * its neighbours until the moment it is picked up. */
const SHADE_OPACITY = 0.12;

export default function Grabbable({
  unitIndex,
  hoverKey,
  base,
  shadeWidth = 0.5,
  shadeColor,
  spin = 0.9,
  children,
}: {
  /** Only the active unit answers — off-screen props let the click fall
   * through to the unit-tap plane so a tap still travels there. */
  unitIndex: number;
  /** Unique across the scene; owns the store's single hover slot. */
  hoverKey: string;
  /** The authored pose the prop always returns to. */
  base: [number, number, number];
  shadeWidth?: number;
  shadeColor: string;
  /** How much horizontal throw becomes yaw on the way down. */
  spin?: number;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const shade = useRef<THREE.Sprite>(null);
  const phase = useRef<Phase>("rest");
  const velocity = useMemo(() => new THREE.Vector3(), []);
  const plane = useMemo(() => new THREE.Plane(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const world = useMemo(() => new THREE.Vector3(), []);
  const raycaster = useThree((s) => s.raycaster);
  const camera = useThree((s) => s.camera);
  const pointer = useThree((s) => s.pointer);

  // Grab and release ride WINDOW pointer events keyed off the hover slot,
  // not r3f's per-object onPointerDown. Measured, not preferred: with the
  // scene connected to ScrollControls' scroll element, `onPointerOver` on
  // this group fires reliably while `onPointerDown` on the same group never
  // dispatches at all — verified with an in-page marker (fresh module, empty
  // log) rather than console capture, so it isn't a logging artefact.
  //
  // Hover is the better source of truth anyway: r3f already maintains it,
  // and window listeners see the whole gesture, so a pointer that leaves the
  // prop's silhouette mid-drag — which it does immediately, since the prop
  // lags the cursor — cannot strand the drag. That also removes the need for
  // setPointerCapture entirely.
  const release = useCallback(() => {
    if (phase.current !== "held") return;
    phase.current = "settling";
    const store = useStacks.getState();
    store.setDragging(null);
    // Restore the scroll element by hand. drei's ScrollControls `enabled`
    // flag only short-circuits its own handler — the DOM element keeps
    // scrolling natively, and when the flag flips back the effect re-runs,
    // swallows one event and resyncs from el.scrollLeft, which teleports the
    // camera. Freezing the element itself is the only thing that prevents it.
    const el = store.scrollEl;
    if (el) {
      el.style.touchAction = "pan-x";
      el.style.overflowX = "auto";
    }
  }, []);

  useEffect(() => {
    const onDown = () => {
      const store = useStacks.getState();
      if (store.hovered !== hoverKey) return;
      if (store.activeUnit !== unitIndex) return;
      phase.current = "held";
      velocity.set(0, 0, 0);
      store.setDragging(hoverKey);
      // drei's ScrollControls `enabled` flag only short-circuits its own
      // handler — the DOM element keeps scrolling natively, and when the flag
      // flips back the effect re-runs, swallows one event and resyncs from
      // el.scrollLeft, teleporting the camera. Freezing the element itself is
      // the only thing that actually prevents that.
      const el = store.scrollEl;
      if (el) {
        el.style.touchAction = "none";
        el.style.overflowX = "hidden";
      }
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", release);
    // A cancelled gesture (context menu, tab switch, the browser reclaiming
    // the pointer) must not leave the prop welded to a cursor that is no
    // longer pressed, with the scroll element still frozen.
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
      release();
    };
  }, [hoverKey, unitIndex, release, velocity]);

  useFrame((_, rawDelta) => {
    const g = group.current;
    if (!g) return;
    // A backgrounded tab hands back one enormous delta; integrating it would
    // fling the prop to infinity on return.
    const delta = Math.min(rawDelta, 1 / 30);

    if (phase.current === "held") {
      // Drag plane: camera-facing, through the prop's current position, so
      // the object tracks the cursor at its own depth instead of sliding
      // along the shelf. Rebuilt each frame because the camera rig keeps
      // breathing (a slow bob plus pointer parallax) even while you drag.
      camera.getWorldDirection(plane.normal).negate();
      g.getWorldPosition(world);
      plane.setFromNormalAndCoplanarPoint(plane.normal, world);
      // Re-cast explicitly. r3f only refreshes the shared raycaster during
      // its own event pass, so between pointer moves the ray is stale — and
      // this camera never stops moving (a slow bob plus pointer parallax),
      // which would leave the prop drifting under a still cursor.
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) {
        g.parent?.worldToLocal(hit);
        hit.y = Math.max(hit.y, base[1]); // never below the wood
        // Throw velocity is the prop's ACTUAL movement this frame, not the
        // gap to the cursor. Using the gap made it a spring constant rather
        // than a speed — a cursor 10cm away produced ~1.9 u/s no matter how
        // slowly you were moving, and the prop shot off the shelf on release.
        world.copy(g.position);
        g.position.lerp(hit, 1 - Math.exp(-22 * delta));
        velocity.subVectors(g.position, world).divideScalar(delta);
      }
      g.rotation.z = THREE.MathUtils.damp(g.rotation.z, -velocity.x * 0.05, 8, delta);
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, velocity.z * 0.05, 8, delta);
    } else if (phase.current === "settling") {
      velocity.y -= GRAVITY * delta;
      g.position.addScaledVector(velocity, delta);
      g.rotation.y += velocity.x * spin * delta;
      if (g.position.y <= base[1]) {
        g.position.y = base[1];
        if (Math.abs(velocity.y) > 0.3) {
          velocity.y *= -0.32;
          velocity.x *= 0.55;
          velocity.z *= 0.55;
        } else {
          phase.current = "rest";
        }
      }
    } else {
      const p = g.position;
      // Yaw comes home too. The settle spins the prop, and leaving that spin
      // in meant "returns to its authored pose" was only true of position —
      // the mug ended up with its handle somewhere new every time, which is
      // exactly the permanent rearrangement this phase exists to prevent.
      const settled =
        Math.abs(p.x - base[0]) + Math.abs(p.y - base[1]) + Math.abs(p.z - base[2]) +
        Math.abs(g.rotation.x) + Math.abs(g.rotation.y) + Math.abs(g.rotation.z) < 1e-4;
      if (settled) {
        // Idle out completely, exactly as Lift does — a prop at rest must
        // not keep writing its own transform every frame.
        p.set(base[0], base[1], base[2]);
        g.rotation.set(0, 0, 0);
      } else {
        p.x = THREE.MathUtils.damp(p.x, base[0], HOME_LAMBDA, delta);
        p.y = THREE.MathUtils.damp(p.y, base[1], HOME_LAMBDA, delta);
        p.z = THREE.MathUtils.damp(p.z, base[2], HOME_LAMBDA, delta);
        g.rotation.x = THREE.MathUtils.damp(g.rotation.x, 0, HOME_LAMBDA, delta);
        g.rotation.y = THREE.MathUtils.damp(g.rotation.y, 0, HOME_LAMBDA, delta);
        g.rotation.z = THREE.MathUtils.damp(g.rotation.z, 0, HOME_LAMBDA, delta);
      }
    }

    // The shade stays on the wood under wherever the prop actually is, and
    // spreads and thins with height — the only cue in a shadowless scene
    // that the object has left the shelf. It is a SIBLING of the moving
    // group, never a child: as a child it would inherit the carry tilt and
    // the settle spin, and a contact shadow that rolls with the object it
    // belongs to is worse than no shadow at all.
    const s = shade.current;
    if (s) {
      const lift = Math.max(0, g.position.y - base[1]);
      const spreadT = Math.min(1, lift / 0.45);
      s.position.set(g.position.x, base[1] + 0.02, g.position.z + 0.02);
      const w = shadeWidth * (1 + spreadT * 0.7);
      s.scale.set(w, w * 0.32, 1);
      s.material.opacity = SHADE_OPACITY * (1 - 0.65 * spreadT);
    }
  });

  return (
    <>
      <sprite ref={shade} position={[base[0], base[1] + 0.02, base[2] + 0.02]}>
        <spriteMaterial
          map={poolTexture()}
          color={shadeColor}
          transparent
          opacity={SHADE_OPACITY}
          depthWrite={false}
          fog={false}
        />
      </sprite>
      <group
        ref={group}
        position={base}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          if (useStacks.getState().activeUnit !== unitIndex) return;
          e.stopPropagation();
          useStacks.getState().setHovered(hoverKey);
        }}
        onPointerOut={() => {
          if (useStacks.getState().hovered === hoverKey)
            useStacks.getState().setHovered(null);
        }}
      >
        {children}
      </group>
    </>
  );
}
