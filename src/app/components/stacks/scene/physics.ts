"use client";

import type * as CANNON from "cannon-es";
import * as THREE from "three";

import type {
  PhysicsSceneScope,
  PhysicsStaticRoot,
} from "./PhysicsSceneProvider";
import { publishMeadowPhysicalEvent } from "./meadowDisturbance";
import {
  MEADOW_TRAIL,
  meadowPhysicalResponse,
  meadowTrailReady,
} from "./meadowMotion";
import {
  DYNAMIC_COLLIDER_HORIZONTAL_INSET,
  type DynamicColliderProfile,
  MAX_STATIC_COLLIDER_SHAPES,
  type OrientedBoxCollider,
  extractColliderBoxes,
  extractDynamicColliderBoxes,
} from "./physicsColliders";
import {
  type PhysicsReasonCode,
  physicsDiagnosticsController,
} from "./physicsDiagnostics";
import { SHELF_GEOMETRY, SHELF_SURFACE } from "./shelfGeometry";
import { sceneUnitActivityController } from "./unitActivity";

type CannonModule = {
  World: typeof CANNON.World;
  Body: typeof CANNON.Body;
  Vec3: typeof CANNON.Vec3;
  Quaternion: typeof CANNON.Quaternion;
  Box: typeof CANNON.Box;
  Sphere: typeof CANNON.Sphere;
  Plane: typeof CANNON.Plane;
  Material: typeof CANNON.Material;
  ContactMaterial: typeof CANNON.ContactMaterial;
  Narrowphase: typeof CANNON.Narrowphase;
  SAPBroadphase: typeof CANNON.SAPBroadphase;
};

export const GRAVITY = 9.81;
const DENSITY = 90;
const COM_FRACTION = 0.35;
const DEFAULT_MAX_THROW = 4;
const TUMBLE = 0.9;
const SHOCKWAVE_MAX_SPEED = 2.4;
const SHOCKWAVE_TOPPLE_SPEED = 6.2;
const MIN_EXTENT = 0.008;
/** Cannon has no continuous collision detection. Bodies thinner than this
 * moving more than a metre per second need a smaller step so one integration
 * cannot cross an authored shelf plank before the narrowphase sees contact. */
const THIN_BODY_CCD_EXTENT = 0.03;
const THIN_BODY_CCD_SPEED = 1;
const SPHERICITY = 1.18;
const BALL_LINEAR_DAMPING = 0.05;
const BALL_ANGULAR_DAMPING = 0.9;
const MAX_BALL_SPIN = 24;
const OFFSCREEN_RESET_SECONDS = 1;
const SETTLED_SLEEP_SECONDS = 0.5;
const SETTLED_LINEAR_SPEED = 0.02;
const SETTLED_ANGULAR_SPEED = 0.08;

/** Keep collision accuracy independent from renderer cadence without allowing
 * a late frame to schedule an unbounded solver catch-up. A fast thin body gets
 * quarter-size steps; every other body retains the ordinary 60 Hz step.
 *
 * 120 Hz was not enough. At the 4 u/s release ceiling a body travels 0.033 per
 * step, more than half the 0.055-thick lower plank, so the narrowphase saw one
 * contact frame and the Musings paper stack landed on the room floor instead
 * of the shelf. A measured sweep of 462 reachable release poses tunnelled 27
 * of them at 1/120 and none at 1/240. The thin tier's catch-up ceiling is
 * unchanged at 1/60 of simulated time per frame, so a late frame cannot
 * spiral any further than it already could. */
export function freeBodyStepPolicy(thinFastBody: boolean) {
  return {
    fixedStep: thinFastBody ? 1 / 240 : 1 / 60,
    maxSubSteps: thinFastBody ? 4 : 2,
  } as const;
}
const SAFETY_HORIZONTAL_MARGIN = 8;
const SOLVER_ITERATIONS = 20;
// Cannon's default contact correction is springy enough to launch a prop back
// upward after the prop beneath it is pushed into a shelf. A slower correction
// keeps the bodies interactive while letting multi-body stacks absorb impact.
const CONTACT_RELAXATION = 15;

export const SCENE_MASS_PER_KG = 6.8;
export type HullShape = "auto" | "sphere" | "box";
export type ShelfPlane = "top" | "lower" | "floor";
export type Phase = "rest" | "held" | "settling" | "sim";

export type WorldFallbackReason =
  | "opted-out"
  | "geometry-pending"
  | "module-loading"
  | "module-failed"
  | "ineligible-pointer";

export type WorldPreparationResult =
  | { status: "ready"; world: ScenePhysicsWorld }
  | { status: "fallback"; reason: WorldFallbackReason };

export type HeldPose = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

export type HeldMoveResult = {
  accepted: HeldPose;
  acceptedVelocity: THREE.Vector3;
  blockers: string[];
  normals: THREE.Vector3[];
  sliding: boolean;
};

export type ShelfHandle = {
  key: string;
  unitIndex: number;
  group: THREE.Group;
  base: THREE.Vector3;
  spin: number;
  shape?: HullShape;
  colliderProfile?: DynamicColliderProfile;
  massKg?: number;
  restitution?: number;
  maxThrowSpeed?: number;
  plane?: ShelfPlane;
  phase: { current: Phase };
  physicsEnabled?: boolean;
  physicsActivation?: "detach";
  physicsActivated?: boolean;
  world?: ScenePhysicsWorld;
  body?: CANNON.Body;
  com?: THREE.Vector3;
  parked?: boolean;
  prev?: THREE.Vector3;
  hullReasons?: PhysicsReasonCode[];
  smallestExtent?: number;
  accepted?: HeldPose;
  lastSafe?: HeldPose;
  acceptedVelocity?: THREE.Vector3;
  gestureGeometryRevision?: string;
  offscreenFor?: number;
  settledFor?: number;
  meadowImpactListener?: (event: { contact?: CANNON.ContactEquation }) => void;
  meadowFootprint?: number;
  meadowTrailX?: number;
  meadowTrailZ?: number;
  meadowTrailFor?: number;
};

export function ballReleaseSpin(
  velocity: Pick<THREE.Vector3, "x" | "z">,
  radius: number,
): [number, number, number] {
  const x = velocity.z / Math.max(radius, 0.02);
  const z = -velocity.x / Math.max(radius, 0.02);
  const length = Math.hypot(x, z);
  const scale = length > MAX_BALL_SPIN ? MAX_BALL_SPIN / length : 1;
  return [x * scale, 0, z * scale];
}

function ballSleepLimit(radius: number) {
  return 0.05 * (1 + 1 / Math.max(radius, 0.02));
}

export function staticColliderSupportY(plane: ShelfPlane) {
  return plane === "floor" ? SHELF_GEOMETRY.groundY : 0;
}

const PLANK_EPS = 0.01;
const worldScratch = new THREE.Vector3();

function plankAt(y: number): ShelfPlane | null {
  if (Math.abs(y - SHELF_SURFACE.top) < PLANK_EPS) return "top";
  if (Math.abs(y - SHELF_SURFACE.lower) < PLANK_EPS) return "lower";
  return null;
}

/** Kept as an authoring/diagnostic helper; it no longer selects a world. */
export function resolveShelf(group: THREE.Object3D): {
  shelf: THREE.Object3D;
  plane: ShelfPlane;
} {
  const start = group.parent ?? group;
  start.updateWorldMatrix(true, false);
  const plane = plankAt(start.getWorldPosition(worldScratch).y);
  if (!plane) return { shelf: start, plane: "floor" };
  let shelf = start;
  for (let current = start.parent; current; current = current.parent) {
    if (plankAt(current.getWorldPosition(worldScratch).y) !== plane) break;
    shelf = current;
  }
  return { shelf, plane };
}

let CANNON_MOD: CannonModule | null = null;
let pending: Promise<boolean> | null = null;
let moduleFailed = false;

