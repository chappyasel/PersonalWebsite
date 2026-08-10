"use client";

// Pick a prop up and move it. Lift.tsx's louder sibling: where Lift eases a
// few millimetres under the pointer, this hands the object over to you.
//
// Two motion paths, and which one you get is decided at the moment you press:
//
//   SIMULATED — a real solver (cannon-es, ~73KB gzip) that the homepage does
//   not download. The bytes live behind `import("./physics")` and are
//   prefetched on the FIRST HOVER of a grabbable prop, which is the earliest
//   honest signal that someone is thinking about touching something. Desktop
//   only, and never on a machine the degrade ladder has already stepped down.
//   Here the shelf answers back: the prop collides with its neighbours, tips,
//   tumbles, and STAYS where it lands.
//
//   AUTHORED — the 0-KB fallback, and what every visitor gets on the very
//   first grab if the module has not landed yet. Blocking the grab on a
//   network round trip, or Suspense-blanking the prop while it arrives, is a
//   worse failure than a slightly less physical drop. Three phases: held
//   (follow the pointer on a camera-facing plane with a damped lag and a tilt
//   into the direction of travel, so the object reads as CARRIED rather than
//   teleported), settling (ballistic fall, one damped bounce, spin bleeding
//   off with the horizontal velocity), rest (spring back to the authored
//   pose).
//
// Both paths end at the same rule, which has been narrowed rather than
// dropped: props come home when TRAVEL LEAVES THE UNIT. A shelf the visitor
// can permanently rearrange is a shelf that is wrong for the next visitor —
// but "permanently" was doing the work in that sentence, not "rearrange".
// Knocking the mug over and having it stay knocked over for as long as you
// are standing in front of it is the entire point of being able to pick it
// up. Walk to another unit and every prop is back on its mark.
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
import type { Phase, ShelfHandle, ShelfWorld } from "./physics";

/** Damping for the spring home — matches Lift's LAMBDA so a released prop
 * settles at the same rate the shelf's hover affordance moves. */
const HOME_LAMBDA = 6;
/** Deliberately under real gravity: a prop dropped 20cm at 9.81 lands in
 * under a fifth of a second, which reads as a glitch rather than a drop.
 * physics.ts carries the same number so both paths fall alike. */
const GRAVITY = 3.4;
/** Matches ContactShade's default so a grabbable prop grounds exactly like
 * its neighbours until the moment it is picked up. */
const SHADE_OPACITY = 0.12;

// --- the lazily-loaded solver -----------------------------------------------
//
// Module scope, not component state: the download is shared by every prop on
// the page and must not re-render anything when it lands. `physics` stays
// null until the chunk has actually parsed, and every read of it is a
// synchronous "is it here yet" — nothing ever awaits it inside a gesture.

/** The seam, written out: the only two things this file asks of the solver
 * chunk, so the chunk itself stays reachable ONLY through the dynamic import
 * below. */
type PhysicsModule = {
  warm: () => Promise<boolean>;
  worldFor: (
    parent: THREE.Object3D,
    handles: Iterable<ShelfHandle>,
  ) => ShelfWorld | null;
};

let physics: PhysicsModule | null = null;
let fetching = false;

/** Every mounted Grabbable, so a world can be built from the props actually
 * standing on a plank rather than from a list some unit file has to keep in
 * sync by hand. */
const registry = new Set<ShelfHandle>();

/** Desktop, and only while the scene is running at full quality.
 *
 * The touch exclusion is the same one that keeps touch from carrying at all
 * (see onDown). The quality gate rides the store's `postfx` flag, which is
 * exactly the signal Effects.tsx mounts on: false on touch, and false the
 * moment the degrade ladder takes its first step. A machine that cannot hold
 * a composer does not also get a solver. (It also means `?nopostfx` turns
 * physics off, which is the correct behaviour for an A/B flag that means
 * "show me the cheap path".) */
function physicsAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(pointer: coarse)").matches) return false;
  return useStacks.getState().postfx;
}

/** Fire-and-forget. Called from hover, so the download overlaps the visitor
 * deciding whether to grab; if they beat it, the first drag runs authored and
 * every drag after it is simulated. */
function prefetchPhysics() {
  if (physics || fetching || !physicsAllowed()) return;
  fetching = true;
  void import("./physics")
    .then(async (mod) => {
      if (!(await mod.warm())) return;
      physics = mod;
    })
    .catch(() => {
      // A solver that failed to download is not an error the visitor should
      // ever learn about — authored motion covers every drag.
    });
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  // The harness cannot see any of this from the DOM: carrying deliberately
  // re-renders nothing, and "did it collide or did it spring back" is a
  // question about world positions, not pixels.
  window.__grab = {
    physics: () => physics !== null,
    props: () =>
      [...registry].map((handle) => ({
        key: handle.key,
        unit: handle.unitIndex,
        phase: handle.phase.current,
        simulated: !!handle.body,
        base: handle.base.toArray(),
        position: handle.group.position.toArray(),
        quaternion: handle.group.quaternion.toArray(),
      })),
    /** The shelf world a given prop stands in, statics included — the only
     * way to check that the derived neighbour boxes match the scene. */
    world: (key: string) =>
      [...registry].find((handle) => handle.key === key)?.world?.report() ??
      null,
  };
}

