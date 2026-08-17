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
import { useStacks } from "../store";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { poolTexture } from "./GroundPool";
import { LIFT_LAMBDA, TIP, hingeShift } from "./Lift";
import { grabbablePhysicsEnabled } from "./grabbablePhysics";
import { type Hinge, TILT_MAX_SIZE, hingeFor } from "./interaction";
import {
  MASS_HANDLING,
  destinationFor,
  massClassFor,
  registerSceneInteraction,
} from "./interactionRegistry";
import { type PropDestination, useOpenTarget } from "./links";
import type {
  HullShape,
  Phase,
  ShelfHandle,
  ShelfPlane,
  ShelfWorld,
} from "./physics";

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
/** Pointer travel, in screen pixels, above which a press is a CARRY rather
 * than a click. The same 6 that r3f's own `event.delta` gate uses, so a prop
 * that is both a handle and a door answers a tap exactly as its neighbours do. */
const TAP_PX = 6;

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
    group: THREE.Object3D,
    handles: Iterable<ShelfHandle>,
  ) => ShelfWorld | null;
};

let physics: PhysicsModule | null = null;
let fetching = false;
const visitModes = new Map<number, "simulated" | "authored">();
let previousVisitUnit = useStacks.getState().activeUnit;
useStacks.subscribe((state) => {
  if (state.activeUnit === previousVisitUnit) return;
  visitModes.delete(previousVisitUnit);
  previousVisitUnit = state.activeUnit;
});

/** Every mounted Grabbable, so a world can be built from the props actually
 * standing on a plank rather than from a list some unit file has to keep in
 * sync by hand. */
const registry = new Set<ShelfHandle>();

// --- the one gesture dispatcher the whole shelf world shares ---------------
//
// Seventy-three props used to install the same six window listeners. Besides
// the 438 native registrations, that made event ordering part of mount order:
// every press walked every prop until the hovered one happened to claim it.
// One module-level dispatcher resolves the target once and hands the gesture
// to exactly one mounted Grabbable. The per-prop closures still own authored
// motion and solver release, so this changes no physics contract.

type GrabEventEntry = {
  key: string;
  unitIndex: number;
  group: THREE.Object3D;
  camera: THREE.Camera;
  domElement: HTMLElement;
  down: (event: PointerEvent, tapOnly: boolean) => boolean;
  move: (event: PointerEvent) => void;
  up: (event: PointerEvent) => boolean;
  cancel: (event?: PointerEvent) => boolean;
  wheel: (event: WheelEvent) => void;
  blur: () => void;
};

const eventEntries = new Map<string, GrabEventEntry>();
const eventRaycaster = new THREE.Raycaster();
const eventPointer = new THREE.Vector2();
const tapCounts = new Map<string, number>();
let activeEventEntry: GrabEventEntry | null = null;
let eventDispatcherListening = false;

/** Touch has no hover phase, so resolve its press against the same visible
 * Grabbable groups r3f renders. Furniture and the DOM placard are deliberately
 * absent: only loose handles in the active unit participate, and a touch that
 * starts on UI never leaks through to scenery behind it. */
function touchEntry(event: PointerEvent): GrabEventEntry | null {
  const state = useStacks.getState();
  const scrollEl = state.scrollEl;
  if (
    scrollEl &&
    event.target instanceof Node &&
    !scrollEl.contains(event.target)
  )
    return null;
  const candidates = [...eventEntries.values()].filter(
    (entry) => entry.unitIndex === state.activeUnit,
  );
  const first = candidates[0];
  if (!first) return null;
  const rect = first.domElement.getBoundingClientRect();
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    return null;
  eventPointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  eventRaycaster.setFromCamera(eventPointer, first.camera);
  const roots = new Map<THREE.Object3D, GrabEventEntry>();
  for (const entry of candidates) roots.set(entry.group, entry);
  const hits = eventRaycaster.intersectObjects(
    candidates.map((entry) => entry.group),
    true,
  );
  for (const hit of hits) {
    let node: THREE.Object3D | null = hit.object;
    while (node) {
      const entry = roots.get(node);
      if (entry) return entry;
      node = node.parent;
    }
  }
  return null;
}

function entryForDown(event: PointerEvent): GrabEventEntry | null {
  if (event.pointerType === "touch") return touchEntry(event);
  const hovered = useStacks.getState().hovered;
  return hovered ? (eventEntries.get(hovered) ?? null) : null;
}

function onEventDown(event: PointerEvent) {
  if (activeEventEntry) return;
  const entry = entryForDown(event);
  if (!entry?.down(event, event.pointerType === "touch")) return;
  activeEventEntry = entry;
}