export function warm(): Promise<boolean> {
  if (CANNON_MOD) return Promise.resolve(true);
  if (moduleFailed) return Promise.resolve(false);
  pending ??= import("cannon-es")
    .then((mod) => {
      CANNON_MOD = mod;
      physicsDiagnosticsController.update({ moduleState: "ready" });
      return true;
    })
    .catch(() => {
      moduleFailed = true;
      physicsDiagnosticsController.update({ moduleState: "failed" });
      return false;
    });
  return pending;
}

const worlds = new WeakMap<PhysicsSceneScope, ScenePhysicsWorld>();

export function prepareScenePhysics(
  scope: PhysicsSceneScope,
  requested: ShelfHandle,
): WorldPreparationResult {
  if (!CANNON_MOD)
    return {
      status: "fallback",
      reason: moduleFailed ? "module-failed" : "module-loading",
    };
  if (requested.physicsEnabled === false)
    return { status: "fallback", reason: "opted-out" };
  let world = worlds.get(scope);
  if (!world) {
    world = new ScenePhysicsWorld(CANNON_MOD, scope);
    worlds.set(scope, world);
  }
  world.synchronize();
  if (!requested.body) {
    physicsDiagnosticsController.publish({
      code: "geometry-pending",
      handle: requested.key,
    });
    return { status: "fallback", reason: "geometry-pending" };
  }
  world.publishDiagnostics(requested);
  return { status: "ready", world };
}

type ProbeContact = {
  body: CANNON.Body;
  normal: THREE.Vector3;
  point: THREE.Vector3;
  dynamic: boolean;
};

class CannonCollisionProbe {
  private readonly narrowphase: CANNON.Narrowphase;
  queries = 0;

  constructor(
    private readonly C: CannonModule,
    private readonly world: CANNON.World,
  ) {
    this.narrowphase = new C.Narrowphase(world);
  }

  contacts(probe: CANNON.Body, ignored?: CANNON.Body): ProbeContact[] {
    const result: CANNON.ContactEquation[] = [];
    const friction: CANNON.FrictionEquation[] = [];
    probe.aabbNeedsUpdate = true;
    probe.updateAABB();
    const candidates: CANNON.Body[] = [];
    this.queries += 1;
    this.world.broadphase.aabbQuery(this.world, probe.aabb, candidates);
    for (const body of candidates) {
      if (body === ignored || body === probe || !body.collisionResponse)
        continue;
      this.narrowphase.getContacts(
        [probe],
        [body],
        this.world,
        result,
        [],
        friction,
        [],
      );
    }
    return result.map((contact) => {
      const probeIsBi = contact.bi === probe;
      const sign = probeIsBi ? -1 : 1;
      const ri = probeIsBi ? contact.ri : contact.rj;
      return {
        body: probeIsBi ? contact.bj : contact.bi,
        normal: new THREE.Vector3(
          contact.ni.x * sign,
          contact.ni.y * sign,
          contact.ni.z * sign,
        ).normalize(),
        point: new THREE.Vector3(
          probe.position.x + ri.x,
          probe.position.y + ri.y,
          probe.position.z + ri.z,
        ),
        dynamic:
          (probeIsBi ? contact.bj : contact.bi).type === this.C.Body.DYNAMIC,
      };
    });
  }
}

type RootStatics = {
  signature: string;
  bodies: CANNON.Body[];
  count: number;
  reasons: PhysicsReasonCode[];
};

type AuthoredRootStatics = {
  root: THREE.Object3D;
  matrixSignature: string;
  bodies: CANNON.Body[];
};

type TaggedBody = CANNON.Body & {
  authoredSupport?: boolean;
  generatedStatic?: boolean;
  rootId?: string;
  unitIndex?: number;
};

function updateBodyBounds(body: CANNON.Body) {
  body.aabbNeedsUpdate = true;
  body.updateAABB();
}

function horizontalFootprint(body: CANNON.Body) {
  if (body.aabbNeedsUpdate) updateBodyBounds(body);
  return Math.max(
    body.aabb.upperBound.x - body.aabb.lowerBound.x,
    body.aabb.upperBound.z - body.aabb.lowerBound.z,
  );
}

function orientedColliderBounds(collider: OrientedBoxCollider) {
  const out = new THREE.Box3();
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1])
        out.expandByPoint(
          new THREE.Vector3(
            x * collider.halfExtents.x,
            y * collider.halfExtents.y,
            z * collider.halfExtents.z,
          )
            .applyQuaternion(collider.quaternion)
            .add(collider.offset),
        );
  return out;
}

const scaleScratch = new THREE.Vector3();
const matrixScratch = new THREE.Matrix4();

export class ScenePhysicsWorld {
  readonly plane = "scene" as const;
  readonly handles: ShelfHandle[] = [];
  private readonly world: CANNON.World;
  private readonly balls = new Map<number, number>();
  private readonly bodyRestitution = new Map<number, number>();
  private readonly groundedBodyIds = new Set<number>();
  private readonly rootStatics = new Map<string, RootStatics>();
  private readonly authoredStatics: CANNON.Body[] = [];
  private readonly authoredByRoot = new Map<string, AuthoredRootStatics>();
  private readonly contacts: Array<{
    key: string;
    at: number[];
    neighbour: number[];
    crossUnit: boolean;
  }> = [];
  private readonly ordinaryMaterial: CANNON.Material;
  private readonly woodMaterial: CANNON.Material;
  private readonly bouncyMaterials = new Map<number, CANNON.Material>();
  private readonly probe: CannonCollisionProbe;
  private stamp = -1;
  private smallestStaticExtent = Number.POSITIVE_INFINITY;
  private generatedStaticsEnabled = true;
  private lastTimingPublish = Number.NEGATIVE_INFINITY;
  private timingPeak = 0;
  private safetyBounds = new THREE.Box3(
    new THREE.Vector3(-SAFETY_HORIZONTAL_MARGIN, -5, -SAFETY_HORIZONTAL_MARGIN),
    new THREE.Vector3(SAFETY_HORIZONTAL_MARGIN, 12, SAFETY_HORIZONTAL_MARGIN),
  );
  private disposed = false;
  private readonly unregisterFrameDriver: () => void;

  constructor(
    private readonly C: CannonModule,
    private readonly scope: PhysicsSceneScope,
  ) {
    this.world = new C.World({
      gravity: new C.Vec3(0, -GRAVITY, 0),
      allowSleep: true,
    });
    const broadphase = new C.SAPBroadphase(this.world);
    broadphase.axisIndex = 0;
    this.world.broadphase = broadphase;
    (this.world.solver as CANNON.GSSolver).iterations = SOLVER_ITERATIONS;
    this.world.defaultContactMaterial.friction = 0.45;
    this.world.defaultContactMaterial.restitution = 0;
    this.world.defaultContactMaterial.contactEquationRelaxation =
      CONTACT_RELAXATION;
    this.world.defaultContactMaterial.frictionEquationRelaxation =
      CONTACT_RELAXATION;
    this.ordinaryMaterial = new C.Material("ordinary");
    this.woodMaterial = new C.Material("wood");
    this.addContactPair(this.ordinaryMaterial, this.ordinaryMaterial, 0);
    this.addContactPair(this.ordinaryMaterial, this.woodMaterial, 0);
    this.probe = new CannonCollisionProbe(C, this.world);
    this.addGround();
    this.unregisterFrameDriver = this.scope.installFrameDriver(
      (delta, stamp, camera) => this.tick(delta, stamp, camera),
    );
    this.scope.onDispose(() => this.dispose());
    this.synchronize();
  }

  private addContactPair(
    first: CANNON.Material,
    second: CANNON.Material,
    restitution: number,
  ) {
    this.world.addContactMaterial(
      new this.C.ContactMaterial(first, second, {
        friction: 0.45,
        restitution,
        contactEquationRelaxation: CONTACT_RELAXATION,
        frictionEquationRelaxation: CONTACT_RELAXATION,
      }),
    );
  }

