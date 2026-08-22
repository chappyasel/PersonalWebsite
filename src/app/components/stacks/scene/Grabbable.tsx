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
// Both paths preserve rearrangements while they remain visible. A settled
// prop returns directly to its authored mark only after it has stayed outside
// an expanded camera frustum for a second; travel itself never resets it.
//
// The grounding matters more than the motion. The production scene casts no
// shadows: contact is faked by analytic ground pools and camera-facing
// ContactShade sprites pinned at each prop's rest position. Cinematic+ mounts
// a separate diagnostics-only sun and shadow map, but the movable shade still
// has to follow the prop in every mode. Lift a prop without addressing that
// and its contact stays behind on the wood, which instantly reads as broken.
// Grabbable therefore owns its own shade and drives it: it tracks the prop's
// x/z, stays on the wood, and spreads and fades as the object rises.
import { useStacks } from "../store";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { poolTexture } from "./GroundPool";
import { LIFT_LAMBDA, hingeShift } from "./Lift";
import {
  type PhysicsSceneScope,
  usePhysicsScene,
} from "./PhysicsSceneProvider";
import { grabbablePhysicsEnabled } from "./grabbablePhysics";
import {
  localCameraFacingQuaternion,
  tiltedFaceClearance,
} from "./heldFacingMath";
import { cameraSideHoverTilt, cameraSideSlide } from "./hoverTilt";
import {
  type Hinge,
  TILT_MAX_SIZE,
  hingeFor,
  hingePivotForTilt,
} from "./interaction";
import {
  MASS_HANDLING,
  type ProjectedLocalBounds,
  destinationFor,
  massClassFor,
  registerSceneInteraction,
} from "./interactionRegistry";
import { leanBudget } from "./leanClearance";
import { type PropDestination, useOpenTarget } from "./links";
import { propReactionIsEngaged } from "./reactionEngagement";
import type {
  HeldMoveResult,
  HeldPose,
  HullShape,
  Phase,
  ScenePhysicsWorld,
  ShelfHandle,
  ShelfPlane,
  WorldPreparationResult,
} from "./physics";
import type { DynamicColliderProfile } from "./physicsColliders";
import { physicsDiagnosticsController } from "./physicsDiagnostics";
import {
  archetypeFor,
  bandMotionFor,
  recordArchetype,
} from "./reactionArchetype";
import {
  applySceneImpulseKick,
  createSceneImpulseMotion,
  getSceneImpulse,
  sceneImpulseKick,
  stepSceneImpulseMotion,
} from "./sceneImpulse";
import {
  scenePerformanceController,
  shouldSuspendSettledPropFrame,
} from "./scenePerformance";
import { SHELF_GEOMETRY } from "./shelfGeometry";
import {
  type SwaySpring,
  cameraSideSwayTwist,
  createSwaySpring,
  stepSway,
} from "./swayMotion";
import { sceneUnitActivityController, useUnitFrame } from "./unitActivity";

/** Damping for the spring home — matches Lift's LAMBDA so a released prop
 * settles at the same rate the shelf's hover affordance moves. */
const HOME_LAMBDA = 6;
/** Matches ContactShade's default so a grabbable prop grounds exactly like
 * its neighbours until the moment it is picked up. */
const SHADE_OPACITY = 0.12;
/** Pointer travel, in screen pixels, above which a press is a CARRY rather
 * than a click. The same 6 that r3f's own `event.delta` gate uses, so a prop
 * that is both a handle and a door answers a tap exactly as its neighbours do. */
const TAP_PX = 6;
/** Deliberately under real gravity: a prop dropped 20cm at 9.81 lands in
 * under a fifth of a second, which reads as a glitch rather than a drop.
 * physics.ts carries the same number so both paths fall alike. */
const GRAVITY = 9.81;

// --- the lazily-loaded solver -----------------------------------------------
//
// Module scope, not component state: the download is shared by every prop on
// the page and must not re-render anything when it lands. `physics` stays
// null until the chunk has parsed and Cannon has initialized. Ordinary props
// may use authored motion while that happens; mounted props wait rather than
// detaching without the body they require.

/** The seam, written out: the only two things this file asks of the solver
 * chunk, so the chunk itself stays reachable ONLY through the dynamic import
 * below. */
type PhysicsModule = {
  warm: () => Promise<boolean>;
  prepareScenePhysics: (
    scope: PhysicsSceneScope,
    handle: ShelfHandle,
  ) => WorldPreparationResult;
};

let physics: PhysicsModule | null = null;
let physicsLoad: Promise<PhysicsModule | null> | null = null;

let diagnosticsScope: PhysicsSceneScope | null = null;

// --- the one gesture dispatcher the whole scene shares ---------------------
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
 * absent: any loose handle actually under the pointer participates, and a
 * touch that starts on UI never leaks through to scenery behind it. */
