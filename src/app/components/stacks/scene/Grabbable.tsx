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
import {
  LONG_HAUL_CARRY_UNITS,
  recordFieldNoteEvent,
} from "../fieldNotes/progress";
import {
  ARTIFACT_PREVIEW_CROSSFADE_START,
  ARTIFACT_PREVIEW_DURATION_MS,
  ARTIFACT_PREVIEW_SOURCE_IN_END,
  ARTIFACT_PREVIEW_SOURCE_IN_START,
  ARTIFACT_PREVIEW_SOURCE_OUT_END,
  ARTIFACT_PREVIEW_SOURCE_OUT_START,
  artifactPreviewEase,
  artifactPreviewPhysicalTravel,
  artifactPreviewRamp,
} from "../modal/artifactPreviewMotion";
import {
  type ArtifactPreviewTargetCorrection,
  IDENTITY_ARTIFACT_PREVIEW_TARGET_CORRECTION,
  nextArtifactPreviewTargetCorrection,
} from "../modal/artifactPreviewTargetCorrection";
import {
  openSceneArtifact,
  stageSceneArtifactPreviewReturnOrigin,
} from "../sceneArtifactState";
import { type SceneArtifactId, sceneArtifactById } from "../sceneArtifacts";
import { useStacks } from "../store";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import * as THREE from "three";

import { poolTexture } from "./GroundPool";
import { LIFT_LAMBDA, hingeShift } from "./Lift";
import { pointerOutLeavesInteraction } from "./hoverOwnership";
import {
  type PhysicsSceneScope,
  usePhysicsScene,
} from "./PhysicsSceneProvider";
import { artifactFaceCameraFrame } from "./artifactFacePose";
import { SceneArtifactIdContext } from "./artifactPreviewFrames";
import { registerHittableBall, tapHittableBall } from "./golf/hittableBalls";
import { grabbablePhysicsEnabled } from "./grabbablePhysics";
import {
  heldDepthBounds,
  heldDepthFromPinch,
  heldDepthWheelPixels,
  nextHeldDepth,
} from "./heldDepth";
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
import { artifactFaceBasis } from "./interactionProjection";
import {
  MASS_HANDLING,
  type ProjectedLocalBounds,
  destinationFor,
  massClassFor,
  projectSceneInteractionRect,
  registerSceneInteraction,
  runSceneInteractionActivation,
} from "./interactionRegistry";
import { leanBudget } from "./leanClearance";
import { type PropDestination, useOpenTarget } from "./links";
import { modelArtifactDiagnosticsController } from "./modelArtifactDiagnostics";
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
import { propReactionIsEngaged } from "./reactionEngagement";
import {
  applySceneImpulseKick,
  createSceneImpulseMotion,
  getSceneImpulse,
  sceneImpulseKick,
  stepSceneImpulseMotion,
} from "./sceneImpulse";
import {
  type SceneLayoutOverride,
  sceneLayoutEditorController,
} from "./sceneLayoutEditor";
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
const ARTIFACT_HANDOFF_LAMBDA = 7.5;
const ARTIFACT_CROSSFADE_LAMBDA = 10;
const ARTIFACT_CROSSFADE_TRAVEL = 0.68;
/** Matches ContactShade's default so a grabbable prop grounds exactly like
 * its neighbours until the moment it is picked up. */
const SHADE_OPACITY = 0.12;
/** How much the layout editor's selected prop darkens and widens its own
 * contact shadow — the whole of its "this one" state.
 *
 * Both are set off the render, not derived. 3x was legible on the light plank
 * and nearly gone on the dark one, where the shadow is a dark tint on dark
 * wood; 4x carries both and is still a shadow rather than a stain. The width
 * does the other half of the work: opacity alone on a narrow footprint reads
 * as the prop sitting in a slightly darker patch, where a footprint that also
 * grows reads as deliberate. Checked at both extremes on this shelf — a
 * 0.30-wide bag and a 0.13-wide MiO bottle. */
const SELECTED_SHADE_OPACITY = 4;
const SELECTED_SHADE_WIDTH = 1.18;
/** Pointer travel, in screen pixels, above which a press is a CARRY rather
 * than a click. The same 6 that r3f's own `event.delta` gate uses, so a prop
 * that is both a handle and a portal answers a tap exactly as its neighbours do. */
const TAP_PX = 6;
/** Deliberately under real gravity: a prop dropped 20cm at 9.81 lands in
 * under a fifth of a second, which reads as a glitch rather than a drop.
 * physics.ts carries the same number so both paths fall alike. */
const GRAVITY = 9.81;

type ArtifactMaterialState = Readonly<{
  material: THREE.Material;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}>;

function captureArtifactMaterials(root: THREE.Object3D) {
  const captured: ArtifactMaterialState[] = [];
  const seen = new Set<THREE.Material>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.material) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      if (seen.has(material)) continue;
      seen.add(material);
      captured.push({
        material,
        opacity: material.opacity,
        transparent: material.transparent,
        depthWrite: material.depthWrite,
      });
    }
  });
  return captured;
}

function setArtifactOpacity(
  captured: readonly ArtifactMaterialState[],
  opacity: number,
) {
  for (const original of captured) {
    const transparent = original.transparent || opacity < 0.999;
    if (original.material.transparent !== transparent) {
      original.material.transparent = transparent;
      original.material.needsUpdate = true;
    }
    original.material.opacity = original.opacity * opacity;
    original.material.depthWrite = original.depthWrite && opacity > 0.98;
  }
}

function restoreArtifactMaterials(captured: readonly ArtifactMaterialState[]) {
  for (const original of captured) {
    original.material.opacity = original.opacity;
    original.material.transparent = original.transparent;
    original.material.depthWrite = original.depthWrite;
    original.material.needsUpdate = true;
  }
}

const faceRootInverse = new THREE.Matrix4();
const faceChildToRoot = new THREE.Matrix4();
const faceCorner = new THREE.Vector3();
const faceBounds = new THREE.Box3();

/** The subtree's bounds in the root's OWN frame, written to `size` in local
 * units. This is the face the artifact shows once it turns camera-facing at
 * the preview target; the world AABB of the tilted rest pose is bigger.
 * Skips the same nodes the interaction projection skips, so the size agrees
 * with the sourceBounds the preview measured. Leaves `size` zeroed when no
 * geometry is found. */
function measureArtifactFaceSize(root: THREE.Object3D, size: THREE.Vector3) {
  faceRootInverse.copy(root.matrixWorld).invert();
  faceBounds.makeEmpty();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (
      !mesh.geometry ||
      !node.visible ||
      (node.userData as { physicsIgnore?: boolean }).physicsIgnore === true
    )
      return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    if (!box || box.isEmpty()) return;
    faceChildToRoot.multiplyMatrices(faceRootInverse, node.matrixWorld);
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z])
          faceBounds.expandByPoint(
            faceCorner.set(x, y, z).applyMatrix4(faceChildToRoot),
          );
  });
  if (faceBounds.isEmpty()) size.set(0, 0, 0);
  else faceBounds.getSize(size);
}

let modelArtifactPreviewWarmup: Promise<unknown> | null = null;