  private materialFor(restitution?: number) {
    if (restitution === undefined) return this.ordinaryMaterial;
    let material = this.bouncyMaterials.get(restitution);
    if (material) return material;
    material = new this.C.Material(`bouncy:${restitution}`);
    this.addContactPair(material, this.woodMaterial, restitution);
    this.addContactPair(material, this.ordinaryMaterial, 0);
    for (const other of this.bouncyMaterials.values())
      this.addContactPair(material, other, 0);
    this.addContactPair(material, material, 0);
    this.bouncyMaterials.set(restitution, material);
    return material;
  }

  private addGround() {
    const ground = new this.C.Body({
      type: this.C.Body.STATIC,
      shape: new this.C.Plane(),
      material: this.woodMaterial,
    }) as TaggedBody;
    ground.position.y = SHELF_GEOMETRY.groundY;
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    updateBodyBounds(ground);
    ground.authoredSupport = true;
    ground.rootId = "scene:ground";
    this.authoredStatics.push(ground);
    this.world.addBody(ground);
  }

  private addShelfPlanks(root: PhysicsStaticRoot) {
    if (root.kind !== "unit") return;
    root.root.updateWorldMatrix(true, false);
    const matrixSignature = root.root.matrixWorld.elements
      .map((value) => Math.round(value * 10000) / 10000)
      .join(",");
    const previous = this.authoredByRoot.get(root.id);
    if (
      previous?.root === root.root &&
      previous.matrixSignature === matrixSignature
    )
      return;
    if (previous) {
      for (const body of previous.bodies) {
        this.world.removeBody(body);
        const at = this.authoredStatics.indexOf(body);
        if (at >= 0) this.authoredStatics.splice(at, 1);
      }
    }
    const rootQuaternion = root.root.getWorldQuaternion(new THREE.Quaternion());
    const bodies: CANNON.Body[] = [];
    for (const id of ["top", "lower"] as const) {
      const geometry = SHELF_GEOMETRY[id];
      const body = new this.C.Body({
        type: this.C.Body.STATIC,
        shape: new this.C.Box(
          new this.C.Vec3(
            SHELF_GEOMETRY.width / 2,
            geometry.thickness / 2,
            geometry.depth / 2,
          ),
        ),
        material: this.woodMaterial,
      }) as TaggedBody;
      const position = root.root.localToWorld(
        new THREE.Vector3(0, geometry.centerY, geometry.centerZ),
      );
      body.position.set(position.x, position.y, position.z);
      body.quaternion.set(
        rootQuaternion.x,
        rootQuaternion.y,
        rootQuaternion.z,
        rootQuaternion.w,
      );
      updateBodyBounds(body);
      body.authoredSupport = true;
      body.rootId = `${root.id}:plank:${id}`;
      body.unitIndex = root.unitIndex;
      this.authoredStatics.push(body);
      bodies.push(body);
      this.world.addBody(body);
    }
    this.authoredByRoot.set(root.id, {
      root: root.root,
      matrixSignature,
      bodies,
    });
  }

  synchronize() {
    if (this.disposed) return;
    const mounted = [...this.scope.handles<ShelfHandle>()];
    for (const handle of mounted) this.adopt(handle);
    for (const handle of [...this.handles])
      if (!mounted.includes(handle)) this.drop(handle);
    // prepareScenePhysics calls synchronize at the pointerdown boundary,
    // before this gesture has moved any geometry. Grabbable has already
    // labelled the requested handle `held` by then, so treating that label as
    // an in-progress carry suppresses every shelf collider on the first real
    // grab. Rebuilding here is still between gestures (the global dispatcher
    // permits only one grab), and unchanged root signatures remain no-ops.
    this.rebuildStatics();
  }

  private rebuildStatics() {
    const roots = this.scope.roots();
    const liveIds = new Set(roots.map((root) => root.id));
    for (const [id, state] of this.rootStatics) {
      if (liveIds.has(id)) continue;
      for (const body of state.bodies) this.world.removeBody(body);
      this.rootStatics.delete(id);
    }
    for (const [id, state] of this.authoredByRoot) {
      if (liveIds.has(id)) continue;
      for (const body of state.bodies) {
        this.world.removeBody(body);
        const at = this.authoredStatics.indexOf(body);
        if (at >= 0) this.authoredStatics.splice(at, 1);
      }
      this.authoredByRoot.delete(id);
    }
    for (const root of roots) {
      this.addShelfPlanks(root);
      this.rebuildRoot(root);
    }
    this.recomputeSafetyBounds(roots);
    this.smallestStaticExtent = [...this.rootStatics.values()]
      .flatMap((state) => state.bodies)
      .reduce((smallest, body) => {
        const shape = body.shapes[0];
        return shape instanceof this.C.Box
          ? Math.min(
              smallest,
              shape.halfExtents.x * 2,
              shape.halfExtents.y * 2,
              shape.halfExtents.z * 2,
            )
          : smallest;
      }, Number.POSITIVE_INFINITY);
  }

  private rebuildRoot(root: PhysicsStaticRoot) {
    const excluded = new Set(
      this.handles
        .filter((handle) => {
          for (
            let current: THREE.Object3D | null = handle.group;
            current;
            current = current.parent
          )
            if (current === root.root) return true;
          return false;
        })
        .map((handle) => handle.group as THREE.Object3D),
    );
    const extraction = extractColliderBoxes(root.root, {
      excludeRoots: excluded,
      maxShapes: MAX_STATIC_COLLIDER_SHAPES,
    });
    const matrixSignature = root.root.matrixWorld.elements
      .map((value) => Math.round(value * 10000) / 10000)
      .join(",");
    const signature = `${matrixSignature}:${extraction.signature}`;
    const prior = this.rootStatics.get(root.id);
    if (prior?.signature === signature) return;

    root.root.updateWorldMatrix(true, false);
    const rootQuaternion = root.root.getWorldQuaternion(new THREE.Quaternion());
    root.root.getWorldScale(scaleScratch);
    const replacements: CANNON.Body[] = [];
    for (const part of extraction.boxes) {
      const bounds = orientedColliderBounds(part);
      if (bounds.max.y <= SHELF_GEOMETRY.groundY + MIN_EXTENT) continue;
      const half = part.halfExtents
        .clone()
        .multiply(
          new THREE.Vector3(
            Math.abs(scaleScratch.x),
            Math.abs(scaleScratch.y),
            Math.abs(scaleScratch.z),
          ),
        );
      if (Math.min(half.x, half.y, half.z) < MIN_EXTENT / 2) continue;
      const body = new this.C.Body({
        type: this.C.Body.STATIC,
        material: this.woodMaterial,
      }) as TaggedBody;
      body.addShape(new this.C.Box(new this.C.Vec3(half.x, half.y, half.z)));
      const position = root.root.localToWorld(part.offset.clone());
      const orientation = rootQuaternion.clone().multiply(part.quaternion);
      body.position.set(position.x, position.y, position.z);
      body.quaternion.set(
        orientation.x,
        orientation.y,
        orientation.z,
        orientation.w,
      );
      updateBodyBounds(body);
      body.generatedStatic = true;
      body.rootId = root.id;
      body.unitIndex = root.unitIndex;
      body.collisionResponse = this.generatedStaticsEnabled;
      replacements.push(body);
    }
    for (const body of prior?.bodies ?? []) this.world.removeBody(body);
    for (const body of replacements) this.world.addBody(body);
    this.rootStatics.set(root.id, {
      signature,
      bodies: replacements,
      count: replacements.length,
      reasons: extraction.reasons,
    });
    for (const code of extraction.reasons)
      physicsDiagnosticsController.publish({
        code,
        detail: root.id,
      });
  }

  private recomputeSafetyBounds(roots: PhysicsStaticRoot[]) {
    const bounds = new THREE.Box3();
    for (const root of roots) {
      root.root.updateWorldMatrix(true, true);
      bounds.union(new THREE.Box3().setFromObject(root.root));
      bounds.expandByPoint(root.root.getWorldPosition(new THREE.Vector3()));
    }
    if (bounds.isEmpty())
      bounds.setFromCenterAndSize(
        new THREE.Vector3(),
        new THREE.Vector3(1, 1, 1),
      );
    bounds.min.x -= SAFETY_HORIZONTAL_MARGIN;
    bounds.max.x += SAFETY_HORIZONTAL_MARGIN;
    bounds.min.z -= SAFETY_HORIZONTAL_MARGIN;
    bounds.max.z += SAFETY_HORIZONTAL_MARGIN;
    bounds.min.y = -5;
    bounds.max.y = 12;
    this.safetyBounds.copy(bounds);
  }