function touchEntry(event: PointerEvent): GrabEventEntry | null {
  const state = useStacks.getState();
  const scrollEl = state.scrollEl;
  if (
    scrollEl &&
    event.target instanceof Node &&
    !scrollEl.contains(event.target)
  )
    return null;
  const candidates = [...eventEntries.values()];
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
  // Touch is owned exclusively by TouchInteractionLayer. Keeping this legacy
  // dispatcher fine-only prevents one contact from becoming both a carry and
  // an activation through independently ordered window listeners.
  if (event.pointerType === "touch") return;
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

/** Carry simulation is independent of pointer type. Coarse contact begins the
 * same lazy load; the authored path covers a pickup that wins the race. */
function physicsAllowed(): boolean {
  return typeof window !== "undefined";
}

function loadGrabbablePhysics(): Promise<PhysicsModule | null> {
  if (physics) return Promise.resolve(physics);
  if (!physicsAllowed()) return Promise.resolve(null);
  if (physicsLoad) return physicsLoad;
  physicsDiagnosticsController.update({ moduleState: "loading" });
  physicsLoad = import("./physics")
    .then(async (mod) => {
      if (!(await mod.warm())) {
        physicsDiagnosticsController.update({ moduleState: "failed" });
        return null;
      }
      physics = mod;
      physicsDiagnosticsController.update({ moduleState: "ready" });
      return physics;
    })
    .catch(() => {
      physicsDiagnosticsController.update({ moduleState: "failed" });
      // A solver that failed to download is not an error the visitor should
      // ever learn about — authored motion covers every drag.
      return null;
    });
  return physicsLoad;
}

/** Fire-and-forget. The canvas schedules this after first paint on eligible
 * desktop devices and hover retries it. */
export function prewarmGrabbablePhysics() {
  void loadGrabbablePhysics();
}

function requestSceneImpulseKnockdown(
  scope: PhysicsSceneScope,
  entry: ShelfHandle,
  kick: Readonly<{ x: number; y: number; z: number }>,
) {
  const worldVelocity = new THREE.Vector3(
    kick.x * 2.35,
    Math.max(0.32, kick.y * 2.35),
    kick.z * 2.35,
  );
  void loadGrabbablePhysics().then((loaded) => {
    if (!loaded) return;
    const attempt = (remaining: number) => {
      if (!entry.group.parent || entry.phase.current === "held") return;
      const prepared = loaded.prepareScenePhysics(scope, entry);
      if (prepared.status === "ready") {
        prepared.world.knock(entry, worldVelocity);
        return;
      }
      if (prepared.reason !== "geometry-pending" || remaining <= 0) return;
      requestAnimationFrame(() => attempt(remaining - 1));
    };
    attempt(8);
  });
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  // The harness cannot see any of this from the DOM: carrying deliberately
  // re-renders nothing, and "did it collide or did it spring back" is a
  // question about world positions, not pixels.
  window.__grab = {
    physics: () => physics !== null,
    props: () =>
      [...(diagnosticsScope?.handles<ShelfHandle>() ?? [])].map((handle) => ({
        key: handle.key,
        unit: handle.unitIndex,
        phase: handle.phase.current,
        simulated: !!handle.body,
        base: handle.base.toArray(),
        position: handle.group.position.toArray(),
        quaternion: handle.group.quaternion.toArray(),
      })),
    /** The scene world a given prop belongs to, statics included. */
    world: (key: string) =>
      [...(diagnosticsScope?.handles<ShelfHandle>() ?? [])]
        .find((handle) => handle.key === key)
        ?.world?.report() ?? null,
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
  physicsDetachOffset,
  shadeWidth = 0.5,
  shadeColor,
  tiltOnHover = true,
  metal = false,
  signature,
  hoverTiltAngle,
  tiltWhileHeld = true,
  heldFacingRotation,
  heldMinRaise,
  spin = 0.9,
  shape,
  colliderProfile,
  massKg,
  restitution,
  maxThrowSpeed,
  standsOn,
  to,
  href,
  doorLabel,
  actionLabel,
  external = true,
  onTap,
  onDragIntent,
  sceneImpulseReaction = "nudge",
  projectedLocalBounds,
  egg,
  physics: physicsPreference,
  draggable = true,
  children,
}: {
  /** Owning unit for diagnostics and authored scene relationships. */
  unitIndex: number;
  /** Unique across the scene; owns the store's single hover slot. */
  hoverKey: string;
  /** The authored pose the prop always returns to. */
  base: [number, number, number];
  /** Local offset applied once when a mounted prop becomes a carry. The prop
   * remains bodyless until this clears its mount, then joins ordinary held
   * physics. */
  physicsDetachOffset?: [number, number, number];
  shadeWidth?: number;
  shadeColor: string;
  /** Keep the authored facing angle fixed while still allowing hover/tap
   * behavior. Reflective marks use shimmer instead of the shared nod because
   * even a small pitch can move their environment highlight off the face. */
  tiltOnHover?: boolean;
  /** This prop's polished-metal treatment owns its hover response. Resolves to
   * the `shimmer` archetype, which suppresses the tilt: the whole point of a
   * metal mark is the environment highlight sitting on its face, and pitching
   * it toward the viewer is what slides that highlight off. A flag rather than
   * a material scan because these props are bespoke components calling
   * `useMetalShimmer`, not ModelProps whose materials could be sampled. */
  metal?: boolean;
  /**
   * This prop owns a Signature Reaction, named — see SIGNATURE_REACTIONS.
   *
   * Setting it makes the shell stand down completely: no lean, no twist, no
   * hinge measurement. The gesture lives in a component wrapped around the
   * children (the trophy's `Glint`, the cup's `SteamCup`) and that component
   * is now the WHOLE answer rather than a second one layered under the shared
   * nod. Two effects at once is the thing ADR 0020 exists to remove.
   */
  signature?: string;
  /** Exact hover opening angle. The sign follows the live camera so the
   * camera-nearest support edge remains the hinge. Leave unset for the shared
   * camera-facing nod. */
  hoverTiltAngle?: number;
  /** Whether pointer velocity banks the prop during a carry. Broad books that
   * begin in contact with a supporting riser keep their facing stable until
   * release; the solver can still tumble them normally after a throw. */
  tiltWhileHeld?: boolean;
  /** Rotate the physical carrier and its collider square to the camera while
   * held. Use this instead of a visual-only HeldFacing wrapper when the rest
   * and carried orientations differ enough to change the collision hull. */
  heldFacingRotation?: [number, number, number];
  /** Minimum rise above the pickup pose while physically facing the camera.
   * Broad flat props need room for their lower edge to clear the shelf. */
  heldMinRaise?: number;
  /** How much horizontal throw becomes yaw on the way down. Ignored for a
   * ball, which rolls at ω = v/r instead. */
  spin?: number;
  /** Collision hull. Leave unset and the AABB decides: near-cubic is a ball.
   * Pass it explicitly when the model's box lies — a squat prop that is not
   * round, or a round one whose bbox carries a stand. */
  shape?: HullShape;
  /** Optional authored simplification for visibly concave props. Leafy
   * plants collide by their solid planter while foliage may overlap. */
  colliderProfile?: DynamicColliderProfile;
  /** What the prop weighs, in real kilograms. Without it mass comes off a
   * uniform density, which is fine for solid props and badly wrong for
   * hollow ones: a basketball massed by volume outweighs a golf ball 110 to
   * 1 instead of 13 to 1, and the golf ball cannot budge it. */
  massKg?: number;
  /** Bounce coefficient against the support surface. */
  restitution?: number;
  /** Magnitude cap for release velocity. Ordinary props default to 4. */
  maxThrowSpeed?: number;
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
  /** One-shot response when a press first crosses the drag threshold. This
   * also fires for an anchored (`draggable={false}`) object, allowing a drag
   * gesture to animate its contents without turning the object into a loose
   * shelf prop. */
  onDragIntent?: (
    origin: Readonly<{ x: number; y: number; z: number }>,
  ) => void;
  /** A few hero props can enter the real rigid-body world when a scene
   * shockwave reaches them. Everyone else keeps the short authored nudge. */
  sceneImpulseReaction?: "nudge" | "knockdown";
  /** Stable bounds for touch and Door projection when shader geometry does
   * not describe its visible extent (wide screen-space lines are canonical). */
  projectedLocalBounds?: ProjectedLocalBounds;
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
  const detachesFromMount = physicsDetachOffset !== undefined;
  const detachX = physicsDetachOffset?.[0] ?? 0;
  const detachY = physicsDetachOffset?.[1] ?? 0;
  const detachZ = physicsDetachOffset?.[2] ?? 0;
  const physicsScene = usePhysicsScene();
  const massClass = massClassFor(massKg ?? 1);
  const handling = MASS_HANDLING[massClass];
  const group = useRef<THREE.Group>(null);
  const impulse = useRef<THREE.Group>(null);
  /** The hover nod, on a child of the physics group rather than on the group
   * itself. Deliberate: the outer group's pose is the one the solver reads and
   * writes, and a few degrees of hover tilt held there would keep `settled`
   * false forever, so a prop you were merely POINTING at could never park its
   * body and would hold the shelf's kinematic push open. Inside, the nod is
   * purely visual and the physics pose is untouched. */
  const nod = useRef<THREE.Group>(null);
  const nodAngle = useRef(0);
  const nodCameraDirection = useMemo(() => new THREE.Vector3(), []);
  const nodCameraWorld = useMemo(() => new THREE.Vector3(), []);
  const nodWorld = useMemo(() => new THREE.Vector3(), []);
  const nodParentWorld = useMemo(() => new THREE.Quaternion(), []);
  const impulseWorld = useMemo(() => new THREE.Vector3(), []);
  const impulseLocal = useMemo(() => new THREE.Vector3(), []);
  const impulseWorldQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const impulseWorldScale = useMemo(() => new THREE.Vector3(), []);
  const impulseMotion = useRef(createSceneImpulseMotion());
  const handledSceneImpulse = useRef(getSceneImpulse().revision);
  const hinge = useRef<Hinge | null | undefined>(undefined);
  const still = useMemo(() => reducedMotion(), []);
  const heldFacingQuaternion = useMemo(
    () =>
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          heldFacingRotation?.[0] ?? 0,
          heldFacingRotation?.[1] ?? 0,
          heldFacingRotation?.[2] ?? 0,
        ),
      ),
    [heldFacingRotation],
  );
  const heldParentWorld = useMemo(() => new THREE.Quaternion(), []);
  const heldCameraWorld = useMemo(() => new THREE.Quaternion(), []);
  const heldTarget = useMemo(() => new THREE.Quaternion(), []);
  const faceUpRest = useMemo(() => new THREE.Quaternion(), []);
  /** ADR 0020 band one. Foliage wins before mass is consulted, so a plant
   * resolves here without waiting for the GLB to stream in and be measured —
   * `colliderProfile` is authored, not discovered. Anything that is not a
   * plant keeps the shared nod until the remaining bands land. */
  const archetype = useMemo(
    () => archetypeFor({ colliderProfile, metal, massKg, signature }),
    [colliderProfile, metal, massKg, signature],
  );
  /** How far and how fast this band tips. `tip` resolves to the untouched
   * shared constants, so the majority of the world is the gesture it always
   * was and only the light and heavy ends moved. */
  const bandMotion = useMemo(
    () => bandMotionFor(archetype, massKg),
    [archetype, massKg],
  );
  useEffect(() => {
    recordArchetype({
      id: hoverKey,
      archetype,
      source: "grabbable",
      massKg,
      signature,
    });
  }, [hoverKey, archetype, massKg, signature]);
  const swaySpring = useMemo<SwaySpring>(() => createSwaySpring(), []);
  /** The aim the lean and turn were last pointed at. Held across the release
   * so the spring returns along the path it left by. */
  const swayLean = useRef(0);
  const swaySlide = useRef(0);
  const swayTwist = useRef(0);
  const shade = useRef<THREE.Sprite>(null);
  const phase = useRef<Phase>("rest");
  const velocity = useMemo(() => new THREE.Vector3(), []);
  const step = useMemo(() => new THREE.Vector3(), []);
  const plane = useMemo(() => new THREE.Plane(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const world = useMemo(() => new THREE.Vector3(), []);
  const shadeGround = useMemo(() => new THREE.Vector3(), []);
  const visibilityPoint = useMemo(() => new THREE.Vector3(), []);
  const visibilityMatrix = useMemo(() => new THREE.Matrix4(), []);
  const visibilityFrustum = useMemo(() => new THREE.Frustum(), []);
  const raycaster = useThree((s) => s.raycaster);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const pointerId = useRef<number | null>(null);
  const pickupY = useRef(base[1]);
  /** Legacy fine-pointer taps and the centralized touch controller share the
   * same pending gesture without sharing activation dispatchers. */
  const tapOnly = useRef(false);
  const touchPressedAt = useRef<number | null>(null);
  /** Where the current press started and whether it has travelled far enough
   * to be a carry rather than a click. Null between gestures. */
  const gesture = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const onTapRef = useRef(onTap);
  useEffect(() => {
    onTapRef.current = onTap;
  }, [onTap]);
  const onDragIntentRef = useRef(onDragIntent);
  useEffect(() => {
    onDragIntentRef.current = onDragIntent;
  }, [onDragIntent]);
  const open = useOpenTarget();
  /** The shared record this prop's rigid body hangs off. Null until mount,
   * and bodyless until a world has been built around it. */
  const handle = useRef<ShelfHandle | null>(null);
  /** Whether this carry owns a live solver body. */
  const simulated = useRef(false);
  /** A mounted prop may begin following the pointer while the lazy solver
   * finishes. Release is held at the carried pose until its body exists. */
  const mountedPhysicsPending = useRef(false);
  const pendingMountedRelease = useRef<{
    velocityMultiplier: number;
    velocityCap: number;
  } | null>(null);
  const authoredParked = useRef(false);
  const authoredOffscreenFor = useRef(0);
  const activityUnpin = useRef<(() => void) | null>(null);
  /** Normalised device coords of the carrying pointer. Tracked from the
   * window rather than read off r3f's own pointer state: r3f only updates
   * that while the pointer is over the element it is connected to, so the
   * moment you dragged a prop across the DOM placard the prop froze in mid
   * air until the cursor came back. */
  const ndc = useMemo(() => new THREE.Vector2(), []);

  // Mounted props cannot use the authored fallback, so start their solver
  // load at mount rather than relying only on idle time or hover intent.
  useEffect(() => {
    if (detachesFromMount && physicsEnabled) prewarmGrabbablePhysics();
  }, [detachesFromMount, physicsEnabled]);

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
      colliderProfile,
      massKg,
      restitution,
      maxThrowSpeed,
      plane: standsOn,
      phase,
      physicsEnabled,
      physicsActivation: detachesFromMount ? "detach" : undefined,
      physicsActivated: !detachesFromMount,
    };
    handle.current = entry;
    diagnosticsScope = physicsScene;
    const unregister = physicsScene.registerHandle(entry);
    return () => {
      activityUnpin.current?.();
      activityUnpin.current = null;
      unregister();
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
  const finishDragUi = useCallback(() => {
    const store = useStacks.getState();
    store.setDragging(null);
    const el = store.scrollEl;
    if (el) {
      el.style.touchAction = "pan-x";
      el.style.overflowX = "auto";
    }
  }, []);

  const release = useCallback(
    (velocityMultiplier = 1, velocityCap = Infinity) => {
      pointerId.current = null;
      if (phase.current !== "held") return;
      if (mountedPhysicsPending.current && !simulated.current) {
        pendingMountedRelease.current = { velocityMultiplier, velocityCap };
        finishDragUi();
        return;
      }
      const entry = handle.current;
      velocity.multiplyScalar(handling.throwTilt);
      velocity.multiplyScalar(velocityMultiplier);
      if (velocity.length() > velocityCap) velocity.setLength(velocityCap);
      // Hand the throw to the solver if this gesture had one. The velocity is
      // the prop's ACTUAL movement, not the gap to the cursor — using the gap
      // made it a spring constant rather than a speed, and everything left the
      // hand at the same 1.9 u/s no matter how gently you were moving.
      if (!(simulated.current && entry?.world?.release(entry, velocity)))
        phase.current = "settling";
      simulated.current = false;
      finishDragUi();
    },
    [finishDragUi, handling.throwTilt, velocity],
  );

  const beginCarry = useCallback(
    (event: PointerEvent) => {
      if (phase.current === "held") return;
      const entry = handle.current;
      const g = group.current;
      const mountedActivation =
        !!g && entry?.physicsActivation === "detach" && !entry.physicsActivated;

      const store = useStacks.getState();
      authoredParked.current = false;
      authoredOffscreenFor.current = 0;
      velocity.set(0, 0, 0);
      pickupY.current = g?.position.y ?? base[1];
      track(event);
      simulated.current = false;
      phase.current = "held";
      activityUnpin.current ??= sceneUnitActivityController.pin(
        unitIndex,
        `grabbable:${hoverKey}`,
      );
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

      const abortMountedCarry = () => {
        mountedPhysicsPending.current = false;
        pendingMountedRelease.current = null;
        simulated.current = false;
        if (entry) {
          entry.physicsActivated = false;
          if (entry.world) {
            const activeWorld = entry.world;
            activeWorld.drop(entry);
          }
          g?.position.copy(entry.base);
          g?.quaternion.identity();
        }
        phase.current = "rest";
        activityUnpin.current?.();
        activityUnpin.current = null;
        finishDragUi();
      };

      const activateMountedPhysics = () => {
        if (!physics || !physicsEnabled || !entry || !g) return false;
        entry.physicsActivated = true;
        const preparation = physics.prepareScenePhysics(physicsScene, entry);
        if (preparation.status !== "ready") {
          physicsDiagnosticsController.publish({
            code:
              preparation.reason === "geometry-pending"
                ? "geometry-pending"
                : "authored-fallback",
            handle: entry.key,
            detail: preparation.reason,
          });
          abortMountedCarry();
          return false;
        }
        simulated.current = preparation.world.grab(entry);
        if (!simulated.current) {
          abortMountedCarry();
          return false;
        }
        mountedPhysicsPending.current = false;
        return true;
      };

      // Mounted props have no body at rest. Move the visual clear first, then
      // follow the hand immediately. If the lazy solver is still loading, a
      // release waits at the carried pose rather than entering fallback.
      if (mountedActivation && g && entry) {
        mountedPhysicsPending.current = true;
        g.position.x += detachX;
        g.position.y += detachY;
        g.position.z += detachZ;
        if (physics) {
          activateMountedPhysics();
        } else {
          const requestedEntry = entry;
          void loadGrabbablePhysics().then((loaded) => {
            if (
              handle.current !== requestedEntry ||
              !mountedPhysicsPending.current
            )
              return;
            if (!loaded || !activateMountedPhysics()) {
              abortMountedCarry();
              return;
            }
            const queuedRelease = pendingMountedRelease.current;
            pendingMountedRelease.current = null;
            if (queuedRelease)
              release(
                queuedRelease.velocityMultiplier,
                queuedRelease.velocityCap,
              );
          });
        }
        return;
      }

      let preparedWorld: ScenePhysicsWorld | null = null;
      if (physicsEnabled && physics && entry && g) {
        // The provider supplies every mounted handle and registered static
        // root, independent of the prop's nesting or authored support.
        const preparation = physics.prepareScenePhysics(physicsScene, entry);
        if (preparation.status === "ready") preparedWorld = preparation.world;
        else
          physicsDiagnosticsController.publish({
            code:
              preparation.reason === "geometry-pending"
                ? "geometry-pending"
                : "authored-fallback",
            handle: entry.key,
            detail: preparation.reason,
          });
      } else if (entry)
        physicsDiagnosticsController.publish({
          code: "authored-fallback",
          handle: entry.key,
          detail: physicsEnabled ? "module-loading" : "opted-out",
        });
      if (preparedWorld && entry) simulated.current = preparedWorld.grab(entry);
    },
    [
      base,
      detachX,
      detachY,
      detachZ,
      finishDragUi,
      hoverKey,
      physicsEnabled,
      physicsScene,
      release,
      track,
      unitIndex,
      velocity,
    ],
  );

  const onGrabDown = useCallback(
    (
      event: PointerEvent,
      touchTapOnly: boolean,
      arbitrated = false,
    ): boolean => {
      // Primary button of the primary pointer only — otherwise a right-click
      // starts a carry, and a second pointer's release ends someone else's.
      if (!event.isPrimary || event.button !== 0) return false;
      const store = useStacks.getState();
      // `isPrimary` is per pointer TYPE, so a primary pen and a primary mouse
      // are both primary at once. One prop in hand at a time, always.
      if (store.dragging) return false;
      if (!touchTapOnly && !arbitrated && store.hovered !== hoverKey)
        return false;

      pointerId.current = event.pointerId;
      tapOnly.current = touchTapOnly || !draggable;
      gesture.current = {
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
      // Physics is deliberately NOT armed here. A stationary press belongs to
      // the higher-priority click action; only crossing TAP_PX promotes this
      // pending gesture into a carry and wakes the rigid body.
      return true;
    },
    [draggable, hoverKey],
  );

  const onGrabMove = useCallback(
    (event: PointerEvent) => {
      if (event.pointerId !== pointerId.current) return;
      const current = gesture.current;
      if (
        current &&
        !current.moved &&
        Math.hypot(event.clientX - current.x, event.clientY - current.y) >
          TAP_PX
      ) {
        current.moved = true;
        const g = group.current;
        if (g && onDragIntentRef.current) {
          g.getWorldPosition(world);
          onDragIntentRef.current({ x: world.x, y: world.y, z: world.z });
        }
        if (!tapOnly.current) beginCarry(event);
      }
      if (!tapOnly.current && phase.current === "held") track(event);
    },
    [beginCarry, track, world],
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
            { doorId: hoverKey, unitIndex },
          );
      }
      return true;
    },
    [doorLabel, external, href, hoverKey, open, release, to, unitIndex],
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
    const root = group.current;
    if (!root) return;
    const run = () => {
      if (onTapRef.current) onTapRef.current();
      else if (to !== undefined) open({ to }, { doorId: hoverKey, unitIndex });
      else if (href !== undefined && doorLabel)
        open(
          { href, label: doorLabel, external },
          { doorId: hoverKey, unitIndex },
        );
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
      label: activation && "label" in activation ? activation.label : hoverKey,
      root,
      activeUnits: [unitIndex],
      projectedLocalBounds,
      movable: draggable
        ? { massKg: massKg ?? 1, massClass, colliderProfile }
        : undefined,
      movableController: draggable
        ? {
            press: (event) => {
              prewarmGrabbablePhysics();
              const accepted = onGrabDown(event, false, true);
              touchPressedAt.current = accepted ? performance.now() : null;
              return accepted;
            },
            pickup: (event) => {
              if (event.pointerId === pointerId.current) {
                touchPressedAt.current = null;
                beginCarry(event);
              }
            },
            move: onGrabMove,
            release: (event, multiplier, cap) => {
              if (event.pointerId !== pointerId.current) return;
              touchPressedAt.current = null;
              gesture.current = null;
              tapOnly.current = false;
              release(multiplier, cap);
            },
            cancel: (event) => {
              touchPressedAt.current = null;
              onGrabCancel(event);
            },
          }
        : undefined,
      activation,
      hover: { kind: draggable && tiltOnHover ? "tilt" : "none" },
    });
  }, [
    actionLabel,
    beginCarry,
    colliderProfile,
    doorLabel,
    draggable,
    egg,
    external,
    href,
    hoverKey,
    massClass,
    massKg,
    onGrabCancel,
    onGrabDown,
    onGrabMove,
    onTap,
    open,
    projectedLocalBounds,
    release,
    tiltOnHover,
    to,
    unitIndex,
  ]);

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

  useUnitFrame(({ camera }, rawDelta) => {
    const g = group.current;
    if (!g) return;
    // A backgrounded tab hands back one enormous delta; integrating it would
    // fling the prop to infinity on return.
    const delta = Math.min(rawDelta, 1 / 30);
    const entry = handle.current;
    if (entry) entry.base.set(base[0], base[1], base[2]);
    const shelf: ScenePhysicsWorld | null = entry?.world ?? null;
    // Distant props that are completely back at rest have nothing left to
    // integrate, reset, tilt, or re-ground. Keep the callback subscribed so a
    // debug toggle/active-unit change wakes it immediately, but avoid all of
    // the matrix/frustum/shade work below while its result would be identical.
    const atAuthoredPose =
      Math.abs(g.position.x - base[0]) +
        Math.abs(g.position.y - base[1]) +
        Math.abs(g.position.z - base[2]) +
        Math.abs(g.rotation.x) +
        Math.abs(g.rotation.y) +
        Math.abs(g.rotation.z) <
      1e-4;
    const stacksState = useStacks.getState();
    if (
      shouldSuspendSettledPropFrame({
        settings: scenePerformanceController.getSnapshot(),
        phase: phase.current,
        unitIndex,
        activeUnit: stacksState.activeUnit,
        hovered: propReactionIsEngaged(stacksState, hoverKey),
        authoredParked: authoredParked.current,
        physicsParked: !entry || !!entry.parked,
        atAuthoredPose,
        nodSettled: Math.abs(nodAngle.current) < 1e-4,
      })
    )
      return;

    if (phase.current === "held" && pointerId.current !== null) {
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
        hit.y = THREE.MathUtils.clamp(
          hit.y,
          heldMinRaise === undefined
            ? pickupY.current + handling.minDrop
            : pickupY.current + heldMinRaise,
          pickupY.current + handling.maxRaise,
        );
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
      if (heldFacingRotation) {
        if (g.parent) g.parent.getWorldQuaternion(heldParentWorld);
        else heldParentWorld.identity();
        camera.getWorldQuaternion(heldCameraWorld);
        localCameraFacingQuaternion(
          heldParentWorld,
          heldCameraWorld,
          heldFacingQuaternion,
          heldTarget,
        );
        if (still) g.quaternion.copy(heldTarget);
        else g.quaternion.slerp(heldTarget, 1 - Math.exp(-10 * delta));
      } else {
        g.rotation.z = THREE.MathUtils.damp(
          g.rotation.z,
          tiltWhileHeld ? -velocity.x * 0.05 * handling.throwTilt : 0,
          8,
          delta,
        );
        g.rotation.x = THREE.MathUtils.damp(
          g.rotation.x,
          tiltWhileHeld ? velocity.z * 0.05 * handling.throwTilt : 0,
          8,
          delta,
        );
      }
      if (simulated.current && entry?.world) {
        const result: HeldMoveResult = entry.world.moveHeld(
          entry,
          {
            position: g.position,
            quaternion: g.quaternion,
          } satisfies HeldPose,
          delta,
        );
        velocity.copy(result.acceptedVelocity);
      }
    } else if (phase.current === "held") {
      // Pointer-up can beat the lazy solver on the first mounted carry. Hold
      // the final hand pose until the queued rigid-body release is ready.
    } else if (phase.current === "sim") {
      // The solver owns this transform; the scene frame driver writes it.
    } else if (phase.current === "settling") {
      if (heldFacingRotation)
        g.quaternion.slerp(faceUpRest, 1 - Math.exp(-10 * delta));
      velocity.y -= GRAVITY * delta;
      g.position.addScaledVector(velocity, delta);
      if (!heldFacingRotation) g.rotation.y += velocity.x * spin * delta;
      const surfaceY =
        heldFacingRotation && heldMinRaise !== undefined
          ? base[1] + tiltedFaceClearance(g.quaternion, heldMinRaise)
          : base[1];
      if (g.position.y <= surfaceY) {
        g.position.y = surfaceY;
        velocity.set(0, 0, 0);
        if (surfaceY - base[1] < 1e-3) {
          g.position.y = base[1];
          g.quaternion.identity();
          phase.current = "rest";
          authoredParked.current = true;
          authoredOffscreenFor.current = 0;
        }
      }
    } else {
      const p = g.position;
      if (authoredParked.current) {
        // A genuine solver/module fallback still behaves like a rearranged
        // scene: keep the landed pose while visible, then park it directly.
        g.getWorldPosition(visibilityPoint);
        visibilityFrustum.setFromProjectionMatrix(
          visibilityMatrix.multiplyMatrices(
            camera.projectionMatrix,
            camera.matrixWorldInverse,
          ),
        );
        const margin =
          shadeWidth / 2 +
          camera.getWorldPosition(shadeGround).distanceTo(visibilityPoint) *
            0.15;
        const visible = visibilityFrustum.planes.every(
          (frustumPlane) =>
            frustumPlane.distanceToPoint(visibilityPoint) >= -margin,
        );
        authoredOffscreenFor.current = visible
          ? 0
          : authoredOffscreenFor.current + delta;
        if (authoredOffscreenFor.current >= 1) {
          p.set(base[0], base[1], base[2]);
          g.quaternion.identity();
          authoredParked.current = false;
          authoredOffscreenFor.current = 0;
        }
      } else {
        // Yaw comes home too. The settle spins the prop, and leaving that spin
        // in meant "returns to its authored pose" was only true of position.
        const settled = atAuthoredPose;
        if (settled) {
          p.set(base[0], base[1], base[2]);
          g.rotation.set(0, 0, 0);
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
    }

    const impulseGroup = impulse.current;
    if (impulseGroup) {
      const sceneImpulse = getSceneImpulse();
      if (handledSceneImpulse.current !== sceneImpulse.revision) {
        handledSceneImpulse.current = sceneImpulse.revision;
        g.getWorldPosition(impulseWorld);
        const kick = sceneImpulseKick(sceneImpulse, impulseWorld, hoverKey);
        if (
          sceneImpulseReaction === "knockdown" &&
          Math.abs(kick.x) + Math.abs(kick.y) + Math.abs(kick.z) > 1e-5
        ) {
          const entry = handle.current;
          if (entry) requestSceneImpulseKnockdown(physicsScene, entry, kick);
        } else {
          impulseLocal.set(kick.x, kick.y, kick.z);
          g.getWorldQuaternion(impulseWorldQuaternion).invert();
          impulseLocal.applyQuaternion(impulseWorldQuaternion);
          g.getWorldScale(impulseWorldScale);
          impulseLocal.set(
            impulseLocal.x / Math.max(1e-5, impulseWorldScale.x),
            impulseLocal.y / Math.max(1e-5, impulseWorldScale.y),
            impulseLocal.z / Math.max(1e-5, impulseWorldScale.z),
          );
          applySceneImpulseKick(impulseMotion.current, impulseLocal);
        }
      }
      const motion = stepSceneImpulseMotion(impulseMotion.current, delta);
      impulseGroup.position.set(motion.x, motion.y, motion.z);
      impulseGroup.rotation.set(motion.z * 1.8, 0, -motion.x * 1.8);
    }

    // The hover nod. Same gesture, same curve and same hinge edge as every
    // other prop in the world (see Lift) — a prop you can pick up should not
    // be the one prop that ignores the pointer until you press. Only at REST:
    // a prop in hand already tilts into its direction of travel, and one
    // mid-tumble belongs to the solver.
    const n = nod.current;
    if (n) {
      const interactionState = useStacks.getState();
      const pressed = interactionState.pressedInteraction === hoverKey;
      const focused = interactionState.focusedInteraction === hoverKey;
      const wants =
        phase.current === "rest" &&
        tiltOnHover &&
        propReactionIsEngaged(interactionState, hoverKey) &&
        !still;
      // Sway measures too, but with the furniture cutoff lifted: foliage
      // already won the archetype in `archetypeFor`, and letting size veto it
      // here would silence the monstera and the large plants, whose leaves are
      // the ones that move most. The draggability warning below is still the
      // size rule's job, so it stays keyed to TILT_MAX_SIZE.
      if (wants && hinge.current === undefined) {
        const measured = hingeFor(
          n,
          false,
          archetype === "sway" ? Number.POSITIVE_INFINITY : TILT_MAX_SIZE,
        );
        if (measured) {
          // Sway takes the pivot whatever the reason says. With the cutoff
          // lifted the only reason left is "rig", a light sitting inside the
          // prop's own box, and shelf plants stand close enough to the
          // practical lamps to trip that. A plant is not a lamp; refusing it
          // there would silence exactly the props band one exists for.
          hinge.current =
            archetype === "sway" ? measured : measured.reason ? null : measured;
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
      // ONE gesture for every band. The spring drives an unitless 0-to-1
      // engagement that both rotation channels scale, so a lean and a twist
      // arrive, overshoot and settle as a single motion; the band supplies how
      // far each goes and how bouncy the arrival is. This replaced a pair of
      // exponential damps because the plants' spring was the only one in the
      // world and it read better than everything else. See reactionArchetype.
      if (wants && hinge.current) {
        camera.getWorldPosition(nodCameraWorld);
        n.getWorldPosition(nodWorld);
        nodCameraDirection.copy(nodCameraWorld).sub(nodWorld);
        if (n.parent) {
          n.parent.getWorldQuaternion(nodParentWorld).invert();
          nodCameraDirection.applyQuaternion(nodParentWorld);
        }
        // The aim is held rather than recomputed on the way out, so a prop
        // returns along the path it left by instead of snapping to wherever
        // the camera happens to be as the pointer leaves.
        const aimed =
          hoverTiltAngle === undefined
            ? // A negative band lean is a BACKWARD lean, and the sign has to
              // survive the solver: `cameraSideHoverTilt` refuses a
              // non-positive angle, so the magnitude goes in and the direction
              // comes back out.
              Math.sign(bandMotion.lean) *
              cameraSideHoverTilt(
                nodCameraDirection,
                Math.abs(bandMotion.lean),
              )
            : cameraSideHoverTilt(nodCameraDirection, hoverTiltAngle);
        // A lean is only safe DOWNWARD, where hingeShift pins the contact
        // edge. Nothing was watching the rising end of the arc, and the props
        // that stack have no room there: a book in a horizontal row carries
        // its neighbour flat on its top face with a gap of exactly zero. A
        // blocked lean becomes a pull toward the viewer, which is what the
        // stack's own FLAT_LIFT and the About reading fan each chose by hand.
        const budget = leanBudget(hinge.current, aimed);
        swayLean.current = budget.lean;
        swaySlide.current = cameraSideSlide(nodCameraDirection, budget.slide);
        // A prop trading its lean for a slide is not leaning, so it has no
        // business turning either: the twist is half of the plants' one
        // gesture, not a channel of its own.
        swayTwist.current =
          budget.lean === 0
            ? 0
            : cameraSideSwayTwist(nodCameraDirection, bandMotion.twist);
      }
      const pivot = hinge.current
        ? hingePivotForTilt(hinge.current, swayLean.current || nodAngle.current)
        : null;
      stepSway(
        swaySpring,
        wants ? 1 : 0,
        delta,
        bandMotion.stiffness,
        bandMotion.damping,
      );
      n.rotation.x = swaySpring.angle * swayLean.current;
      n.rotation.y = swaySpring.angle * swayTwist.current;
      nodAngle.current = n.rotation.x;
      const targetScale = pressed ? 0.965 : focused ? 1.015 : 1;
      const scale = pressed
        ? targetScale
        : THREE.MathUtils.damp(n.scale.x, targetScale, LIFT_LAMBDA, delta);
      n.scale.setScalar(scale);
      if (pivot) n.position.copy(hingeShift(pivot, n.rotation, undefined));
      else n.position.set(0, 0, 0);
      // Rides the SAME spring as the lean it replaced, so a book pulled out of
      // a stack overshoots and settles exactly as its neighbour standing in
      // the open tips and settles. One gesture, two possible directions.
      n.position.z += swaySpring.angle * swaySlide.current;
      if (pressed && touchPressedAt.current !== null) {
        const loaded = THREE.MathUtils.clamp(
          (performance.now() - touchPressedAt.current - 180) / 170,
          0,
          1,
        );
        n.position.y += loaded * 0.03;
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
      let surfaceY = base[1];
      if (g.position.y < base[1] - 0.01 && g.parent) {
        g.getWorldPosition(shadeGround);
        shadeGround.y = SHELF_GEOMETRY.groundY;
        g.parent.worldToLocal(shadeGround);
        surfaceY = shadeGround.y;
      }
      const lift = Math.max(0, g.position.y - surfaceY);
      const spreadT = Math.min(1, lift / 0.45);
      s.position.set(g.position.x, surfaceY + 0.02, g.position.z + 0.02);
      const w = shadeWidth * (1 + spreadT * 0.7);
      s.scale.set(w, w * 0.32, 1);
      s.material.opacity = SHADE_OPACITY * (1 - 0.65 * spreadT);
    }
    if (phase.current === "rest" && !authoredParked.current && atAuthoredPose) {
      if (
        entry?.physicsActivation === "detach" &&
        entry.physicsActivated &&
        entry.parked &&
        entry.world
      ) {
        const activeWorld = entry.world;
        entry.physicsActivated = false;
        activeWorld.drop(entry);
      }
      activityUnpin.current?.();
      activityUnpin.current = null;
    }
  }, "maintenance");

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
          event.stopPropagation();
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
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
        <group ref={impulse} name={`impulse:${hoverKey}`}>
          <group ref={nod} name={`nod:${hoverKey}`}>
            {children}
          </group>
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