function onEventMove(event: PointerEvent) {
  activeEventEntry?.move(event);
}

function onEventUp(event: PointerEvent) {
  const entry = activeEventEntry;
  if (entry?.up(event)) activeEventEntry = null;
}

function onEventCancel(event: PointerEvent) {
  const entry = activeEventEntry;
  if (entry?.cancel(event)) activeEventEntry = null;
}

function onEventWheel(event: WheelEvent) {
  activeEventEntry?.wheel(event);
}

function onEventBlur() {
  activeEventEntry?.blur();
  activeEventEntry = null;
}

function startEventDispatcher() {
  if (eventDispatcherListening || typeof window === "undefined") return;
  eventDispatcherListening = true;
  window.addEventListener("wheel", onEventWheel, {
    capture: true,
    passive: false,
  });
  window.addEventListener("pointerdown", onEventDown);
  window.addEventListener("pointermove", onEventMove);
  window.addEventListener("pointerup", onEventUp);
  window.addEventListener("pointercancel", onEventCancel);
  window.addEventListener("blur", onEventBlur);
}

function stopEventDispatcher() {
  if (!eventDispatcherListening || typeof window === "undefined") return;
  eventDispatcherListening = false;
  window.removeEventListener("wheel", onEventWheel, { capture: true });
  window.removeEventListener("pointerdown", onEventDown);
  window.removeEventListener("pointermove", onEventMove);
  window.removeEventListener("pointerup", onEventUp);
  window.removeEventListener("pointercancel", onEventCancel);
  window.removeEventListener("blur", onEventBlur);
  activeEventEntry = null;
}

function subscribeGrabEvents(entry: GrabEventEntry): () => void {
  eventEntries.set(entry.key, entry);
  startEventDispatcher();
  return () => {
    if (eventEntries.get(entry.key) === entry) eventEntries.delete(entry.key);
    if (activeEventEntry === entry) {
      entry.cancel();
      activeEventEntry = null;
    }
    // Fast Refresh unmounts the outgoing component tree before mounting its
    // replacement. Releasing the final subscriber removes the old module's
    // native closures, so HMR never accumulates dispatchers.
    if (eventEntries.size === 0) stopEventDispatcher();
  };
}

function recordTap(key: string) {
  if (process.env.NODE_ENV !== "production")
    tapCounts.set(key, (tapCounts.get(key) ?? 0) + 1);
}

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

/** Fire-and-forget. The canvas schedules this after first paint on eligible
 * desktop devices. Whichever mode is ready for the first grab is then locked
 * for that active-unit visit. */
export function prewarmGrabbablePhysics() {
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
    dispatcher: () => ({
      handles: eventEntries.size,
      windowListeners: eventDispatcherListening ? 6 : 0,
      active: activeEventEntry?.key ?? null,
    }),
    taps: () => Object.fromEntries(tapCounts),
  };
}

declare global {
  interface Window {
    __grab?: {
      physics: () => boolean;
      props: () => unknown[];
      world: (key: string) => unknown;
      dispatcher: () => {
        handles: number;
        windowListeners: number;
        active: string | null;
      };
      taps: () => Record<string, number>;
    };
  }
}