  private parentPose(handle: ShelfHandle) {
    const parent = handle.group.parent;
    if (!parent)
      return {
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
      };
    parent.updateWorldMatrix(true, false);
    return {
      position: parent.getWorldPosition(new THREE.Vector3()),
      quaternion: parent.getWorldQuaternion(new THREE.Quaternion()),
    };
  }

  private bodyPose(handle: ShelfHandle, pose: HeldPose) {
    const parent = this.parentPose(handle);
    const position = handle
      .com!.clone()
      .applyQuaternion(pose.quaternion)
      .add(pose.position)
      .applyQuaternion(parent.quaternion)
      .add(parent.position);
    return {
      position,
      quaternion: parent.quaternion.clone().multiply(pose.quaternion),
    };
  }

  adopt(handle: ShelfHandle) {
    const registered = this.handles.includes(handle);
    if (registered && handle.body) return;
    if (!registered) {
      this.handles.push(handle);
      handle.world = this;
    }
    if (handle.physicsEnabled === false) return;
    if (handle.physicsActivation === "detach" && !handle.physicsActivated)
      return;
    const extraction = extractDynamicColliderBoxes(
      handle.group,
      handle.colliderProfile,
    );
    const box = extraction.bounds;
    if (!box || extraction.boxes.length === 0) return;
    handle.hullReasons = extraction.reasons;
    for (const code of extraction.reasons)
      physicsDiagnosticsController.publish({ code, handle: handle.key });
    const centre = box.getCenter(new THREE.Vector3());
    const halfSize = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const span = [
      halfSize.x * DYNAMIC_COLLIDER_HORIZONTAL_INSET,
      halfSize.y,
      halfSize.z * DYNAMIC_COLLIDER_HORIZONTAL_INSET,
    ];
    const round =
      handle.shape === "sphere" ||
      (handle.shape !== "box" &&
        Math.max(...span) / Math.max(Math.min(...span), 1e-6) < SPHERICITY);
    const radius = Math.min(halfSize.x, halfSize.y, halfSize.z);
    const com = centre.clone();
    if (!round) com.y = box.min.y + (box.max.y - box.min.y) * COM_FRACTION;
    const volume = extraction.boxes.reduce(
      (sum, part) =>
        sum + part.halfExtents.x * part.halfExtents.y * part.halfExtents.z * 8,
      0,
    );
    const body = new this.C.Body({
      mass:
        handle.massKg !== undefined
          ? Math.max(0.05, handle.massKg * SCENE_MASS_PER_KG)
          : Math.max(0.08, volume * DENSITY),
      linearDamping: round ? BALL_LINEAR_DAMPING : 0.5,
      angularDamping: round ? BALL_ANGULAR_DAMPING : 0.6,
      material: this.materialFor(handle.restitution),
    });
    if (round) {
      body.addShape(
        new this.C.Sphere(radius),
        new this.C.Vec3(0, centre.y - com.y, 0),
      );
      this.balls.set(body.id, radius);
    } else {
      for (const part of extraction.boxes) {
        const half = part.halfExtents.clone();
        half.x *= DYNAMIC_COLLIDER_HORIZONTAL_INSET;
        half.z *= DYNAMIC_COLLIDER_HORIZONTAL_INSET;
        body.addShape(
          new this.C.Box(new this.C.Vec3(half.x, half.y, half.z)),
          new this.C.Vec3(
            part.offset.x - com.x,
            part.offset.y - com.y,
            part.offset.z - com.z,
          ),
          new this.C.Quaternion(
            part.quaternion.x,
            part.quaternion.y,
            part.quaternion.z,
            part.quaternion.w,
          ),
        );
      }
    }
    body.allowSleep = true;
    body.sleepSpeedLimit = round ? ballSleepLimit(radius) : 0.05;
    body.sleepTimeLimit = 0.45;
    handle.body = body;
    handle.com = com;
    handle.prev = new THREE.Vector3();
    handle.smallestExtent = round
      ? radius * 2
      : Math.min(
          ...extraction.boxes.flatMap((part) =>
            part.halfExtents.toArray().map((extent) => extent * 2),
          ),
        );
    handle.acceptedVelocity = new THREE.Vector3();
    this.bodyRestitution.set(body.id, handle.restitution ?? 0);
    this.world.addBody(body);
    updateBodyBounds(body);
    handle.meadowFootprint = horizontalFootprint(body);
    this.park(handle);
  }

  drop(handle: ShelfHandle) {
    const at = this.handles.indexOf(handle);
    if (at >= 0) this.handles.splice(at, 1);
    if (handle.world !== this) return;
    if (handle.body) {
      if (handle.meadowImpactListener)
        handle.body.removeEventListener("collide", handle.meadowImpactListener);
      handle.meadowImpactListener = undefined;
      this.world.removeBody(handle.body);
      this.balls.delete(handle.body.id);
      this.bodyRestitution.delete(handle.body.id);
    }
    handle.body = undefined;
    handle.world = undefined;
  }

  carrying() {
    return this.handles.some((handle) => handle.phase.current === "held");
  }

  private push(handle: ShelfHandle, delta: number) {
    const body = handle.body;
    if (!body || !handle.com || !handle.prev) return;
    const pose = this.bodyPose(handle, {
      position: handle.group.position,
      quaternion: handle.group.quaternion,
    });
    if (delta > 0)
      body.velocity.set(
        (pose.position.x - handle.prev.x) / delta,
        (pose.position.y - handle.prev.y) / delta,
        (pose.position.z - handle.prev.z) / delta,
      );
    body.position.set(pose.position.x, pose.position.y, pose.position.z);
    body.quaternion.set(
      pose.quaternion.x,
      pose.quaternion.y,
      pose.quaternion.z,
      pose.quaternion.w,
    );
    handle.prev.copy(pose.position);
    body.aabbNeedsUpdate = true;
    body.wakeUp();
  }

  private pull(handle: ShelfHandle) {
    const body = handle.body;
    if (!body || !handle.com) return;
    const parent = handle.group.parent;
    const parentQuaternion = parent
      ? parent.getWorldQuaternion(new THREE.Quaternion())
      : new THREE.Quaternion();
    const localQuaternion = parentQuaternion
      .clone()
      .invert()
      .multiply(
        new THREE.Quaternion(
          body.quaternion.x,
          body.quaternion.y,
          body.quaternion.z,
          body.quaternion.w,
        ),
      );
    handle.group.quaternion.copy(localQuaternion);
    const position = new THREE.Vector3(
      body.position.x,
      body.position.y,
      body.position.z,
    );
    if (parent) parent.worldToLocal(position);
    handle.group.position
      .copy(position)
      .sub(handle.com.clone().applyQuaternion(localQuaternion));
  }

  grab(handle: ShelfHandle): boolean {
    const body = handle.body;
    if (!body || !handle.com || !handle.prev) return false;
    handle.parked = false;
    handle.offscreenFor = 0;
    handle.settledFor = 0;
    body.type = this.C.Body.KINEMATIC;
    body.allowSleep = false;
    body.velocity.setZero();
    body.angularVelocity.setZero();
    // A newly detached prop moved after its collider was measured. Sync the
    // kinematic body to that cleared visual pose before collision probing.
    this.push(handle, 0);
    const pose = this.bodyPose(handle, {
      position: handle.group.position,
      quaternion: handle.group.quaternion,
    });
    handle.prev.copy(pose.position);
    handle.accepted = {
      position: handle.group.position.clone(),
      quaternion: handle.group.quaternion.clone(),
    };
    handle.lastSafe = {
      position: handle.group.position.clone(),
      quaternion: handle.group.quaternion.clone(),
    };
    handle.acceptedVelocity?.set(0, 0, 0);
    handle.gestureGeometryRevision = this.geometryRevision();
    body.wakeUp();
    physicsDiagnosticsController.publish({
      code: "held-safe",
      handle: handle.key,
    });
    return true;
  }