declare global {
  interface Window {
    __grab?: {
      physics: () => boolean;
      props: () => unknown[];
      world: (key: string) => unknown;
    };
  }
}

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
  const step = useMemo(() => new THREE.Vector3(), []);
  const plane = useMemo(() => new THREE.Plane(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const world = useMemo(() => new THREE.Vector3(), []);
  const raycaster = useThree((s) => s.raycaster);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const pointerId = useRef<number | null>(null);
  /** The shared record this prop's rigid body hangs off. Null until mount,
   * and bodyless until a world has been built around it. */
  const handle = useRef<ShelfHandle | null>(null);
  /** Did THIS gesture get a body? Decided once, at pointerdown: a module
   * that lands mid-drag must not change the rules under the visitor's hand. */
  const simulated = useRef(false);
  /** Normalised device coords of the carrying pointer. Tracked from the
   * window rather than read off r3f's own pointer state: r3f only updates
   * that while the pointer is over the element it is connected to, so the
   * moment you dragged a prop across the DOM placard the prop froze in mid
   * air until the cursor came back. */
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const track = useCallback(
    (e: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
    },
    [gl, ndc],
  );

  // Register with the scene-wide set once, on mount. Mount-only on purpose:
  // the handle is the identity a rigid body is attached to, so re-creating it
  // when a caller passes a fresh `base` array literal would orphan the body
  // mid-carry. The mutable fields are refreshed every frame instead.
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const entry: ShelfHandle = {
      key: hoverKey,
      unitIndex,
      group: g,
      base: new THREE.Vector3(base[0], base[1], base[2]),
      spin,
      phase,
    };
    handle.current = entry;
    registry.add(entry);
    return () => {
      registry.delete(entry);
      entry.world?.drop(entry);
      handle.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    pointerId.current = null;
    if (phase.current !== "held") return;
    const entry = handle.current;
    // Hand the throw to the solver if this gesture had one. The velocity is
    // the prop's ACTUAL movement, not the gap to the cursor — using the gap
    // made it a spring constant rather than a speed, and everything left the
    // hand at the same 1.9 u/s no matter how gently you were moving.
    if (!(simulated.current && entry?.world?.release(entry, velocity)))
      phase.current = "settling";
    simulated.current = false;
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
  }, [velocity]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      // Touch is excluded, and not as a shortcut. `touch-action` is latched
      // by the browser when a gesture BEGINS, so setting it in pointerdown is
      // already too late: the pan is eligible, the browser claims the gesture
      // and fires pointercancel, and the grab dies half a frame after it
      // starts. On this scene a horizontal touch drag is also literally the
      // travel gesture, so the two cannot coexist without a long-press arming
      // step. Travel wins on touch; carrying props is a pointer affordance.
      if (e.pointerType === "touch") return;
      // Primary button of the primary pointer only — otherwise a right-click
      // starts a carry, and a second pointer's release ends someone else's.
      if (!e.isPrimary || e.button !== 0) return;
      const store = useStacks.getState();
      // `isPrimary` is per pointer TYPE, so a primary pen and a primary mouse
      // are both primary at once. One prop in hand at a time, always.
      if (store.dragging) return;
      if (store.hovered !== hoverKey) return;
      if (store.activeUnit !== unitIndex) return;
      pointerId.current = e.pointerId;
      phase.current = "held";
      velocity.set(0, 0, 0);
      track(e);
      // Build (or join) this plank's world while the prop is still standing
      // exactly on its mark — the collision boxes are measured here, and a
      // prop measured mid-carry would be measured tilted.
      const entry = handle.current;
      const parent = group.current?.parent;
      simulated.current = false;
      if (physics && entry && parent) {
        const shelf = physics.worldFor(parent, registry);
        if (shelf) simulated.current = shelf.grab(entry);
      }
      store.setDragging(hoverKey);
      // drei's ScrollControls `enabled` flag only short-circuits its own
      // handler — the DOM element keeps scrolling natively. Freezing the
      // element is what actually stops travel; overflow hidden also means no
      // scroll event ever fires, so drei has nothing to resync from and the
      // camera cannot teleport when the drag ends.
      const el = store.scrollEl;
      if (el) {
        el.style.touchAction = "none";
        el.style.overflowX = "hidden";
      }
    };
    const onMove = (e: PointerEvent) => {
      if (phase.current === "held" && e.pointerId === pointerId.current) track(e);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === pointerId.current) release();
    };
    // Freezing the scroll element is not enough on its own: drei's
    // ScrollControls attaches its own wheel handler that does
    // `el.scrollLeft += e.deltaY / 2`, and a PROGRAMMATIC scroll still works
    // under overflow:hidden. So a trackpad flick mid-carry would slide the
    // room out from under the prop. Capture-phase on window runs before the
    // element's own listener, so stopping it there is what actually holds.
    const onWheel = (e: WheelEvent) => {
      if (phase.current !== "held") return;
      // The placard is a real scroll container sitting over the scene, and
      // carrying a prop is no reason to freeze someone's reading. Only
      // swallow the wheel when it isn't headed there.
      const t = e.target;
      if (t instanceof Element && t.closest("[data-stacks-scrollable]")) return;
      e.preventDefault();
      // Capture-phase on window, so stopping here keeps the event from ever
      // descending to the scroll element where drei's own wheel handler
      // lives. It does NOT stop sibling window listeners, though, which is
      // why ScrollBridges checks `dragging` itself rather than relying on
      // this — two listeners on the same node have no ordering guarantee.
      e.stopPropagation();
    };
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    // A cancelled gesture (context menu, tab switch, the browser reclaiming
    // the pointer) must not leave the prop welded to a cursor that is no
    // longer pressed, with the scroll element still frozen.
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", release);
      release();
    };
  }, [hoverKey, unitIndex, release, track, velocity]);

  useFrame((state, rawDelta) => {
    const g = group.current;
    if (!g) return;
    // A backgrounded tab hands back one enormous delta; integrating it would
    // fling the prop to infinity on return.
    const delta = Math.min(rawDelta, 1 / 30);
    const entry = handle.current;
    if (entry) entry.base.set(base[0], base[1], base[2]);
    const shelf: ShelfWorld | null = entry?.world ?? null;

    // Travel ends the rearrangement. Not a timer, not the release — the prop
    // stays exactly where you knocked it for as long as you are standing in
    // front of it, and is back on its mark before the next visitor arrives.
    if (
      phase.current === "sim" &&
      useStacks.getState().activeUnit !== unitIndex
    )
      phase.current = "rest";

    if (phase.current === "held") {
      // Drag plane: camera-facing, through the prop's current position, so
      // the object tracks the cursor at its own depth instead of sliding
      // along the shelf. Rebuilt each frame because the camera rig keeps
      // breathing (a slow bob plus pointer parallax) even while you drag.
      camera.getWorldDirection(plane.normal).negate();
      g.getWorldPosition(world);
      plane.setFromNormalAndCoplanarPoint(plane.normal, world);
      // Re-cast every frame from the tracked NDC. r3f only refreshes the
      // shared raycaster during its own event pass, and this camera never
      // stops moving (a slow bob plus pointer parallax), so a stale ray
      // leaves the prop drifting under a stationary cursor.
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) {
        g.parent?.worldToLocal(hit);
        hit.y = Math.max(hit.y, base[1]); // never below the wood
        // Throw velocity is the prop's ACTUAL movement, not the gap to the
        // cursor. Using the gap made it a spring constant rather than a
        // speed — a cursor 10cm away produced ~1.9 u/s no matter how slowly
        // you were moving, and the prop shot off the shelf on release.
        //
        // Smoothed over ~3 frames, though, because ONE frame's movement over
        // ONE frame's delta is a lottery: a 2 ms hitch mid-drag divides a
        // normal step by a tenth of a normal delta and hands the solver a
        // 4 u/s fling the visitor never performed.
        world.copy(g.position);
        g.position.lerp(hit, 1 - Math.exp(-22 * delta));
        step.subVectors(g.position, world).divideScalar(delta);
        velocity.lerp(step, 1 - Math.exp(-26 * delta));
      }
      g.rotation.z = THREE.MathUtils.damp(g.rotation.z, -velocity.x * 0.05, 8, delta);
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, velocity.z * 0.05, 8, delta);
    } else if (phase.current === "sim") {
      // The solver owns this transform; the shelf's tick below writes it.
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
        // Home again: hand the body back to the solver, asleep and on its
        // mark, ready to be knocked by the next thing thrown at it.
        if (entry && shelf && !entry.parked) shelf.park(entry);
      } else {
        p.x = THREE.MathUtils.damp(p.x, base[0], HOME_LAMBDA, delta);
        p.y = THREE.MathUtils.damp(p.y, base[1], HOME_LAMBDA, delta);
        p.z = THREE.MathUtils.damp(p.z, base[2], HOME_LAMBDA, delta);
        g.rotation.x = THREE.MathUtils.damp(g.rotation.x, 0, HOME_LAMBDA, delta);
        g.rotation.y = THREE.MathUtils.damp(g.rotation.y, 0, HOME_LAMBDA, delta);
        g.rotation.z = THREE.MathUtils.damp(g.rotation.z, 0, HOME_LAMBDA, delta);
      }
    }

    // Step the shelf. Every prop standing on the plank calls this and the
    // world serves only the first one each frame, so who gets there is
    // whichever useFrame r3f registered first — except while something is in
    // hand, where the carrier claims the slot. The kinematic body has to be
    // pushed from the pose computed above, in this frame, or a throw lands
    // its contact one frame late.
    if (shelf && (phase.current === "held" || !shelf.carrying()))
      shelf.tick(delta, state.clock.elapsedTime);

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
          // The one honest moment to start the download: a pointer resting on
          // something you can pick up, several hundred milliseconds before the
          // press. Idempotent, and a no-op on touch or a degraded machine.
          prefetchPhysics();
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