function prewarmModelArtifactPreview(artwork: string) {
  if (
    !modelArtifactDiagnosticsController.getSnapshot().rendererEnabled ||
    typeof window === "undefined"
  )
    return;
  modelArtifactPreviewWarmup ??= import("../modal/ModelArtifactStage");
  const image = new window.Image();
  image.src = artwork;
}

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

/** A prop the golf bay has hidden sits on this layer: off every raycaster
 * and off the camera until it shows again. */
const BAY_HIDDEN_LAYER = 31;

/** The golf bay striking a loose ball. Same solver handshake as the
 * knockdown above, but the velocity goes through untouched: the bay has
 * already sized it for the ball. */
function requestSceneStrike(
  scope: PhysicsSceneScope,
  entry: ShelfHandle,
  worldVelocity: THREE.Vector3,
  fallback: (worldVelocity: THREE.Vector3) => void,
) {
  const velocity = worldVelocity.clone();
  let finished = false;
  const launchFallback = () => {
    if (finished || !entry.group.parent || entry.phase.current === "held")
      return;
    finished = true;
    fallback(velocity);
  };
  void loadGrabbablePhysics().then((loaded) => {
    if (!loaded) {
      launchFallback();
      return;
    }
    const attempt = (remaining: number) => {
      if (finished || !entry.group.parent || entry.phase.current === "held")
        return;
      const prepared = loaded.prepareScenePhysics(scope, entry);
      if (prepared.status === "ready") {
        finished = prepared.world.strike(entry, velocity);
        if (!finished) launchFallback();
        return;
      }
      if (prepared.reason !== "geometry-pending" || remaining <= 0) {
        launchFallback();
        return;
      }
      requestAnimationFrame(() => attempt(remaining - 1));
    };
    attempt(12);
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
  layoutLabel,
  base: authoredBase,
  physicsDetachOffset,
  shadeWidth = 0.5,
  shadeColor,
  tiltOnHover = true,
  metal = false,
  signature,
  hoverTiltAngle,
  hoverLift = 0,
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
  portalLabel,
  portalDetail,
  actionLabel,
  artifact,
  activateOnFirstTouch = false,
  external = true,
  onTap,
  onHoverIntent,
  hittable,
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
  /** Optional friendly name for the development layout editor. Every
   * Grabbable registers automatically; the hover key is humanized otherwise. */
  layoutLabel?: string;
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
  /** Raise the prop while its hover tilt opens. This is for loose, face-up
   * objects that need to clear the surface around them instead of trading a
   * blocked tilt for the shared forward slide. */
  hoverLift?: number;
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
   * between being a handle and being a portal: a press that never MOVED is a
   * click and opens this, a press that moved is a carry. Same 6px gate r3f's
   * own `event.delta` uses, and the same destinations PropLink offers — the
   * two wrappers were the reason a shelf full of similar objects behaved
   * three different ways depending on which one you reached for. */
  to?: PropDestination;
  href?: string;
  /** Required outcome copy for arbitrary URLs or local-action Portals. Route
   * destinations inherit their exact copy from the destination table. */
  portalLabel?: string;
  /** Optional lines under the Portal Label's title, for what the object stands
   * for (a role, a year) rather than where it goes. One string per line. */
  portalDetail?: string | readonly string[];
  actionLabel?: string;
  /** Inspectable scene object. The catalog owns its identity, caption, touch
   * policy, reader media, and outbound actions. Mutually exclusive with
   * `to`, `href`, `onTap`, and `egg`. */
  artifact?: SceneArtifactId;
  /** Run a stationary coarse-pointer tap immediately instead of requiring a
   * focus tap first. Use for anchored controls whose only job is activation. */
  activateOnFirstTouch?: boolean;
  external?: boolean;
  /** Local action for a press that never became a carry. Stateful objects
   * such as featured covers use this instead of pretending to be a route. */
  onTap?: () => void;
  /** Start optional data work when a fine pointer expresses intent. */
  onHoverIntent?: () => void;
  /** A ball the golf club can strike once it is carried into the bay and
   * left still. The radius is the ball's, in world units; the carrier origin
   * is its bottom. A tap on the ball asks the bay first and falls through to
   * the ordinary activation only if the bay declines. */
  hittable?: {
    radius: number;
    contactHeight?: number;
    golf?: boolean;
    /** Golf bay that may claim this prop. Defaults to its home unit. A prop
     * carried across the room can opt into another unit's authored bay. */
    bayUnitIndex?: number;
  };
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
  /** Stable bounds for touch and Portal projection when shader geometry does
   * not describe its visible extent (wide screen-space lines are canonical). */
  projectedLocalBounds?: ProjectedLocalBounds;
  /** Marks onTap as a quiet easter egg rather than a Portal. */
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
  const artifactEntry = artifact ? sceneArtifactById(artifact) : null;
  const detachesFromMount = physicsDetachOffset !== undefined;
  const detachX = physicsDetachOffset?.[0] ?? 0;
  const detachY = physicsDetachOffset?.[1] ?? 0;
  const detachZ = physicsDetachOffset?.[2] ?? 0;
  // Registration always reports the AUTHORED numbers, so the editor's
  // deltas stay measured against the source no matter how many times a prop
  // has been moved this session.
  const layoutBaseX = authoredBase[0];
  const layoutBaseY = authoredBase[1];
  const layoutBaseZ = authoredBase[2];
  // ...while everything below reads the resting pose the layout editor left
  // behind, which OUTLIVES free roam. Leaving the editor used to snap every
  // moved prop back to its authored spot, so the one thing the tool is for --
  // looking at a new arrangement in the ordinary docked view -- was the one
  // thing it could not do. A reload still clears the override; the authored
  // source is still the only layout that survives one.
  const layoutOverride = useSceneLayoutOverride(hoverKey);
  // Memoised only so the conditional cannot widen what the callbacks below
  // depend on. The identity still changes exactly as often as it did when
  // this was the raw prop, since most callers pass an array literal.
  const base = useMemo<[number, number, number]>(
    () =>
      layoutOverride
        ? [
            layoutOverride.position[0],
            layoutOverride.position[1],
            layoutOverride.position[2],
          ]
        : authoredBase,
    [authoredBase, layoutOverride],
  );
  const restRotationX = layoutOverride?.rotation[0] ?? 0;
  const restRotationY = layoutOverride?.rotation[1] ?? 0;
  const restRotationZ = layoutOverride?.rotation[2] ?? 0;
  const restScale = layoutOverride?.scale ?? 1;
  const physicsScene = usePhysicsScene();
  const hittableRadius = hittable?.radius;
  const hittableContactHeight = hittable?.contactHeight ?? hittableRadius;
  const hittableGolf = hittable?.golf === true;
  const hittableBayUnitIndex = hittable?.bayUnitIndex ?? unitIndex;
  const massClass = massClassFor(massKg ?? 1);
  const handling = MASS_HANDLING[massClass];
  const group = useRef<THREE.Group>(null);
  const artifactHandoffId = useRef<SceneArtifactId | null>(null);
  const artifactHandoffTravel = useRef(0);
  const artifactHandoffTravelGoal = useRef(0);
  const artifactHandoffTravelStart = useRef(0);
  const artifactHandoffTravelElapsed = useRef(0);
  const artifactHandoffOpacity = useRef(1);
  const artifactTargetCorrection = useRef<ArtifactPreviewTargetCorrection>(
    IDENTITY_ARTIFACT_PREVIEW_TARGET_CORRECTION,
  );
  const artifactHandoffStartPosition = useMemo(() => new THREE.Vector3(), []);
  const artifactHandoffStartQuaternion = useMemo(
    () => new THREE.Quaternion(),
    [],
  );
  const artifactHandoffStartScale = useMemo(
    () => new THREE.Vector3(1, 1, 1),
    [],
  );
  const artifactHandoffLocalCenter = useMemo(() => new THREE.Vector3(), []);
  const artifactHandoffWorldScale = useMemo(
    () => new THREE.Vector3(1, 1, 1),
    [],
  );
  const artifactHandoffWorldSize = useMemo(() => new THREE.Vector3(), []);
  const artifactHandoffBounds = useMemo(() => new THREE.Box3(), []);
  const artifactHandoffMaterials = useRef<ArtifactMaterialState[]>([]);
  const artifactTargetNdc = useMemo(() => new THREE.Vector3(), []);
  const artifactCameraPosition = useMemo(() => new THREE.Vector3(), []);
  const artifactCameraDirection = useMemo(() => new THREE.Vector3(), []);
  const artifactCameraUp = useMemo(() => new THREE.Vector3(), []);
  const artifactCameraRight = useMemo(() => new THREE.Vector3(), []);
  const artifactTargetWorldPosition = useMemo(() => new THREE.Vector3(), []);
  const artifactTargetLocalPosition = useMemo(() => new THREE.Vector3(), []);
  const artifactCenterOffset = useMemo(() => new THREE.Vector3(), []);
  const artifactArcLocal = useMemo(() => new THREE.Vector3(), []);
  const artifactCameraQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const artifactRelativeQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const artifactTargetWorldQuaternion = useMemo(
    () => new THREE.Quaternion(),
    [],
  );
  const artifactTargetLocalQuaternion = useMemo(
    () => new THREE.Quaternion(),
    [],
  );
  const artifactTargetLocalScale = useMemo(
    () => new THREE.Vector3(1, 1, 1),
    [],
  );
  const artifactParentWorldQuaternion = useMemo(
    () => new THREE.Quaternion(),
    [],
  );
  /** gWorld_target = camera x relative x THIS. Identity for a model; for a
   * print it is the inverse of the face's orientation within the group, so
   * the FACE arrives camera-facing even when the flat/pinned pose that
   * tilted it is authored on children inside the group. Recomputed every
   * frame because the hover tilt keeps decaying inside the group mid-flight. */
  const artifactHandoffFaceCounter = useMemo(() => new THREE.Quaternion(), []);
  const artifactFaceMatrix = useMemo(() => new THREE.Matrix4(), []);
  const artifactFaceQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const artifactGroupWorldQuaternion = useMemo(
    () => new THREE.Quaternion(),
    [],
  );
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
  useEffect(
    () => () => restoreArtifactMaterials(artifactHandoffMaterials.current),
    [],
  );
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
  const cameraForward = useMemo(() => new THREE.Vector3(), []);
  const heldPlanePoint = useMemo(() => new THREE.Vector3(), []);
  const shadeGround = useMemo(() => new THREE.Vector3(), []);
  const visibilityPoint = useMemo(() => new THREE.Vector3(), []);
  const visibilityMatrix = useMemo(() => new THREE.Matrix4(), []);
  const visibilityFrustum = useMemo(() => new THREE.Frustum(), []);
  const raycaster = useThree((s) => s.raycaster);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const pointerId = useRef<number | null>(null);
  const pickupY = useRef(base[1]);
  /** Distance the prop has actually moved during the current hold. Long Haul
   * reports once when a single hold crosses the marathon threshold. */
  const carryDistance = useRef(0);
  const carryFarSent = useRef(false);
  const heldDepth = useRef(0);
  const heldDepthRange = useRef(heldDepthBounds(0));
  const pinchStartDepth = useRef(0);
  const pinchStartSpan = useRef(0);
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
  /** Local support height for a solver-independent golf strike. A hit must
   * still launch if the lazy physics module or the asset collider misses its
   * impact-frame deadline. */
  const authoredStrikeFloorY = useRef<number | null>(null);
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

  const captureHeldDepth = useCallback(() => {
    const g = group.current;
    if (!g) return;
    camera.getWorldDirection(cameraForward);
    g.getWorldPosition(world);
    heldDepth.current = Math.max(
      camera.near * 2,
      world.sub(camera.position).dot(cameraForward),
    );
    heldDepthRange.current = heldDepthBounds(heldDepth.current);
  }, [camera, cameraForward, world]);

  const startDepthGesture = useCallback((spanPx: number) => {
    if (phase.current !== "held") return;
    pinchStartDepth.current = heldDepth.current;
    pinchStartSpan.current = spanPx;
  }, []);

  const moveDepthGesture = useCallback((spanPx: number) => {
    if (phase.current !== "held" || pinchStartSpan.current <= 0) return;
    heldDepth.current = heldDepthFromPinch(
      pinchStartDepth.current,
      pinchStartSpan.current,
      spanPx,
      heldDepthRange.current,
    );
  }, []);

  const endDepthGesture = useCallback(() => {
    pinchStartSpan.current = 0;
  }, []);

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

  // Balls the golf bay may strike. Registered after the handle exists so the
  // bay reads the same carrier the solver writes.
  useEffect(() => {
    if (hittableRadius === undefined) return;
    const entry = handle.current;
    if (!entry) return;
    return registerHittableBall({
      key: hoverKey,
      unitIndex: hittableBayUnitIndex,
      radius: hittableRadius,
      contactHeight: hittableContactHeight ?? hittableRadius,
      massKg: massKg ?? 0.2,
      bottom: (out) => entry.group.getWorldPosition(out),
      still: () =>
        entry.group.visible &&
        (entry.phase.current === "rest" ||
          (entry.phase.current === "sim" &&
            !!entry.body &&
            entry.body.velocity.lengthSquared() < 0.0025)),
      strike: (worldVelocity) =>
        requestSceneStrike(physicsScene, entry, worldVelocity, (launch) => {
          const parent = entry.group.parent;
          if (!parent) return;
          const parentRotation = parent.getWorldQuaternion(
            new THREE.Quaternion(),
          );
          velocity.copy(launch).applyQuaternion(parentRotation.invert());
          const floor = entry.group.getWorldPosition(new THREE.Vector3());
          floor.y = SHELF_GEOMETRY.groundY;
          parent.worldToLocal(floor);
          authoredStrikeFloorY.current = floor.y;
          authoredParked.current = false;
          phase.current = "settling";
        }),
      golf: hittableGolf,
      // Hidden while a ghost flies its shot. Parked home first so the prop
      // is where the shot's reset expects it when it shows again. The shade
      // is a sibling sprite, not a child, so it is hidden by hand.
      // Neither raycaster (r3f's or the gesture dispatcher's) skips an
      // invisible object, so the subtree also leaves layer 0 while hidden:
      // no hover, no tap, no render, until the ghost resets.
      hide: () => {
        entry.world?.park(entry, true);
        entry.group.visible = false;
        entry.group.traverse((node) => node.layers.set(BAY_HIDDEN_LAYER));
        if (shade.current) shade.current.visible = false;
      },
      show: () => {
        entry.world?.park(entry, true);
        entry.group.traverse((node) => node.layers.set(0));
        entry.group.visible = true;
        if (shade.current) shade.current.visible = true;
      },
    });
  }, [
    hittableContactHeight,
    hittableGolf,
    hittableBayUnitIndex,
    hittableRadius,
    hoverKey,
    massKg,
    physicsScene,
    velocity,
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
      endDepthGesture();
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
    [endDepthGesture, finishDragUi, handling.throwTilt, velocity],
  );

  const beginCarry = useCallback(
    (event: PointerEvent) => {
      if (phase.current === "held") return;
      const entry = handle.current;
      const g = group.current;
      const mountedActivation =
        !!g && entry?.physicsActivation === "detach" && !entry.physicsActivated;

      const store = useStacks.getState();
      if (store.visionRidePhase !== "idle") return;
      authoredParked.current = false;
      authoredOffscreenFor.current = 0;
      velocity.set(0, 0, 0);
      carryDistance.current = 0;
      carryFarSent.current = false;
      pickupY.current = g?.position.y ?? base[1];
      track(event);
      simulated.current = false;
      phase.current = "held";
      activityUnpin.current ??= sceneUnitActivityController.pin(
        unitIndex,
        `grabbable:${hoverKey}`,
      );
      store.setDragging(hoverKey);
      recordFieldNoteEvent({
        type: "prop-carried",
        propId: hoverKey,
        unitIndex,
        massKg: massKg ?? 1,
      });
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
        captureHeldDepth();
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

      captureHeldDepth();

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
      captureHeldDepth,
      detachX,
      detachY,
      detachZ,
      finishDragUi,
      hoverKey,
      massKg,
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
      if (sceneLayoutEditorController.canSelect(hoverKey)) {
        sceneLayoutEditorController.select(hoverKey);
        return false;
      }
      if (sceneLayoutEditorController.owns(hoverKey)) return false;
      // Primary button of the primary pointer only — otherwise a right-click
      // starts a carry, and a second pointer's release ends someone else's.
      if (!event.isPrimary || event.button !== 0) return false;
      const store = useStacks.getState();
      if (store.visionRidePhase !== "idle") return false;
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

  const runStationaryActivation = useCallback(() => {
    if (sceneLayoutEditorController.owns(hoverKey)) return;
    if (hittableRadius !== undefined && tapHittableBall(hoverKey)) return;
    if (artifact) {
      // A flat print can be substantially lifted by its hover spring when the
      // click origin is captured. Closing should land on the shelf, not return
      // to that transient hover pose and then perform a second drop. Project
      // the same subtree once with only the visual nod reset; restore it before
      // this event returns, so no rendered frame sees the temporary pose.
      const n = nod.current;
      if (n) {
        const position = n.position.clone();
        const quaternion = n.quaternion.clone();
        const scale = n.scale.clone();
        n.position.set(0, 0, 0);
        n.quaternion.identity();
        n.scale.setScalar(1);
        n.updateWorldMatrix(true, true);
        const settled = projectSceneInteractionRect(
          artifactEntry?.interactionId ?? hoverKey,
        );
        if (settled) stageSceneArtifactPreviewReturnOrigin(artifact, settled);
        n.position.copy(position);
        n.quaternion.copy(quaternion);
        n.scale.copy(scale);
        n.updateWorldMatrix(true, true);
      }
      openSceneArtifact(artifact);
    } else if (onTapRef.current) onTapRef.current();
    else if (to !== undefined) open({ to }, { portalId: hoverKey, unitIndex });
    else if (href !== undefined)
      open(
        { href, label: portalLabel ?? "Open link", external },
        { portalId: hoverKey, unitIndex },
      );
  }, [
    artifact,
    artifactEntry,
    portalLabel,
    external,
    hittableRadius,
    href,
    hoverKey,
    open,
    to,
    unitIndex,
  ]);

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
      //
      // The registry only answers for a REGISTERED activation (portal, action,
      // egg, artifact). A bare movable — a golf ball, a can carried into the
      // bay — registers none: its whole tap behaviour is the `hittable`
      // fall-through inside runStationaryActivation, so a registry miss must
      // fall back there or teed balls stop answering taps.
      if (tapped) {
        recordTap(hoverKey);
        if (!runSceneInteractionActivation(hoverKey)) runStationaryActivation();
      }
      return true;
    },
    [hoverKey, release, runStationaryActivation],
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

  const onGrabWheel = useCallback(
    (event: WheelEvent) => {
      if (phase.current !== "held") return;
      // The placard is a real scroll container sitting over the scene, and
      // carrying a prop is no reason to freeze someone's reading. Only claim
      // the wheel when it is aimed at the world.
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-stacks-scrollable]")
      )
        return;
      event.preventDefault();
      // Capture-phase on window runs before drei's scroll-element handler.
      event.stopPropagation();
      heldDepth.current = nextHeldDepth(
        heldDepth.current,
        heldDepthWheelPixels(
          event.deltaY,
          event.deltaMode,
          gl.domElement.clientHeight || window.innerHeight,
        ),
        heldDepthRange.current,
      );
    },
    [gl],
  );

  useEffect(() => {
    const root = group.current;
    if (!root) return;
    const activation = artifactEntry
      ? ({
          kind: "artifact",
          label: artifactEntry.title,
          run: runStationaryActivation,
        } as const)
      : egg
        ? ({
            kind: "egg",
            run: runStationaryActivation,
            reducedMotion: egg.reducedMotion,
          } as const)
        : to !== undefined
          ? ({
              kind: "portal",
              ...destinationFor(to),
              run: runStationaryActivation,
            } as const)
          : href !== undefined && portalLabel
            ? ({
                kind: "portal",
                label: portalLabel,
                detail:
                  portalDetail === undefined
                    ? undefined
                    : typeof portalDetail === "string"
                      ? [portalDetail]
                      : portalDetail,
                href,
                external,
                run: runStationaryActivation,
              } as const)
            : onTap !== undefined && (actionLabel ?? portalLabel)
              ? ({
                  kind: "action",
                  label: actionLabel ?? portalLabel!,
                  title: actionLabel && portalLabel ? portalLabel : undefined,
                  detail:
                    portalDetail === undefined
                      ? undefined
                      : typeof portalDetail === "string"
                        ? [portalDetail]
                        : portalDetail,
                  run: runStationaryActivation,
                } as const)
              : undefined;
    return registerSceneInteraction({
      id: hoverKey,
      label: activation && "label" in activation ? activation.label : hoverKey,
      root,
      activeUnits: [unitIndex],
      activateOnFirstTouch: Boolean(artifactEntry) || activateOnFirstTouch,
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
            startDepthGesture,
            moveDepthGesture,
            endDepthGesture,
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
      hover: { kind: tiltOnHover ? "tilt" : "none" },
    });
  }, [
    activateOnFirstTouch,
    actionLabel,
    artifact,
    artifactEntry,
    beginCarry,
    colliderProfile,
    portalDetail,
    portalLabel,
    draggable,
    egg,
    external,
    href,
    hoverKey,
    massClass,
    massKg,
    moveDepthGesture,
    onGrabCancel,
    onGrabDown,
    onGrabMove,
    onTap,
    projectedLocalBounds,
    release,
    startDepthGesture,
    endDepthGesture,
    runStationaryActivation,
    tiltOnHover,
    to,
    unitIndex,
  ]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const root = group.current;
    if (!root) return;
    return sceneLayoutEditorController.register({
      id: hoverKey,
      label: layoutLabel ?? defaultLayoutEditorLabel(hoverKey, unitIndex),
      unitIndex,
      authored: [layoutBaseX, layoutBaseY, layoutBaseZ],
      authoredRotation: [0, 0, 0],
      authoredScale: [1, 1, 1],
      root,
      cancelInteraction: () => {
        onGrabCancel();
      },
    });
  }, [
    hoverKey,
    layoutBaseX,
    layoutBaseY,
    layoutBaseZ,
    layoutLabel,
    onGrabCancel,
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
    const layoutPosition =
      process.env.NODE_ENV === "development"
        ? sceneLayoutEditorController.positionFor(hoverKey)
        : null;
    const layoutRotation =
      process.env.NODE_ENV === "development"
        ? sceneLayoutEditorController.rotationFor(hoverKey)
        : null;
    const layoutScale =
      process.env.NODE_ENV === "development"
        ? sceneLayoutEditorController.scaleFor(hoverKey)
        : null;
    if (layoutPosition) {
      if (entry?.world) entry.world.drop(entry);
      simulated.current = false;
      mountedPhysicsPending.current = false;
      pendingMountedRelease.current = null;
      phase.current = "rest";
      velocity.set(0, 0, 0);
      g.position.fromArray(layoutPosition);
      g.rotation.set(
        layoutRotation?.[0] ?? 0,
        layoutRotation?.[1] ?? 0,
        layoutRotation?.[2] ?? 0,
      );
      g.scale.setScalar(layoutScale ?? 1);
      const n = nod.current;
      if (n) {
        n.position.set(0, 0, 0);
        n.rotation.set(0, 0, 0);
        n.scale.setScalar(1);
      }
      const s = shade.current;
      if (s) {
        const lift = Math.max(0, g.position.y - base[1]);
        const spreadT = Math.min(1, lift / 0.45);
        s.position.set(g.position.x, base[1] + 0.02, g.position.z + 0.02);
        // The selection's "this one" cue, and it lives HERE for two reasons.
        //
        // It has to be in this branch: `owns()` is true the moment a prop is
        // selected, so a selected prop takes this branch and RETURNS before
        // any reaction code runs. Routing the cue through `hovered` or
        // `focusedInteraction` shows nothing, because by the time either could
        // matter the callback has already left — measured on the page, after
        // selecting a prop `propReactionIsEngaged` was never called for it
        // again. Free roam suppressing reactions wholesale is a second wall
        // behind that one, and this placement clears both.
        //
        // And it is the SHADE rather than the prop, which is the whole point:
        // this tool edits position, rotation and scale, so a cue written into
        // any of the three is a value that disagrees with the gizmo and with
        // the exported record. A footprint is the one channel it does not
        // edit. Brightness only, never a tint — the sprite takes `shadeColor`
        // from the unit palette, and a selection that shifts hue would put a
        // colour in the room that the room does not have.
        const selected =
          sceneLayoutEditorController.getSnapshot().selectedId === hoverKey;
        const width =
          shadeWidth *
          (1 + spreadT * 0.7) *
          (selected ? SELECTED_SHADE_WIDTH : 1);
        s.scale.set(width, width * 0.32, 1);
        s.material.opacity =
          SHADE_OPACITY *
          (selected ? SELECTED_SHADE_OPACITY : 1) *
          (1 - 0.65 * spreadT);
      }
      g.updateWorldMatrix(true, true);
      return;
    }
    const shelf: ScenePhysicsWorld | null = entry?.world ?? null;
    // Distant props that are completely back at rest have nothing left to
    // integrate, reset, tilt, or re-ground. Keep the callback subscribed so a
    // debug toggle/active-unit change wakes it immediately, but avoid all of
    // the matrix/frustum/shade work below while its result would be identical.
    const atAuthoredPose =
      Math.abs(g.position.x - base[0]) +
        Math.abs(g.position.y - base[1]) +
        Math.abs(g.position.z - base[2]) +
        Math.abs(g.rotation.x - restRotationX) +
        Math.abs(g.rotation.y - restRotationY) +
        Math.abs(g.rotation.z - restRotationZ) <
      1e-4;
    const stacksState = useStacks.getState();
    const artifactHandoff =
      artifactEntry && stacksState.modelArtifactHandoff?.artifactId === artifact
        ? stacksState.modelArtifactHandoff
        : null;
    if (
      shouldSuspendSettledPropFrame({
        settings: scenePerformanceController.getSnapshot(),
        phase: phase.current,
        unitIndex,
        activeUnit: stacksState.activeUnit,
        hovered:
          Boolean(artifactHandoff) ||
          propReactionIsEngaged(stacksState, hoverKey),
        authoredParked: authoredParked.current,
        physicsParked: !entry || !!entry.parked,
        atAuthoredPose,
        nodSettled: Math.abs(nodAngle.current) < 1e-4,
      })
    )
      return;

    if (artifactHandoff && artifact) {
      if (artifactHandoffId.current !== artifact) {
        restoreArtifactMaterials(artifactHandoffMaterials.current);
        artifactHandoffId.current = artifact;
        artifactHandoffTravel.current = 0;
        artifactHandoffTravelGoal.current = 0;
        artifactHandoffTravelStart.current = 0;
        artifactHandoffTravelElapsed.current = 0;
        artifactHandoffOpacity.current = 1;
        artifactTargetCorrection.current =
          IDENTITY_ARTIFACT_PREVIEW_TARGET_CORRECTION;
        artifactHandoffStartPosition.copy(g.position);
        artifactHandoffStartQuaternion.copy(g.quaternion);
        artifactHandoffStartScale.copy(g.scale);
        g.updateWorldMatrix(true, true);
        artifactHandoffBounds.setFromObject(g);
        artifactHandoffBounds.getCenter(artifactHandoffLocalCenter);
        g.worldToLocal(artifactHandoffLocalCenter);
        g.getWorldScale(artifactHandoffWorldScale);
        // The size the camera will actually see at the target, where the
        // object turns to face it: the print's face-plane extent, in world
        // units, from the same basis the projected quad uses. The rotated
        // world AABB overestimates that face — a print hover-tilted at click
        // reads taller than it is — and the distance solved from it parked
        // the portrait ~7% smaller than its preview. The local x/y extent
        // stays as the fallback for subtrees with no flat carrier.
        const sizeBasis = artifactFaceBasis(g);
        const sizeFrame = sizeBasis
          ? artifactFaceCameraFrame(
              sizeBasis,
              camera.getWorldQuaternion(artifactCameraQuaternion),
              camera.getWorldPosition(artifactCameraPosition),
            )
          : null;
        if (sizeFrame) {
          artifactHandoffWorldSize.set(sizeFrame.width, sizeFrame.height, 0);
        } else {
          measureArtifactFaceSize(g, artifactHandoffWorldSize);
          if (artifactHandoffWorldSize.lengthSq() > 0)
            artifactHandoffWorldSize.multiply(artifactHandoffWorldScale);
          else artifactHandoffBounds.getSize(artifactHandoffWorldSize);
        }
        artifactHandoffMaterials.current = captureArtifactMaterials(g);
      }

      const target = artifactHandoff.target;
      if (target && (camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        const viewport = gl.domElement.getBoundingClientRect();
        const perspective = camera as THREE.PerspectiveCamera;
        const sourceBounds = target.sourceBounds;
        const requestedScaleFactor = sourceBounds
          ? THREE.MathUtils.clamp(
              Math.min(
                target.bounds.width / Math.max(1, sourceBounds.width),
                target.bounds.height / Math.max(1, sourceBounds.height),
              ),
              1,
              4,
            )
          : 1;
        const verticalFov = THREE.MathUtils.degToRad(perspective.fov);
        // The distance at which the scaled object projects to exactly
        // target.bounds. Distance is proportional to scale, so when the
        // clamp moves the object off that distance, the scale follows by the
        // same ratio and the projection still lands on the preview box. The
        // portrait shipped 44% oversized at the crossfade without this: big
        // print, narrow fov, required distance ~5 against the 3.5 cap.
        //
        // For an image print, width only, on purpose: bounds has the print's
        // framed aspect, so the width and height solves agree by
        // construction — and the local WIDTH is the one measurement the
        // captured pose cannot corrupt. A print hover-tilted or lying flat
        // at click spreads its local y and z, while x stays the print's
        // edge-to-edge width. A model artifact's bounds is not aspect-tied
        // to the object, so it keeps the fit-inside solve on both axes.
        const focalPixels = viewport.height / (2 * Math.tan(verticalFov / 2));
        const requestedDistance = sourceBounds
          ? (artifactHandoffWorldSize.x * requestedScaleFactor * focalPixels) /
            target.bounds.width
          : Math.max(
              (artifactHandoffWorldSize.y * focalPixels) / target.bounds.height,
              (artifactHandoffWorldSize.x * focalPixels) / target.bounds.width,
            );
        const distance = THREE.MathUtils.clamp(
          requestedDistance,
          perspective.near + 0.2,
          3.5,
        );
        const targetScaleFactor =
          requestedDistance > 0
            ? requestedScaleFactor * (distance / requestedDistance)
            : requestedScaleFactor;
        const correctedTargetScale =
          targetScaleFactor * artifactTargetCorrection.current.scale;
        artifactTargetLocalScale
          .copy(artifactHandoffStartScale)
          .multiplyScalar(correctedTargetScale);
        artifactTargetNdc
          .set(
            ((target.bounds.left + target.bounds.width / 2 - viewport.left) /
              viewport.width) *
              2 -
              1,
            -(
              ((target.bounds.top + target.bounds.height / 2 - viewport.top) /
                viewport.height) *
                2 -
              1
            ),
            0.5,
          )
          .unproject(camera);
        camera.getWorldPosition(artifactCameraPosition);
        artifactCameraDirection
          .subVectors(artifactTargetNdc, artifactCameraPosition)
          .normalize();
        camera.getWorldQuaternion(artifactCameraQuaternion);
        artifactRelativeQuaternion.fromArray(target.cameraRelativeQuaternion);
        // Aim the print's FACE at the camera, not the group. A lying-flat or
        // pinned print's tilt is authored on children inside this group;
        // slerping the group alone to the camera leaves the print edge-on
        // for the whole flight. The basis signs are arbitrary, so first keep
        // v world-up (prints are never rendered upside down), then point the
        // normal at the camera — each fix flips TWO axes so handedness
        // survives — and fold the face-in-group delta into the target.
        artifactHandoffFaceCounter.identity();
        if (target.sourceBounds) {
          // One consistent frame for both reads: getWorldQuaternion refreshes
          // ancestors but NOT children, so mixing it with child matrices left
          // over from last frame would fold this frame's own rotation into
          // the delta and make the target chase itself.
          g.updateWorldMatrix(true, true);
          const faceBasis = artifactFaceBasis(g);
          const faceFrame = faceBasis
            ? artifactFaceCameraFrame(
                faceBasis,
                artifactCameraQuaternion,
                camera.getWorldPosition(artifactCameraPosition),
              )
            : null;
          if (faceFrame) {
            artifactFaceMatrix.makeBasis(
              faceFrame.u,
              faceFrame.v,
              faceFrame.normal,
            );
            artifactFaceQuaternion.setFromRotationMatrix(artifactFaceMatrix);
            g.getWorldQuaternion(artifactGroupWorldQuaternion);
            // face-in-group delta R = G^-1 F, invariant under the group's own
            // rotation; the target that puts the FACE at D is D · R^-1.
            artifactHandoffFaceCounter
              .copy(artifactGroupWorldQuaternion)
              .invert()
              .multiply(artifactFaceQuaternion)
              .invert();
          }
        }
        artifactTargetWorldQuaternion
          .copy(artifactCameraQuaternion)
          .multiply(artifactRelativeQuaternion)
          .multiply(artifactHandoffFaceCounter);
        artifactCenterOffset
          .copy(artifactHandoffLocalCenter)
          .multiply(artifactHandoffWorldScale)
          .multiplyScalar(correctedTargetScale)
          .applyQuaternion(artifactTargetWorldQuaternion);
        artifactCameraUp.set(0, 1, 0).applyQuaternion(artifactCameraQuaternion);
        artifactCameraRight
          .set(1, 0, 0)
          .applyQuaternion(artifactCameraQuaternion);
        const correctionWorldUnitsPerPixel = distance / focalPixels;
        artifactTargetWorldPosition
          .copy(artifactCameraPosition)
          .addScaledVector(artifactCameraDirection, distance)
          .sub(artifactCenterOffset)
          .addScaledVector(
            artifactCameraRight,
            artifactTargetCorrection.current.offsetX *
              correctionWorldUnitsPerPixel,
          )
          .addScaledVector(
            artifactCameraUp,
            -artifactTargetCorrection.current.offsetY *
              correctionWorldUnitsPerPixel,
          );
        artifactTargetLocalPosition.copy(artifactTargetWorldPosition);
        artifactTargetLocalQuaternion.copy(artifactTargetWorldQuaternion);
        artifactArcLocal.copy(artifactCameraUp);
        if (g.parent) {
          g.parent.worldToLocal(artifactTargetLocalPosition);
          g.parent.getWorldQuaternion(artifactParentWorldQuaternion).invert();
          artifactTargetLocalQuaternion.premultiply(
            artifactParentWorldQuaternion,
          );
          artifactArcLocal.applyQuaternion(artifactParentWorldQuaternion);
        }
      }

      const travelGoal =
        artifactHandoff.phase === "returning" ? 0 : target ? 1 : 0;
      let artifactHandoffTimelineProgress = artifactHandoff.reducedMotion
        ? 1
        : 0;
      if (artifactHandoff.reducedMotion) {
        artifactHandoffTravel.current = travelGoal;
      } else if (target?.sourceBounds) {
        // Both paths share the balanced 420ms clock. Opacity changes only in
        // the middle, after their motion is underway and before either lands.
        if (artifactHandoffTravelGoal.current !== travelGoal) {
          artifactHandoffTravelGoal.current = travelGoal;
          artifactHandoffTravelStart.current = artifactHandoffTravel.current;
          artifactHandoffTravelElapsed.current = 0;
        }
        artifactHandoffTravelElapsed.current += delta;
        const linear = THREE.MathUtils.clamp(
          artifactHandoffTravelElapsed.current /
            (ARTIFACT_PREVIEW_DURATION_MS / 1000),
          0,
          1,
        );
        artifactHandoffTimelineProgress = linear;
        const eased = artifactPreviewEase(
          artifactPreviewPhysicalTravel(
            linear,
            artifactHandoff.phase === "returning",
          ),
        );
        artifactHandoffTravel.current = THREE.MathUtils.lerp(
          artifactHandoffTravelStart.current,
          travelGoal,
          eased,
        );
      } else {
        artifactHandoffTravel.current = THREE.MathUtils.damp(
          artifactHandoffTravel.current,
          travelGoal,
          ARTIFACT_HANDOFF_LAMBDA,
          delta,
        );
      }
      const travel = artifactHandoffTravel.current;
      if (target) {
        g.position
          .lerpVectors(
            artifactHandoffStartPosition,
            artifactTargetLocalPosition,
            travel,
          )
          .addScaledVector(
            artifactArcLocal,
            target.sourceBounds ? 0 : Math.sin(Math.PI * travel) * 0.07,
          );
        g.quaternion.slerpQuaternions(
          artifactHandoffStartQuaternion,
          artifactTargetLocalQuaternion,
          travel,
        );
        g.scale.lerpVectors(
          artifactHandoffStartScale,
          artifactTargetLocalScale,
          travel,
        );
      }

      if (
        target?.sourceBounds &&
        artifactEntry &&
        artifactHandoff.phase !== "returning" &&
        travel > 0.995
      ) {
        g.updateWorldMatrix(true, true);
        const live = projectSceneInteractionRect(artifactEntry.interactionId);
        if (live)
          artifactTargetCorrection.current =
            nextArtifactPreviewTargetCorrection(
              artifactTargetCorrection.current,
              target.bounds,
              live,
            );
      }

      const opacityGoal =
        artifactHandoff.phase === "crossfading-in" ||
        artifactHandoff.phase === "inspecting"
          ? 0
          : 1;
      if (artifactHandoff.reducedMotion) {
        artifactHandoffOpacity.current = opacityGoal;
      } else if (target?.sourceBounds) {
        // Covered two-stage handoff: the arriving owner becomes fully opaque
        // before the departing owner fades, so no frame exposes the room.
        if (artifactHandoff.phase === "returning")
          artifactHandoffOpacity.current = artifactPreviewRamp(
            artifactHandoffTimelineProgress,
            ARTIFACT_PREVIEW_SOURCE_IN_START,
            ARTIFACT_PREVIEW_SOURCE_IN_END,
          );
        else if (artifactHandoff.phase === "crossfading-in")
          artifactHandoffOpacity.current =
            1 -
            artifactPreviewRamp(
              artifactHandoffTimelineProgress,
              ARTIFACT_PREVIEW_SOURCE_OUT_START,
              ARTIFACT_PREVIEW_SOURCE_OUT_END,
            );
        else artifactHandoffOpacity.current = opacityGoal;
      } else {
        artifactHandoffOpacity.current = THREE.MathUtils.damp(
          artifactHandoffOpacity.current,
          opacityGoal,
          ARTIFACT_CROSSFADE_LAMBDA,
          delta,
        );
      }
      setArtifactOpacity(
        artifactHandoffMaterials.current,
        artifactHandoffOpacity.current,
      );

      if (
        artifactHandoff.phase === "lifting" &&
        target &&
        (target.sourceBounds
          ? artifactHandoffTimelineProgress >= ARTIFACT_PREVIEW_CROSSFADE_START
          : travel >= ARTIFACT_CROSSFADE_TRAVEL)
      )
        stacksState.dispatchModelArtifactHandoff({
          type: "source-crossfade-point",
        });
      else if (
        artifactHandoff.phase === "crossfading-in" &&
        !artifactHandoff.sourceAtTarget &&
        travel > 0.995
      )
        stacksState.dispatchModelArtifactHandoff({ type: "source-at-target" });
      else if (
        artifactHandoff.phase === "crossfading-in" &&
        artifactHandoff.sourceAtTarget &&
        artifactHandoffOpacity.current < 0.01
      )
        stacksState.dispatchModelArtifactHandoff({ type: "source-hidden" });
      else if (
        artifactHandoff.phase === "crossfading-out" &&
        artifactHandoffOpacity.current > 0.99
      )
        stacksState.dispatchModelArtifactHandoff({ type: "source-visible" });
      else if (
        artifactHandoff.phase === "returning" &&
        (target?.sourceBounds
          ? artifactHandoffTravelElapsed.current >=
            ARTIFACT_PREVIEW_DURATION_MS / 1000
          : travel < 0.005)
      ) {
        g.position.copy(artifactHandoffStartPosition);
        g.quaternion.copy(artifactHandoffStartQuaternion);
        g.scale.copy(artifactHandoffStartScale);
        restoreArtifactMaterials(artifactHandoffMaterials.current);
        artifactHandoffMaterials.current = [];
        artifactHandoffId.current = null;
        stacksState.dispatchModelArtifactHandoff({ type: "source-home" });
      }
    } else if (artifactHandoffId.current) {
      g.position.copy(artifactHandoffStartPosition);
      g.quaternion.copy(artifactHandoffStartQuaternion);
      g.scale.copy(artifactHandoffStartScale);
      restoreArtifactMaterials(artifactHandoffMaterials.current);
      artifactHandoffMaterials.current = [];
      artifactHandoffId.current = null;
    } else if (phase.current === "held" && pointerId.current !== null) {
      // Drag plane: camera-facing at the visitor-controlled hold depth, so
      // the pointer moves the object laterally while the wheel moves it along
      // the view ray. Rebuilt each frame because the camera rig keeps
      // breathing (a slow bob plus pointer parallax) even while you drag.
      camera.getWorldDirection(cameraForward);
      plane.normal.copy(cameraForward).negate();
      heldPlanePoint
        .copy(camera.position)
        .addScaledVector(cameraForward, heldDepth.current);
      plane.setFromNormalAndCoplanarPoint(plane.normal, heldPlanePoint);
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
        carryDistance.current += world.distanceTo(g.position);
        if (
          !carryFarSent.current &&
          carryDistance.current >= LONG_HAUL_CARRY_UNITS
        ) {
          carryFarSent.current = true;
          recordFieldNoteEvent({ type: "prop-carried-far", propId: hoverKey });
        }
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
        authoredStrikeFloorY.current ??
        (heldFacingRotation && heldMinRaise !== undefined
          ? base[1] + tiltedFaceClearance(g.quaternion, heldMinRaise)
          : base[1]);
      if (g.position.y <= surfaceY) {
        g.position.y = surfaceY;
        velocity.set(0, 0, 0);
        if (authoredStrikeFloorY.current !== null) {
          authoredStrikeFloorY.current = null;
          phase.current = "rest";
          authoredParked.current = true;
          authoredOffscreenFor.current = 0;
        } else if (surfaceY - base[1] < 1e-3) {
          g.position.y = base[1];
          g.rotation.set(restRotationX, restRotationY, restRotationZ);
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
          g.rotation.set(restRotationX, restRotationY, restRotationZ);
          authoredParked.current = false;
          authoredOffscreenFor.current = 0;
        }
      } else {
        // Yaw comes home too. The settle spins the prop, and leaving that spin
        // in meant "returns to its authored pose" was only true of position.
        const settled = atAuthoredPose;
        if (settled) {
          p.set(base[0], base[1], base[2]);
          g.rotation.set(restRotationX, restRotationY, restRotationZ);
          if (entry && shelf && !entry.parked) shelf.park(entry);
        } else {
          p.x = THREE.MathUtils.damp(p.x, base[0], HOME_LAMBDA, delta);
          p.y = THREE.MathUtils.damp(p.y, base[1], HOME_LAMBDA, delta);
          p.z = THREE.MathUtils.damp(p.z, base[2], HOME_LAMBDA, delta);
          g.rotation.x = THREE.MathUtils.damp(
            g.rotation.x,
            restRotationX,
            HOME_LAMBDA,
            delta,
          );
          g.rotation.y = THREE.MathUtils.damp(
            g.rotation.y,
            restRotationY,
            HOME_LAMBDA,
            delta,
          );
          g.rotation.z = THREE.MathUtils.damp(
            g.rotation.z,
            restRotationZ,
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
      // arrive, overshoot and settle as a single motion. The band supplies how
      // far each goes and how bouncy the arrival is; return is critically
      // damped so engagement never reverses the hinge behind its rest plane.
      // This replaced a pair of
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
              cameraSideHoverTilt(nodCameraDirection, Math.abs(bandMotion.lean))
            : cameraSideHoverTilt(nodCameraDirection, hoverTiltAngle);
        // A lean is only safe DOWNWARD, where hingeShift pins the contact
        // edge. Nothing was watching the rising end of the arc, and the props
        // that stack have no room there: a book in a horizontal row carries
        // its neighbour flat on its top face with a gap of exactly zero. A
        // blocked lean becomes a pull toward the viewer, which is what the
        // stack's own FLAT_LIFT and the About reading fan each chose by hand.
        const budget =
          hoverLift > 0
            ? { lean: aimed, slide: 0 }
            : leanBudget(hinge.current, aimed, {
                authoredAngle: hoverTiltAngle !== undefined,
              });
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
      n.position.y += swaySpring.angle * hoverLift;
      // Rides the SAME spring as the lean it replaced, so a book pulled out of
      // a stack overshoots on arrival exactly as its neighbour standing in the
      // open does. Both return to rest without crossing the support plane.
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
      if (artifactHandoffId.current)
        s.material.opacity *= 1 - artifactHandoffTravel.current;
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
      {/* Named for the same reason the nod group below is: the contact
          shadow now carries the layout editor's selection cue, and a sprite's
          opacity is not something a screenshot can be asked about — the gizmo
          is drawn over the very plank the shade falls on. */}
      <sprite
        ref={shade}
        name={`shade:${hoverKey}`}
        position={[base[0], base[1] + 0.02, base[2] + 0.02]}
      >
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
        // Uniform, and the only scale React writes here: the artifact handoff
        // animates `g.scale` from whatever it finds and restores that same
        // value, so an overridden prop keeps its size through a fullscreen
        // preview.
        scale={restScale}
        // Tap/drag arbitration happens on the native window gesture above.
        // Consume Three's later synthetic click so the same ray cannot also
        // activate a link or unit plane sitting behind this carried object.
        onClick={(event) => {
          event.stopPropagation();
        }}
        onPointerDown={(event: ThreeEvent<PointerEvent>) => {
          if (!sceneLayoutEditorController.canSelect(hoverKey)) return;
          event.stopPropagation();
          sceneLayoutEditorController.select(hoverKey);
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          if (sceneLayoutEditorController.owns(hoverKey)) return;
          useStacks.getState().setHovered(hoverKey);
          onHoverIntent?.();
          // The one honest moment to start the download: a pointer resting on
          // something you can pick up, several hundred milliseconds before the
          // press. Idempotent, and a no-op on touch or a degraded machine.
          if (physicsEnabled) prewarmGrabbablePhysics();
          if (artifactEntry?.kind === "model")
            prewarmModelArtifactPreview(artifactEntry.fallbackImage);
        }}
        onPointerOut={(event) => {
          if (
            !pointerOutLeavesInteraction(
              event.eventObject,
              event.intersections,
            )
          )
            return;
          if (useStacks.getState().hovered === hoverKey)
            useStacks.getState().setHovered(null);
        }}
      >
        {/* Named for the same reason Lift's group and SPIN_NODE are: the nod
            is a few degrees on ONE object in a scene where the camera never
            stops moving, so a screenshot cannot tell you it happened. */}
        <group ref={impulse} name={`impulse:${hoverKey}`}>
          <group ref={nod} name={`nod:${hoverKey}`}>
            {/* The physical form underneath registers its edges against this
                artifact so the fullscreen preview can draw the same print. */}
            <SceneArtifactIdContext.Provider value={artifact ?? null}>
              {children}
            </SceneArtifactIdContext.Provider>
          </group>
        </group>
      </group>
    </>
  );
}

const DEV = process.env.NODE_ENV === "development";
const noSceneLayoutOverride = () => null;
const noSceneLayoutSubscription = () => () => undefined;

/**
 * The pose the development layout editor left on this prop, or null.
 *
 * `useSyncExternalStore` rather than a frame-loop read because the override
 * feeds React-owned transforms (`position`, `scale`) as well as the physics
 * path, and those two disagreeing for a frame is a visible jump. The
 * controller hands back the same frozen object until a component actually
 * changes, so a gizmo drag does not re-render the prop every frame.
 */
function useSceneLayoutOverride(hoverKey: string): SceneLayoutOverride | null {
  return useSyncExternalStore(
    DEV ? sceneLayoutEditorController.subscribe : noSceneLayoutSubscription,
    DEV
      ? () => sceneLayoutEditorController.overrideFor(hoverKey)
      : noSceneLayoutOverride,
    noSceneLayoutOverride,
  );
}

function defaultLayoutEditorLabel(hoverKey: string, unitIndex: number) {
  const words = hoverKey
    .replace(/^grab:/, "")
    .split(/[:/_-]+/)
    .filter(Boolean)
    .join(" ");
  return `Unit ${unitIndex + 1} · ${words || hoverKey}`;
}

/** Twin of the helper in Lift/ModelProp (not exported there). */
function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