  private probeBody(handle: ShelfHandle, pose: HeldPose) {
    const source = handle.body!;
    const probe = new this.C.Body({
      mass: source.mass,
      type: this.C.Body.DYNAMIC,
      material: source.material ?? undefined,
    });
    source.shapes.forEach((shape, index) =>
      probe.addShape(
        shape,
        source.shapeOffsets[index],
        source.shapeOrientations[index],
      ),
    );
    const bodyPose = this.bodyPose(handle, pose);
    probe.position.set(
      bodyPose.position.x,
      bodyPose.position.y,
      bodyPose.position.z,
    );
    probe.quaternion.set(
      bodyPose.quaternion.x,
      bodyPose.quaternion.y,
      bodyPose.quaternion.z,
      bodyPose.quaternion.w,
    );
    return probe;
  }

  private contactsAt(handle: ShelfHandle, pose: HeldPose) {
    return this.probe.contacts(this.probeBody(handle, pose), handle.body);
  }

  private blockingContacts(
    handle: ShelfHandle,
    from: HeldPose,
    candidate: HeldPose,
  ) {
    const movement = candidate.position.clone().sub(from.position);
    const rotated = from.quaternion.angleTo(candidate.quaternion) > 1e-5;
    return this.contactsAt(handle, candidate).filter(
      (contact) =>
        movement.dot(this.worldNormalToParent(handle, contact.normal)) <
          -1e-6 || rotated,
    );
  }

  private worldNormalToParent(handle: ShelfHandle, normal: THREE.Vector3) {
    const parent = handle.group.parent;
    if (!parent) return normal.clone();
    return normal
      .clone()
      .applyQuaternion(
        parent.getWorldQuaternion(new THREE.Quaternion()).invert(),
      );
  }

  private blockerLabel(body: CANNON.Body) {
    const dynamic = this.handles.find((handle) => handle.body === body);
    if (dynamic) return dynamic.key;
    const tagged = body as TaggedBody;
    return tagged.generatedStatic
      ? `static:${tagged.rootId ?? body.id}`
      : `support:${tagged.rootId ?? body.id}`;
  }

  private restitutionFor(body: CANNON.Body) {
    return this.bodyRestitution.get(body.id) ?? 0;
  }

  contactRestitution(first: ShelfHandle, second: ShelfHandle | "wood") {
    if (!first.body) return null;
    const secondMaterial =
      second === "wood" ? this.woodMaterial : second.body?.material;
    if (!first.body.material || !secondMaterial) return null;
    return this.world.getContactMaterial(first.body.material, secondMaterial)
      ?.restitution;
  }

  private pushDynamicBlocker(
    handle: ShelfHandle,
    contact: ProbeContact,
    localVelocity: THREE.Vector3,
  ) {
    if (!contact.dynamic || contact.body.mass <= 0 || !handle.body) return;
    const parentQuaternion = handle.group.parent?.getWorldQuaternion(
      new THREE.Quaternion(),
    );
    const velocity = parentQuaternion
      ? localVelocity.clone().applyQuaternion(parentQuaternion)
      : localVelocity;
    const inwardSpeed = Math.max(0, -velocity.dot(contact.normal));
    if (inwardSpeed === 0) return;
    const inverseMass =
      1 / Math.max(handle.body.mass, 1e-6) + 1 / contact.body.mass;
    const impulse = inwardSpeed / inverseMass;
    contact.body.velocity.x -= (contact.normal.x * impulse) / contact.body.mass;
    contact.body.velocity.y -= (contact.normal.y * impulse) / contact.body.mass;
    contact.body.velocity.z -= (contact.normal.z * impulse) / contact.body.mass;
    contact.body.wakeUp();
    const other = this.handles.find(
      (candidate) => candidate.body === contact.body,
    );
    if (other) {
      other.parked = false;
      other.phase.current = "sim";
    }
  }

  moveHeld(
    handle: ShelfHandle,
    desiredPose: HeldPose,
    delta: number,
  ): HeldMoveResult {
    const start = handle.accepted ?? {
      position: handle.group.position.clone(),
      quaternion: handle.group.quaternion.clone(),
    };
    const runtime = physicsDiagnosticsController.getSnapshot().runtime;
    this.applyGeneratedStatics(runtime.generatedStatics);
    if (!runtime.heldCollisionProbes) {
      const accepted = {
        position: desiredPose.position.clone(),
        quaternion: desiredPose.quaternion.clone(),
      };
      const acceptedVelocity = accepted.position
        .clone()
        .sub(start.position)
        .divideScalar(Math.max(delta, 1e-4));
      handle.lastSafe = {
        position: start.position.clone(),
        quaternion: start.quaternion.clone(),
      };
      handle.accepted = {
        position: accepted.position.clone(),
        quaternion: accepted.quaternion.clone(),
      };
      handle.acceptedVelocity?.copy(acceptedVelocity);
      handle.group.position.copy(accepted.position);
      handle.group.quaternion.copy(accepted.quaternion);
      physicsDiagnosticsController.update({
        phase: "held",
        lastBlocker: null,
        helpers: this.diagnosticHelpers(
          handle,
          desiredPose,
          accepted,
          acceptedVelocity,
          [],
          [],
        ),
      });
      return {
        accepted,
        acceptedVelocity,
        blockers: [],
        normals: [],
        sliding: false,
      };
    }
    const translation = desiredPose.position.clone().sub(start.position);
    const angle = start.quaternion.angleTo(desiredPose.quaternion);
    const radius = Math.max(handle.body?.boundingRadius ?? 0, 0.01);
    const conservativeStep = Math.max(
      Math.min(
        (handle.smallestExtent ?? 0.04) / 2,
        this.smallestStaticExtent / 2,
      ),
      MIN_EXTENT / 2,
    );
    const needed = Math.max(
      1,
      Math.ceil((translation.length() + angle * radius) / conservativeStep),
    );
    const segments = Math.min(12, needed);
    const progress = Math.min(1, 12 / needed);
    const target: HeldPose = {
      position: start.position.clone().lerp(desiredPose.position, progress),
      quaternion: start.quaternion
        .clone()
        .slerp(desiredPose.quaternion, progress),
    };
    let accepted: HeldPose = {
      position: start.position.clone(),
      quaternion: start.quaternion.clone(),
    };
    const blockers = new Set<string>();
    const impulsedBodies = new Set<number>();
    const normals: THREE.Vector3[] = [];
    const contactPoints: THREE.Vector3[] = [];
    let sliding = false;
    const segmentTranslation = target.position
      .clone()
      .sub(start.position)
      .divideScalar(segments);

    for (let segment = 1; segment <= segments; segment++) {
      let candidate: HeldPose = {
        position: accepted.position.clone().add(segmentTranslation),
        quaternion: accepted.quaternion
          .clone()
          .slerp(target.quaternion, 1 / (segments - segment + 1)),
      };
      let contacts = this.blockingContacts(handle, accepted, candidate);
      if (contacts.length === 0) {
        accepted = candidate;
        continue;
      }
      const translationOnly = {
        position: candidate.position.clone(),
        quaternion: accepted.quaternion.clone(),
      };
      if (this.blockingContacts(handle, accepted, translationOnly).length === 0)
        candidate = translationOnly;
      let low = 0;
      let high = 1;
      for (let iteration = 0; iteration < 6; iteration++) {
        const mid = (low + high) / 2;
        const trial = {
          position: accepted.position.clone().lerp(candidate.position, mid),
          quaternion: accepted.quaternion
            .clone()
            .slerp(candidate.quaternion, mid),
        };
        if (this.blockingContacts(handle, accepted, trial).length) high = mid;
        else low = mid;
      }
      accepted = {
        position: accepted.position.clone().lerp(candidate.position, low),
        quaternion: accepted.quaternion
          .clone()
          .slerp(candidate.quaternion, low),
      };
      contacts = this.blockingContacts(handle, accepted, candidate);
      const incomingVelocity = candidate.position
        .clone()
        .sub(accepted.position)
        .divideScalar(Math.max(delta, 1e-4));
      for (const contact of contacts) {
        blockers.add(this.blockerLabel(contact.body));
        const localNormal = this.worldNormalToParent(handle, contact.normal);
        if (
          !normals.some((normal) => Math.abs(normal.dot(localNormal)) > 0.995)
        )
          normals.push(localNormal);
        if (!impulsedBodies.has(contact.body.id)) {
          this.pushDynamicBlocker(handle, contact, incomingVelocity);
          impulsedBodies.add(contact.body.id);
        }
        contactPoints.push(contact.point.clone());
      }
      const remainder = candidate.position.clone().sub(accepted.position);
      for (const normal of normals.slice(0, 2)) {
        const inward = remainder.dot(normal);
        if (inward < 0) remainder.addScaledVector(normal, -inward);
      }
      if (remainder.lengthSq() > 1e-10) {
        const slidePose = {
          position: accepted.position.clone().add(remainder),
          quaternion: accepted.quaternion.clone(),
        };
        if (this.blockingContacts(handle, accepted, slidePose).length === 0) {
          accepted = slidePose;
          sliding = true;
        }
      }
    }
    const acceptedVelocity = accepted.position
      .clone()
      .sub(start.position)
      .divideScalar(Math.max(delta, 1e-4));
    handle.lastSafe = {
      position: start.position.clone(),
      quaternion: start.quaternion.clone(),
    };
    handle.accepted = {
      position: accepted.position.clone(),
      quaternion: accepted.quaternion.clone(),
    };
    handle.acceptedVelocity?.copy(acceptedVelocity);
    handle.group.position.copy(accepted.position);
    handle.group.quaternion.copy(accepted.quaternion);
    const code: PhysicsReasonCode = blockers.size
      ? [...blockers].some(
          (blocker) =>
            !blocker.startsWith("static:") && !blocker.startsWith("support:"),
        )
        ? "blocked-dynamic"
        : "blocked-static"
      : "held-safe";
    physicsDiagnosticsController.update({
      phase: "held",
      lastBlocker: [...blockers][0] ?? null,
      helpers: this.diagnosticHelpers(
        handle,
        desiredPose,
        accepted,
        acceptedVelocity,
        contactPoints,
        normals,
      ),
    });
    if (blockers.size)
      physicsDiagnosticsController.publish({ code, handle: handle.key });
    return {
      accepted,
      acceptedVelocity,
      blockers: [...blockers],
      normals,
      sliding,
    };
  }