export default function Grabbable({
  unitIndex,
  hoverKey,
  base,
  shadeWidth = 0.5,
  shadeColor,
  tiltOnHover = true,
  spin = 0.9,
  shape,
  massKg,
  restitution,
  standsOn,
  to,
  href,
  doorLabel,
  actionLabel,
  external = true,
  onTap,
  egg,
  physics: physicsPreference,
  draggable = true,
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
  /** Keep the authored facing angle fixed while still allowing hover/tap
   * behavior. Reflective marks use shimmer instead of the shared nod because
   * even a small pitch can move their environment highlight off the face. */
  tiltOnHover?: boolean;
  /** How much horizontal throw becomes yaw on the way down. Ignored for a
   * ball, which rolls at ω = v/r instead. */
  spin?: number;
  /** Collision hull. Leave unset and the AABB decides: near-cubic is a ball.
   * Pass it explicitly when the model's box lies — a squat prop that is not
   * round, or a round one whose bbox carries a stand. */
  shape?: HullShape;
  /** What the prop weighs, in real kilograms. Without it mass comes off a
   * uniform density, which is fine for solid props and badly wrong for
   * hollow ones: a basketball massed by volume outweighs a golf ball 110 to
   * 1 instead of 13 to 1, and the golf ball cannot budge it. */
  massKg?: number;
  /** Bounce coefficient against the support surface. */
  restitution?: number;
  /** Which plank the prop stands on. Only needed for a prop whose parent
   * group is not one of ShelfUnit's two shelves — anything on the ground
   * bay, whose parent sits at y 0 and would otherwise be read as a top
   * shelf, putting the floor 1.1 units too high. */
  standsOn?: ShelfPlane;
  /** Where this prop leads, if anywhere. A prop should not have to choose
   * between being a handle and being a door: a press that never MOVED is a
   * click and opens this, a press that moved is a carry. Same 6px gate r3f's
   * own `event.delta` uses, and the same destinations PropLink offers — the
   * two wrappers were the reason a shelf full of similar objects behaved
   * three different ways depending on which one you reached for. */
  to?: PropDestination;
  href?: string;
  /** Required outcome copy for arbitrary URLs or local-action Doors. Route
   * destinations inherit their exact copy from the destination table. */
  doorLabel?: string;
  actionLabel?: string;
  external?: boolean;
  /** Local action for a press that never became a carry. Stateful objects
   * such as featured covers use this instead of pretending to be a route. */
  onTap?: () => void;
  /** Marks onTap as a quiet easter egg rather than a Door. */
  egg?: { reducedMotion: "skip" | "state-only" };
  /** Keep pointer carrying and tap arbitration but bypass free shelf physics,
   * returning to the authored base after release. Defaults to true. */
  physics?: boolean;
  /** Keep click activation and its pointer cursor without allowing a carry. */
  draggable?: boolean;
  children: React.ReactNode;
}) {
  const physicsEnabled =
    draggable && grabbablePhysicsEnabled(physicsPreference);
  const massClass = massClassFor(massKg ?? 1);
  const handling = MASS_HANDLING[massClass];
  const group = useRef<THREE.Group>(null);
  /** The hover nod, on a child of the physics group rather than on the group
   * itself. Deliberate: the outer group's pose is the one the solver reads and
   * writes, and a few degrees of hover tilt held there would keep `settled`
   * false forever, so a prop you were merely POINTING at could never park its
   * body and would hold the shelf's kinematic push open. Inside, the nod is
   * purely visual and the physics pose is untouched. */
  const nod = useRef<THREE.Group>(null);
  const nodAngle = useRef(0);
  const hinge = useRef<Hinge | null | undefined>(undefined);
  const still = useMemo(() => reducedMotion(), []);
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
  /** Touch can tap a prop but never carry it. This is latched for one gesture
   * so a touch release cannot accidentally enter the desktop solver path. */
  const tapOnly = useRef(false);
  /** Where the current press started and whether it has travelled far enough
   * to be a carry rather than a click. Null between gestures. */
  const gesture = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const onTapRef = useRef(onTap);
  useEffect(() => {
    onTapRef.current = onTap;
  }, [onTap]);
  const open = useOpenTarget();
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
      shape,
      massKg,
      restitution,
      plane: standsOn,
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

  useEffect(() => {
    const root = group.current;
    if (!root) return;
    const run = () => {
      if (onTapRef.current) onTapRef.current();
      else if (to !== undefined) open({ to });
      else if (href !== undefined && doorLabel)
        open({ href, label: doorLabel, external });
    };
    const activation = egg
      ? ({ kind: "egg", run, reducedMotion: egg.reducedMotion } as const)
      : to !== undefined
        ? ({ kind: "door", ...destinationFor(to), run } as const)
        : href !== undefined && doorLabel
          ? ({ kind: "door", label: doorLabel, href, external, run } as const)
          : onTap !== undefined && (actionLabel ?? doorLabel)
            ? ({
                kind: "action",
                label: actionLabel ?? doorLabel!,
                run,
              } as const)
            : undefined;
    return registerSceneInteraction({
      id: hoverKey,
      root,
      activeUnits: [unitIndex],
      movable: draggable ? { massKg: massKg ?? 1, massClass } : undefined,
      activation,
      hover: { kind: draggable && tiltOnHover ? "tilt" : "none" },
    });
  }, [
    actionLabel,
    doorLabel,
    draggable,
    egg,
    external,
    href,
    hoverKey,
    massClass,
    massKg,
    onTap,
    open,
    tiltOnHover,
    to,
    unitIndex,
  ]);

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
    velocity.multiplyScalar(handling.throwTilt);
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
  }, [handling.throwTilt, velocity]);

  const onGrabDown = useCallback(
    (event: PointerEvent, touchTapOnly: boolean): boolean => {
      // Primary button of the primary pointer only — otherwise a right-click
      // starts a carry, and a second pointer's release ends someone else's.
      if (!event.isPrimary || event.button !== 0) return false;
      const store = useStacks.getState();
      // `isPrimary` is per pointer TYPE, so a primary pen and a primary mouse
      // are both primary at once. One prop in hand at a time, always.
      if (store.dragging || store.activeUnit !== unitIndex) return false;
      if (!touchTapOnly && store.hovered !== hoverKey) return false;

      pointerId.current = event.pointerId;
      tapOnly.current = touchTapOnly || !draggable;
      gesture.current = {
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
      // Touch retains native horizontal travel. We only remember enough to
      // answer a stationary release; no held phase, scroll freeze, solver or
      // pointer tracking is entered, so carrying remains desktop-only.
      if (tapOnly.current) return true;

      phase.current = "held";
      velocity.set(0, 0, 0);
      track(event);
      // Build (or join) this plank's world while the prop is still standing
      // exactly on its mark — the collision boxes are measured here, and a
      // prop measured mid-carry would be measured tilted.
      const entry = handle.current;
      const g = group.current;
      simulated.current = false;
      const locked = visitModes.get(unitIndex);
      if (locked !== "authored" && physicsEnabled && physics && entry && g) {
        // The prop's OWN group, not its parent: the solver resolves which
        // plank this is from the world matrix, so every prop on a shelf lands
        // in one world and they can hit each other regardless of which layout
        // group each unit file happens to have wrapped them in.
        const shelf = physics.worldFor(g, registry);
        if (shelf) simulated.current = shelf.grab(entry);
      }
      if (!locked)
        visitModes.set(unitIndex, simulated.current ? "simulated" : "authored");
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
      return true;
    },
    [draggable, hoverKey, physicsEnabled, track, unitIndex, velocity],
  );

  const onGrabMove = useCallback(
    (event: PointerEvent) => {
      if (event.pointerId !== pointerId.current) return;
      const current = gesture.current;
      if (
        current &&
        Math.hypot(event.clientX - current.x, event.clientY - current.y) >
          TAP_PX
      )
        current.moved = true;
      if (!tapOnly.current && phase.current === "held") track(event);
    },
    [track],
  );

  const onGrabUp = useCallback(
    (event: PointerEvent): boolean => {
      if (event.pointerId !== pointerId.current) return false;
      const tapped = gesture.current?.moved === false;
      const wasTapOnly = tapOnly.current;
      gesture.current = null;
      tapOnly.current = false;
      if (wasTapOnly) pointerId.current = null;
      else release();

      // A press that never moved was never a carry. Opening here rather than
      // through an r3f onClick is not a style choice: r3f gates click-type
      // events on the object having been in the hit list captured at
      // POINTERDOWN, and pointerdown does not dispatch on this scene at all
      // (see the note above). A window pointerup consults none of that.
      if (tapped) {
        recordTap(hoverKey);
        if (onTapRef.current) onTapRef.current();
        else if (to !== undefined || href !== undefined)
          open(
            href !== undefined
              ? { href, label: doorLabel ?? "Open link", external }
              : { to: to! },
          );
      }
      return true;
    },
    [doorLabel, external, href, hoverKey, open, release, to],
  );

  const onGrabCancel = useCallback(
    (event?: PointerEvent): boolean => {
      if (event && event.pointerId !== pointerId.current) return false;
      gesture.current = null;
      tapOnly.current = false;
      // Cancellation releases desktop physics exactly like pointerup, but it
      // is never a tap. This distinction is what lets the browser reclaim a
      // touch swipe without opening the prop under its starting finger.
      release();
      return true;
    },
    [release],
  );

  const onGrabWheel = useCallback((event: WheelEvent) => {
    if (phase.current !== "held") return;
    // The placard is a real scroll container sitting over the scene, and
    // carrying a prop is no reason to freeze someone's reading. Only swallow
    // the wheel when it isn't headed there.
    const target = event.target;
    if (target instanceof Element && target.closest("[data-stacks-scrollable]"))
      return;
    event.preventDefault();
    // Capture-phase on window runs before drei's scroll-element handler.
    event.stopPropagation();
  }, []);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const entry: GrabEventEntry = {
      key: hoverKey,
      unitIndex,
      group: g,
      camera,
      domElement: gl.domElement,
      down: onGrabDown,
      move: onGrabMove,
      up: onGrabUp,
      cancel: onGrabCancel,
      wheel: onGrabWheel,
      blur: () => {
        gesture.current = null;
        tapOnly.current = false;
        release();
      },
    };
    return subscribeGrabEvents(entry);
  }, [
    camera,
    gl,
    hoverKey,
    onGrabCancel,
    onGrabDown,
    onGrabMove,
    onGrabUp,
    onGrabWheel,
    release,
    unitIndex,
  ]);

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
    if (useStacks.getState().activeUnit !== unitIndex) {
      if (phase.current === "sim") phase.current = "rest";
    }

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
        hit.y = Math.min(base[1] + handling.maxLift, Math.max(hit.y, base[1])); // mass-class lift ceiling, never below the wood
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
        g.position.lerp(hit, 1 - Math.exp(-handling.followLambda * delta));
        step.subVectors(g.position, world).divideScalar(delta);
        velocity.lerp(step, 1 - Math.exp(-26 * delta));
      }
      g.rotation.z = THREE.MathUtils.damp(
        g.rotation.z,
        -velocity.x * 0.05 * handling.throwTilt,
        8,
        delta,
      );
      g.rotation.x = THREE.MathUtils.damp(
        g.rotation.x,
        velocity.z * 0.05 * handling.throwTilt,
        8,
        delta,
      );
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
        Math.abs(p.x - base[0]) +
          Math.abs(p.y - base[1]) +
          Math.abs(p.z - base[2]) +
          Math.abs(g.rotation.x) +
          Math.abs(g.rotation.y) +
          Math.abs(g.rotation.z) <
        1e-4;
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
        g.rotation.x = THREE.MathUtils.damp(
          g.rotation.x,
          0,
          HOME_LAMBDA,
          delta,
        );
        g.rotation.y = THREE.MathUtils.damp(
          g.rotation.y,
          0,
          HOME_LAMBDA,
          delta,
        );
        g.rotation.z = THREE.MathUtils.damp(
          g.rotation.z,
          0,
          HOME_LAMBDA,
          delta,
        );
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

    // The hover nod. Same gesture, same curve and same hinge edge as every
    // other prop in the world (see Lift) — a prop you can pick up should not
    // be the one prop that ignores the pointer until you press. Only at REST:
    // a prop in hand already tilts into its direction of travel, and one
    // mid-tumble belongs to the solver.
    const n = nod.current;
    if (n) {
      const wants =
        phase.current === "rest" &&
        tiltOnHover &&
        useStacks.getState().hovered === hoverKey &&
        !still;
      if (wants && hinge.current === undefined) {
        const measured = hingeFor(n, false, TILT_MAX_SIZE);
        if (measured) {
          hinge.current = measured.reason ? null : measured;
          if (
            process.env.NODE_ENV === "development" &&
            measured.reason === "furniture"
          ) {
            // The draggability rule, enforced where it can actually be
            // checked. A call site cannot know a prop's world size — `scale`
            // is a multiplier over wildly different source models — so this is
            // the only honest place to say "that one is too big to pick up".
            console.warn(
              `[stacks] ${hoverKey} measures ${measured.size.toFixed(3)}, over the ` +
                `${TILT_MAX_SIZE} draggable line (DRAGGABLE_RULE in interaction.ts). ` +
                "Furniture should not be a handle.",
            );
          }
        }
      }
      const target = wants && hinge.current ? TIP : 0;
      if (Math.abs(nodAngle.current - target) < 1e-4) nodAngle.current = target;
      else
        nodAngle.current = THREE.MathUtils.damp(
          nodAngle.current,
          target,
          LIFT_LAMBDA,
          delta,
        );
      n.rotation.x = nodAngle.current;
      if (hinge.current)
        n.position.copy(hingeShift(hinge.current.pivot, n.rotation, undefined));
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
        // Tap/drag arbitration happens on the native window gesture above.
        // Consume Three's later synthetic click so the same ray cannot also
        // activate a link or unit plane sitting behind this carried object.
        onClick={(event) => {
          if (useStacks.getState().activeUnit !== unitIndex) return;
          event.stopPropagation();
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          if (useStacks.getState().activeUnit !== unitIndex) return;
          e.stopPropagation();
          useStacks.getState().setHovered(hoverKey);
          // The one honest moment to start the download: a pointer resting on
          // something you can pick up, several hundred milliseconds before the
          // press. Idempotent, and a no-op on touch or a degraded machine.
          if (physicsEnabled) prewarmGrabbablePhysics();
        }}
        onPointerOut={() => {
          if (useStacks.getState().hovered === hoverKey)
            useStacks.getState().setHovered(null);
        }}
      >
        {/* Named for the same reason Lift's group and SPIN_NODE are: the nod
            is a few degrees on ONE object in a scene where the camera never
            stops moving, so a screenshot cannot tell you it happened. */}
        <group ref={nod} name={`nod:${hoverKey}`}>
          {children}
        </group>
      </group>
    </>
  );
}

/** Twin of the helper in Lift/ModelProp (not exported there). */
function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