  private diagnosticHelpers(
    handle: ShelfHandle,
    desired: HeldPose,
    accepted: HeldPose,
    velocity: THREE.Vector3,
    contacts: THREE.Vector3[],
    normals: THREE.Vector3[],
  ) {
    const toWorld = (point: THREE.Vector3) =>
      handle.group.parent
        ? handle.group.parent.localToWorld(point.clone())
        : point.clone();
    const bodyPose = this.bodyPose(handle, accepted);
    const hulls = handle.body!.shapes.flatMap((shape, index) => {
      if (!(shape instanceof this.C.Box)) return [];
      const offset = handle.body!.shapeOffsets[index]!;
      const orientation = handle.body!.shapeOrientations[index]!;
      const bodyQuaternion = bodyPose.quaternion;
      return [
        {
          position: new THREE.Vector3(offset.x, offset.y, offset.z)
            .applyQuaternion(bodyQuaternion)
            .add(bodyPose.position)
            .toArray(),
          quaternion: new THREE.Quaternion(
            orientation.x,
            orientation.y,
            orientation.z,
            orientation.w,
          )
            .premultiply(bodyQuaternion)
            .toArray(),
          halfExtents: shape.halfExtents.toArray(),
        },
      ];
    });
    return {
      desired: toWorld(desired.position).toArray(),
      accepted: toWorld(accepted.position).toArray(),
      lastSafe: handle.lastSafe
        ? toWorld(handle.lastSafe.position).toArray()
        : null,
      velocity: velocity
        .clone()
        .applyQuaternion(this.parentPose(handle).quaternion)
        .toArray(),
      contacts: contacts.map((point) => point.toArray()),
      normals: normals.map((normal, index) => ({
        origin: (contacts[index] ?? toWorld(accepted.position)).toArray(),
        direction: normal
          .clone()
          .applyQuaternion(this.parentPose(handle).quaternion)
          .toArray(),
      })),
      hulls,
    };
  }

  release(handle: ShelfHandle, velocity: THREE.Vector3): boolean {
    const body = handle.body;
    if (!body) return false;
    this.push(handle, 0);
    body.type = this.C.Body.DYNAMIC;
    body.allowSleep = false;
    if (handle.meadowImpactListener)
      body.removeEventListener("collide", handle.meadowImpactListener);
    let firstCollision = true;
    const onImpact = (event?: { contact?: CANNON.ContactEquation }) => {
      const contact = event?.contact;
      if (firstCollision) {
        firstCollision = false;
        body.allowSleep = true;
      }
      const other = contact
        ? ((contact.bi === body ? contact.bj : contact.bi) as TaggedBody)
        : null;
      if (other?.rootId !== "scene:ground") return;
      const speed = body.velocity.length();
      if (contact && speed >= 0.3) {
        const offset = contact.bi === body ? contact.ri : contact.rj;
        const horizontalSpeed = Math.hypot(body.velocity.x, body.velocity.z);
        const response = meadowPhysicalResponse({
          normalSpeed: Math.abs(body.velocity.y),
          tangentSpeed: horizontalSpeed,
          massKg: handle.massKg ?? body.mass / SCENE_MASS_PER_KG,
          footprint: handle.meadowFootprint ?? horizontalFootprint(body),
        });
        const contactX = body.position.x + offset.x;
        const contactZ = body.position.z + offset.z;
        publishMeadowPhysicalEvent({
          kind: "impact",
          startX: contactX,
          startZ: contactZ,
          endX: contactX,
          endZ: contactZ,
          y: body.position.y + offset.y,
          directionX:
            horizontalSpeed > 1e-5 ? body.velocity.x / horizontalSpeed : 0,
          directionZ:
            horizontalSpeed > 1e-5 ? body.velocity.z / horizontalSpeed : 0,
          ...response,
        });
      }
      handle.meadowTrailX = body.position.x;
      handle.meadowTrailZ = body.position.z;
      handle.meadowTrailFor = 0;
      body.removeEventListener("collide", onImpact);
      if (handle.meadowImpactListener === onImpact)
        handle.meadowImpactListener = undefined;
    };
    handle.meadowImpactListener = onImpact;
    body.addEventListener("collide", onImpact);
    body.wakeUp();
    const requestedSpeed = velocity.length();
    const maxSpeed = handle.maxThrowSpeed ?? DEFAULT_MAX_THROW;
    const releaseVelocity = velocity.clone();
    if (requestedSpeed > maxSpeed)
      releaseVelocity.multiplyScalar(maxSpeed / requestedSpeed);
    const parentQuaternion = this.parentPose(handle).quaternion;
    const worldVelocity = releaseVelocity
      .clone()
      .applyQuaternion(parentQuaternion);
    body.velocity.set(worldVelocity.x, worldVelocity.y, worldVelocity.z);
    const radius = this.balls.get(body.id);
    if (radius !== undefined) {
      const [spinX, spinY, spinZ] = ballReleaseSpin(worldVelocity, radius);
      body.angularVelocity.set(spinX, spinY, spinZ);
    } else {
      body.angularVelocity.set(
        worldVelocity.z * TUMBLE,
        worldVelocity.x * handle.spin,
        -worldVelocity.x * TUMBLE,
      );
    }
    handle.parked = false;
    handle.offscreenFor = 0;
    handle.settledFor = 0;
    handle.phase.current = "sim";
    physicsDiagnosticsController.update({
      requestedReleaseSpeed: requestedSpeed,
      acceptedReleaseSpeed: worldVelocity.length(),
    });
    physicsDiagnosticsController.publish({
      code: "held-safe",
      handle: handle.key,
      detail: `released ${requestedSpeed.toFixed(2)}→${worldVelocity.length().toFixed(2)}`,
    });
    return true;
  }

  /** Wake a parked prop with a mass-aware world-space impulse. Unlike a hand
   * release, the hit lands above the centre of mass and guarantees enough
   * angular speed for a standing plaque or medallion to topple visibly. */
  knock(handle: ShelfHandle, requestedWorldVelocity: THREE.Vector3): boolean {
    const worldVelocity = requestedWorldVelocity.clone();
    if (worldVelocity.length() > SHOCKWAVE_MAX_SPEED)
      worldVelocity.setLength(SHOCKWAVE_MAX_SPEED);
    if (!this.release(handle, new THREE.Vector3())) return false;
    const body = handle.body;
    if (!body) return false;
    const contactHeight = Math.max(
      0.04,
      (handle.smallestExtent ?? 0.12) * 0.45,
    );
    body.applyImpulse(
      new this.C.Vec3(
        worldVelocity.x * body.mass,
        worldVelocity.y * body.mass,
        worldVelocity.z * body.mass,
      ),
      new this.C.Vec3(0, contactHeight, 0),
    );
    const horizontal = Math.hypot(worldVelocity.x, worldVelocity.z);
    if (horizontal > 1e-5) {
      body.angularVelocity.x +=
        (worldVelocity.z / horizontal) * SHOCKWAVE_TOPPLE_SPEED;
      body.angularVelocity.z -=
        (worldVelocity.x / horizontal) * SHOCKWAVE_TOPPLE_SPEED;
    }
    body.wakeUp();
    return true;
  }

  park(handle: ShelfHandle, snapVisual = false) {
    const body = handle.body;
    if (!body || !handle.com) return;
    if (handle.meadowImpactListener) {
      body.removeEventListener("collide", handle.meadowImpactListener);
      handle.meadowImpactListener = undefined;
    }
    handle.meadowTrailX = undefined;
    handle.meadowTrailZ = undefined;
    handle.meadowTrailFor = 0;
    if (snapVisual) {
      handle.group.position.copy(handle.base);
      handle.group.quaternion.identity();
    }
    const pose = this.bodyPose(handle, {
      position: handle.base,
      quaternion: new THREE.Quaternion(),
    });
    body.type = this.C.Body.DYNAMIC;
    body.allowSleep = true;
    body.position.set(pose.position.x, pose.position.y, pose.position.z);
    body.quaternion.set(
      pose.quaternion.x,
      pose.quaternion.y,
      pose.quaternion.z,
      pose.quaternion.w,
    );
    body.velocity.setZero();
    body.angularVelocity.setZero();
    body.force.setZero();
    body.torque.setZero();
    body.aabbNeedsUpdate = true;
    handle.prev?.copy(pose.position);
    handle.parked = true;
    handle.offscreenFor = 0;
    handle.settledFor = 0;
    body.sleep();
  }

  private promoteSettledBodyToSleep(
    handle: ShelfHandle,
    body: CANNON.Body,
    delta: number,
  ) {
    const supported = this.world.contacts.some(
      (contact) => contact.bi === body || contact.bj === body,
    );
    const settled =
      body.allowSleep &&
      supported &&
      body.velocity.length() <= SETTLED_LINEAR_SPEED &&
      body.angularVelocity.length() <= SETTLED_ANGULAR_SPEED;
    if (!settled) {
      handle.settledFor = 0;
      return;
    }
    handle.settledFor = (handle.settledFor ?? 0) + delta;
    if (handle.settledFor >= SETTLED_SLEEP_SECONDS) body.sleep();
  }

  tick(delta: number, stamp: number, camera?: THREE.Camera) {
    if (stamp === this.stamp) return;
    this.stamp = stamp;
    const started =
      typeof performance === "undefined" ? Date.now() : performance.now();
    const runtime = physicsDiagnosticsController.getSnapshot().runtime;
    this.applyGeneratedStatics(runtime.generatedStatics);
    const sleeping = this.C.Body.SLEEPING;
    let live = false;
    for (const handle of this.handles) {
      const body = handle.body;
      if (!body) continue;
      if (
        handle.parked &&
        sceneUnitActivityController.stateFor(handle.unitIndex) === "cold"
      )
        continue;
      if (handle.phase.current === "sim") {
        if (body.sleepState !== sleeping) live = true;
        continue;
      }
      if (handle.parked) continue;
      if (body.type !== this.C.Body.KINEMATIC) {
        body.type = this.C.Body.KINEMATIC;
        body.allowSleep = false;
      }
      this.push(handle, delta);
      live = true;
    }
    const stepStarted =
      typeof performance === "undefined" ? Date.now() : performance.now();
    const thinFastBody = this.handles.some(
      (handle) =>
        handle.phase.current === "sim" &&
        (handle.smallestExtent ?? Number.POSITIVE_INFINITY) <=
          THIN_BODY_CCD_EXTENT &&
        (handle.body?.velocity.length() ?? 0) >= THIN_BODY_CCD_SPEED,
    );
    if (live && runtime.simulation) {
      const step = freeBodyStepPolicy(thinFastBody);
      this.world.step(step.fixedStep, delta, step.maxSubSteps);
    }
    const stepFinished =
      typeof performance === "undefined" ? Date.now() : performance.now();
    if (live && runtime.simulation) this.updateMeadowTrails(delta);
    if (process.env.NODE_ENV !== "production" && live && runtime.simulation)
      this.logContacts();
    for (const handle of this.handles) {
      const body = handle.body;
      if (!body) continue;
      if (
        handle.parked &&
        sceneUnitActivityController.stateFor(handle.unitIndex) === "cold"
      )
        continue;
      if (handle.phase.current === "sim") {
        if (!runtime.simulation) {
          handle.offscreenFor = 0;
          continue;
        }
        if (body.sleepState !== sleeping)
          this.promoteSettledBodyToSleep(handle, body, delta);
        if (this.escaped(body)) {
          this.park(handle, true);
          handle.phase.current = "rest";
          continue;
        }
        this.pull(handle);
        if (body.sleepState !== sleeping || !camera) {
          handle.offscreenFor = 0;
        } else if (!runtime.visibilityResets) {
          handle.offscreenFor = 0;
        } else if (this.visible(body, camera)) {
          handle.offscreenFor = 0;
        } else {
          handle.offscreenFor = (handle.offscreenFor ?? 0) + delta;
          if (handle.offscreenFor >= OFFSCREEN_RESET_SECONDS) {
            this.park(handle, true);
            handle.phase.current = "rest";
          }
        }
        continue;
      }
      if (handle.parked) {
        if (body.sleepState !== sleeping) {
          handle.parked = false;
          handle.phase.current = "sim";
          this.pull(handle);
        }
        continue;
      }
      this.push(handle, 0);
    }
    const pendingReset = this.handles.find(
      (handle) => (handle.offscreenFor ?? 0) > 0,
    );
    physicsDiagnosticsController.update({
      visibilityResetState: pendingReset
        ? `${pendingReset.key}:pending:${pendingReset.offscreenFor!.toFixed(2)}`
        : runtime.visibilityResets
          ? "clear"
          : "disabled",
    });
    const finished =
      typeof performance === "undefined" ? Date.now() : performance.now();
    const frameMs = finished - started;
    const stepMs = stepFinished - stepStarted;
    this.timingPeak = Math.max(this.timingPeak, frameMs);
    physicsDiagnosticsController.recordTiming(frameMs, stepMs, this.timingPeak);
    if (finished - this.lastTimingPublish >= 500) {
      physicsDiagnosticsController.update({
        timing: {
          frameMs,
          stepMs,
          peakMs: this.timingPeak,
        },
      });
      this.lastTimingPublish = finished;
      this.timingPeak = 0;
    }
  }

  private applyGeneratedStatics(enabled: boolean) {
    if (enabled === this.generatedStaticsEnabled) return;
    this.generatedStaticsEnabled = enabled;
    for (const state of this.rootStatics.values())
      for (const body of state.bodies) body.collisionResponse = enabled;
  }

  private updateMeadowTrails(delta: number) {
    this.groundedBodyIds.clear();
    for (const contact of this.world.contacts) {
      const first = contact.bi as TaggedBody;
      const second = contact.bj as TaggedBody;
      if (first.rootId === "scene:ground") this.groundedBodyIds.add(second.id);
      else if (second.rootId === "scene:ground")
        this.groundedBodyIds.add(first.id);
    }
    let emitters = 0;
    for (const handle of this.handles) {
      const body = handle.body;
      if (!body || handle.phase.current !== "sim") continue;
      const tangentSpeed = Math.hypot(body.velocity.x, body.velocity.z);
      const grounded = this.groundedBodyIds.has(body.id);
      if (!grounded || tangentSpeed < MEADOW_TRAIL.minSpeed) {
        handle.meadowTrailX = body.position.x;
        handle.meadowTrailZ = body.position.z;
        handle.meadowTrailFor = 0;
        continue;
      }
      handle.meadowTrailFor = (handle.meadowTrailFor ?? 0) + delta;
      const lastX = handle.meadowTrailX ?? body.position.x;
      const lastZ = handle.meadowTrailZ ?? body.position.z;
      const distance = Math.hypot(
        body.position.x - lastX,
        body.position.z - lastZ,
      );
      if (
        emitters >= MEADOW_TRAIL.maxGenericEmitters ||
        !meadowTrailReady(handle.meadowTrailFor, distance, tangentSpeed)
      )
        continue;
      const response = meadowPhysicalResponse({
        normalSpeed: 0,
        tangentSpeed,
        massKg: handle.massKg ?? body.mass / SCENE_MASS_PER_KG,
        footprint: handle.meadowFootprint ?? horizontalFootprint(body),
        trailing: true,
      });
      publishMeadowPhysicalEvent({
        kind: "trail",
        startX: lastX,
        startZ: lastZ,
        endX: body.position.x,
        endZ: body.position.z,
        y: SHELF_GEOMETRY.groundY,
        directionX: body.velocity.x / tangentSpeed,
        directionZ: body.velocity.z / tangentSpeed,
        ...response,
      });
      handle.meadowTrailX = body.position.x;
      handle.meadowTrailZ = body.position.z;
      handle.meadowTrailFor = 0;
      emitters += 1;
    }
  }

  private visible(body: CANNON.Body, camera: THREE.Camera) {
    camera.updateWorldMatrix(true, false);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      matrixScratch.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    );
    const point = new THREE.Vector3(
      body.position.x,
      body.position.y,
      body.position.z,
    );
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
    const margin =
      body.boundingRadius + cameraPosition.distanceTo(point) * 0.15;
    return frustum.planes.every(
      (plane) => plane.distanceToPoint(point) >= -margin,
    );
  }

  private escaped(body: CANNON.Body) {
    const point = new THREE.Vector3(
      body.position.x,
      body.position.y,
      body.position.z,
    );
    return (
      !Number.isFinite(body.position.x + body.position.y + body.position.z) ||
      !this.safetyBounds.containsPoint(point)
    );
  }

  private logContacts() {
    for (const contact of this.world.contacts) {
      this.noteContact(contact.bi, contact.bj);
      this.noteContact(contact.bj, contact.bi);
    }
  }

  private noteContact(a: CANNON.Body, b: CANNON.Body) {
    const handle = this.handles.find((candidate) => candidate.body === a);
    if (!handle || (b as TaggedBody).authoredSupport) return;
    const other = this.handles.find((candidate) => candidate.body === b);
    const otherUnit = other?.unitIndex ?? (b as TaggedBody).unitIndex;
    const crossUnit = otherUnit !== undefined && otherUnit !== handle.unitIndex;
    if (this.contacts.length > 200) this.contacts.shift();
    this.contacts.push({
      key: handle.key,
      at: a.position.toArray(),
      neighbour: b.position.toArray(),
      crossUnit,
    });
    if (crossUnit)
      physicsDiagnosticsController.publish({
        code: "cross-unit-contact",
        handle: handle.key,
        detail: String(otherUnit),
      });
  }

  private geometryRevision() {
    return JSON.stringify(
      [...this.rootStatics]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, state]) => [id, state.signature]),
    );
  }

  publishDiagnostics(active?: ShelfHandle) {
    physicsDiagnosticsController.update({
      activeWorld: "scene",
      plane:
        active?.plane ?? resolveShelf(active?.group ?? new THREE.Group()).plane,
      gravity: GRAVITY,
      broadphase: "SAP:x",
      geometryRevision: this.geometryRevision(),
      rootGeometry: [...this.rootStatics].map(([root, state]) => ({
        root,
        revision: state.signature,
        staticCount: state.count,
      })),
      readyHandles: this.handles
        .filter((handle) => handle.body)
        .map((handle) => handle.key),
      pendingHandles: this.handles
        .filter((handle) => !handle.body)
        .map((handle) => handle.key),
      bodyCount: this.handles.filter((handle) => handle.body).length,
      staticCount:
        this.authoredStatics.length +
        [...this.rootStatics.values()].reduce(
          (sum, state) => sum + state.count,
          0,
        ),
      hullFallbacks: this.handles.flatMap((handle) =>
        (handle.hullReasons ?? []).map((code) => ({
          handle: handle.key,
          code,
        })),
      ),
      phase: active?.phase.current ?? null,
      sleepState: active?.body ? String(active.body.sleepState) : null,
      authoredSurface:
        active?.plane ?? resolveShelf(active?.group ?? new THREE.Group()).plane,
    });
  }

  report() {
    const neighbours = [...this.rootStatics.values()].flatMap((state) =>
      state.bodies.flatMap((body) => {
        const shape = body.shapes[0];
        return shape instanceof this.C.Box
          ? [
              {
                position: body.position.toArray(),
                half: shape.halfExtents.toArray(),
              },
            ]
          : [];
      }),
    );
    return {
      bodies: this.world.bodies.length,
      plane: "scene",
      broadphase: this.world.broadphase.constructor.name,
      broadphaseAxis: (this.world.broadphase as CANNON.SAPBroadphase).axisIndex,
      probeBroadphaseQueries: this.probe.queries,
      gravity: GRAVITY,
      geometryRevision: this.geometryRevision(),
      rootGeometry: [...this.rootStatics].map(([root, state]) => ({
        root,
        revision: state.signature,
        staticCount: state.count,
        reasons: state.reasons,
      })),
      authoredStatics: this.authoredStatics.length,
      neighbours,
      contacts: this.contacts,
      safetyBounds: [
        this.safetyBounds.min.toArray(),
        this.safetyBounds.max.toArray(),
      ],
      props: this.handles.map((handle) => ({
        key: handle.key,
        unit: handle.unitIndex,
        authoredSurface: handle.plane ?? resolveShelf(handle.group).plane,
        phase: handle.phase.current,
        parked: !!handle.parked,
        offscreenFor: handle.offscreenFor ?? 0,
        body: handle.body
          ? {
              type: handle.body.type,
              shape: this.balls.has(handle.body.id) ? "sphere" : "box",
              shapeCount: handle.body.shapes.length,
              radius: this.balls.get(handle.body.id) ?? null,
              asleep: handle.body.sleepState === this.C.Body.SLEEPING,
              position: handle.body.position.toArray(),
              velocity: handle.body.velocity.toArray(),
              spin: handle.body.angularVelocity.length(),
              mass: handle.body.mass,
              restitution: this.restitutionFor(handle.body),
              com: handle.com?.toArray(),
            }
          : null,
        group: handle.group.position.toArray(),
      })),
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unregisterFrameDriver();
    for (const handle of [...this.handles]) this.drop(handle);
    for (const body of [...this.world.bodies]) this.world.removeBody(body);
    this.rootStatics.clear();
    this.authoredStatics.length = 0;
    this.authoredByRoot.clear();
  }
}
