"use client";

// Real rigid bodies for carried props — a solver the homepage never
// downloads unless someone reaches for something.
//
// Why this exists at all: the authored carry in Grabbable.tsx can fake a
// drop, but it cannot fake CONTACT. A mug thrown at the paper stack passed
// through it, and a mug set down on its side stood back up, because a spring
// to an authored pose is the only thing the old settle knew how to do. The
// whole point of picking something up is that the shelf answers back.
//
// Why cannon-es and not Rapier: measured by packing each candidate and
// gzipping the shipped ESM —
//   @dimforge/rapier3d-compat  1058 KB   (base64 wasm inlined)
//   @react-three/cannon         ~366 KB   (worker bundle + debug + cjs)
//   cannon-es                     73 KB
// against a 180 KB homepage budget. Rapier is six times the whole page for
// an interaction most visitors never trigger. @react-three/cannon's worker
// costs five times the solver it wraps, and this scene has ~11 bodies, which
// step in tens of microseconds on the main thread — a worker would add a
// frame of latency to buy back nothing.
//
// Why the bytes stay out of the initial chunk: nothing imports this module
// statically. Grabbable reaches it through `import("./physics")`, and this
// module reaches the solver through `import("cannon-es")`, so webpack parks
// both in an async chunk that is fetched on the first hover of a grabbable
// prop and never at all on touch or on a degraded machine.
//
// Scene conventions this module inherits, and must not break:
// - Local y = 0 IS the contact surface (the shelf wood). Every body lives in
//   the Grabbable's PARENT space — the `<group position={[0, SHELF.x, 0]}>`
//   inside ShelfUnit — which is a translation plus a yaw off world, so world
//   −Y and local −Y are the same direction and gravity needs no conversion.
// - A Grabbable's group origin sits ON the wood, not at the prop's centre.
//   Bodies are positioned by their centre of mass, so every handle carries
//   the offset between the two (`com`) and the two conversions below.
// - The scene casts no shadows; contact is a sprite each Grabbable drives off
//   its own group position. Anything that moves a group here therefore moves
//   its shade for free, which is why physics writes group transforms rather
//   than driving meshes directly.
//
// Known limit, so nobody rediscovers it: every hull is a BOX off the model's
// AABB, and props that are mostly air disagree with it. The mug is the worst
// case in the scene — a 0.19-tall cup inside a 0.42-tall box, because it is
// really a desk caddy with scissors sticking out. Standing, sliding and
// leaning all look right, because the box's bottom face is where the cup's
// bottom face is. THROW it hard enough to end up tipped on top of a
// neighbour, though, and it rests on a box corner about 4 cm outside the
// geometry you can see. A vertex-height percentile was measured as the fix
// and rejected: 95% of that model's 1326 vertices are already below 0.34 of
// its height (the tools are finely tessellated), so a percentile hull trims
// 18% — nowhere near the 55% the artefact needs. The real fix is a per-prop
// hull hint, and it is not worth a prop-by-prop table for one pose.
import * as THREE from "three";
import type * as CANNON from "cannon-es";

/** Exactly the runtime surface this module uses. Spelled out rather than
 * `typeof import("cannon-es")` so the only reference to the package that
 * survives compilation is the dynamic import in `warm()`. */
type CannonModule = {
  World: typeof CANNON.World;
  Body: typeof CANNON.Body;
  Vec3: typeof CANNON.Vec3;
  Box: typeof CANNON.Box;
  Plane: typeof CANNON.Plane;
};

/** Matches Grabbable's authored GRAVITY. Deliberately under 9.81: a prop
 * dropped 20 cm at real gravity lands in under a fifth of a second, which
 * reads as a glitch rather than a drop. Both paths share the number so a
 * drag that fell back to the authored motion falls at the same rate as a
 * simulated one. */
const GRAVITY = 3.4;

/** Collision boxes come off the rendered geometry's AABB, which for a model
 * with any silhouette at all is wider than the thing you can see — the mug is
 * a desk caddy whose box is mostly the air around a pair of scissors, and at
 * full width two props stop with a visible gap between them.
 *
 * HORIZONTAL ONLY. Shrinking y as well cost the prop the one contact the eye
 * actually checks: 10% off a 0.38-tall mug left it resting 2 cm sunk into the
 * wood, on a shelf where local y = 0 IS the surface. Vertical extents stay
 * exact so a settled prop sits on the plank, not in it. */
const HULL_SHRINK = 0.9;

/** Mass per cubic scene-unit.
 *
 * The number that matters is not realism, it is the LOAD the solver sees:
 * cannon's contact stiffness and relaxation defaults are tuned around a
 * kilogram-scale body under 9.81 gravity, i.e. roughly 10 N. This scene is
 * not in metres — the mug's hull is 0.27 × 0.42 × 0.27 "units" — and at a
 * plausible-sounding 320 that box weighed 9.7 kg, which under soft contacts
 * sank in and got popped back out every step. The rocking after a set-down
 * GREW instead of damping, and the prop settled leaning at 20°. 90 puts a
 * prop at ~2.7 kg × 3.4 g ≈ 9 N, back in the range the defaults expect. */
const DENSITY = 90;

/** Where the centre of mass sits up the box, as a fraction of its height.
 *
 * NOT 0.5, and this is the difference between a prop you can put down and one
 * that falls over every time. cannon treats the body origin as the centre of
 * mass, so a uniform box puts the mug's mass halfway up a pair of SCISSORS —
 * the model is a desk caddy, and its silhouette is mostly the tools sticking
 * out of it. Set that mug down gently from carry height and it toppled on
 * every attempt. Everything that stands on a shelf is bottom-heavy for the
 * same reason the shelf works: a mug is a heavy cup with light things in it,
 * a lamp is a base with a shade, a plant is a pot with leaves. */
const COM_FRACTION = 0.35;

/** A throw is measured from the prop's real per-frame movement, so a violent
 * flick can hand the solver an absurd number. Cap it at something a hand
 * could actually do. */
const MAX_THROW = 4;

/** Horizontal throw → tumble. Real rolling would be v/radius (~40 rad/s on a
 * 5 cm prop), which reads as a blur; this is the legible fraction of it.
 * Higher than this and a hard flick reliably ends with the prop upside down,
 * which is a real outcome but not the one a thrown mug usually has. */
const TUMBLE = 0.9;

/** Skip anything smaller than a sliver (degenerate helpers) or bigger than a
 * prop (a group that has swallowed the whole shelf). */
const MIN_EXTENT = 0.008;
const MAX_EXTENT = 2.5;

export type Phase = "rest" | "held" | "settling" | "sim";

/** The shared object between a Grabbable and its body. Grabbable owns the
 * fields above the line and keeps them current; the world owns the rest. */
export type ShelfHandle = {
  key: string;
  unitIndex: number;
  group: THREE.Group;
  /** Authored pose, refreshed each frame from the component's props. */
  base: THREE.Vector3;
  spin: number;
  /** Shared ref, not a copy: the world flips it to "sim" the moment a body
   * it owns is knocked awake by someone else's throw, and the owning
   * Grabbable stops authoring that prop's transform on the next frame. */
  phase: { current: Phase };
  // ---- owned by the world ----
  world?: ShelfWorld;
  body?: CANNON.Body;
  /** Group origin → collision-box centre, in group-local coords. */
  com?: THREE.Vector3;
  /** True while the body sits at base: dynamic, asleep, waiting to be hit. */
  parked?: boolean;
  /** Last pushed body position, so a kinematically-carried body reports a
   * real velocity to the solver and can shove its neighbours. */
  prev?: THREE.Vector3;
};

let CANNON_MOD: CannonModule | null = null;
let pending: Promise<boolean> | null = null;

/** Fetch the solver. Safe to call repeatedly; the second caller joins the
 * first one's request. A failed fetch resolves false rather than throwing —
 * a prop you cannot throw realistically is still a prop you can pick up. */
export function warm(): Promise<boolean> {
  if (CANNON_MOD) return Promise.resolve(true);
  pending ??= import("cannon-es")
    .then((mod) => {
      CANNON_MOD = mod;
      return true;
    })
    .catch(() => false);
  return pending;
}

// ---------------------------------------------------------------------------
// Bounding boxes
// ---------------------------------------------------------------------------

const boxScratch = new THREE.Box3();
const matScratch = new THREE.Matrix4();
/** Separate from matScratch on purpose: boxIn() uses matScratch per child, so
 * a caller that built its frame matrix there would have it overwritten on the
 * first mesh it walked. */
const invScratch = new THREE.Matrix4();
const vecScratch = new THREE.Vector3();
const quatScratch = new THREE.Quaternion();
const sizeScratch = new THREE.Vector3();

/** AABB of `obj`'s renderable geometry expressed in the frame `invFrame`
 * takes world space into.
 *
 * Deliberately not `Box3.setFromObject`: that walks sprites too, and half the
 * things standing on these shelves carry a ContactShade billboard as a child.
 * A 0.55-wide shade sprite next to a 0.42-wide paper stack grew the stack's
 * box by 6 cm on the near side — an invisible bumper the mug bounced off. */
function boxIn(obj: THREE.Object3D, invFrame: THREE.Matrix4): THREE.Box3 | null {
  obj.updateWorldMatrix(true, true);
  const out = new THREE.Box3();
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !child.visible) return;
    const geometry = mesh.geometry;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;
    boxScratch.copy(geometry.boundingBox);
    matScratch.multiplyMatrices(invFrame, child.matrixWorld);
    boxScratch.applyMatrix4(matScratch);
    out.union(boxScratch);
  });
  if (out.isEmpty()) return null;
  out.getSize(sizeScratch);
  const min = Math.min(sizeScratch.x, sizeScratch.y, sizeScratch.z);
  const max = Math.max(sizeScratch.x, sizeScratch.y, sizeScratch.z);
  if (min < MIN_EXTENT || max > MAX_EXTENT) return null;
  return out;
}

/** Same box, in the object's OWN local frame — independent of where the
 * object currently sits, so a prop that is already knocked over still
 * measures the shape it had standing up. */
function localBox(obj: THREE.Object3D): THREE.Box3 | null {
  obj.updateWorldMatrix(true, true);
  return boxIn(obj, invScratch.copy(obj.matrixWorld).invert());
}

// ---------------------------------------------------------------------------
// One world per shelf
// ---------------------------------------------------------------------------

const worlds = new WeakMap<THREE.Object3D, ShelfWorld>();

/** The world for the shelf `parent` belongs to, built on first use from every
 * handle standing on it. Cached against the group itself, so it dies with the
 * scene and survives every travel in between — which is what lets a prop stay
 * knocked over while you are looking at it. */
export function worldFor(
  parent: THREE.Object3D,
  handles: Iterable<ShelfHandle>,
): ShelfWorld | null {
  if (!CANNON_MOD) return null;
  const mine: ShelfHandle[] = [];
  for (const handle of handles)
    if (handle.group.parent === parent) mine.push(handle);
  let world = worlds.get(parent);
  if (!world) {
    world = new ShelfWorld(CANNON_MOD, parent, mine);
    worlds.set(parent, world);
  } else {
    // A Grabbable that mounted after the world was built (a hot reload, or a
    // unit that grew a prop) still gets a body.
    for (const handle of mine) world.adopt(handle);
  }
  return world;
}

export class ShelfWorld {
  private readonly C: CannonModule;
  private readonly world: CANNON.World;
  private readonly parent: THREE.Object3D;
  readonly handles: ShelfHandle[] = [];
  /** clock.elapsedTime of the last step — every Grabbable on the shelf calls
   * tick(), only the first one in a frame does the work. */
  private stamp = -1;
  /** Dev-only contact log. "Did it collide or did it spring" is a question
   * the solver can answer directly, and a trajectory that merely looks like a
   * bounce is not the same as cannon reporting the pair. Compiled out of
   * production by the NODE_ENV guard at its only write site. */
  private contacts: { key: string; at: number[]; neighbour: number[] }[] = [];

  constructor(
    C: CannonModule,
    parent: THREE.Object3D,
    handles: ShelfHandle[],
  ) {
    this.C = C;
    this.parent = parent;
    this.world = new C.World({
      gravity: new C.Vec3(0, -GRAVITY, 0),
      allowSleep: true,
    });
    // Wood: grippy, barely bouncy. A prop that bounces reads as plastic, and
    // friction is what makes a thrown mug tumble instead of skate.
    //
    // The coefficient is high on purpose. Sliding friction decelerates at μg,
    // and this world's g is 3.4 rather than 9.81, so a physically ordinary
    // μ=0.45 gave a prop thrown at 1.9 u/s a 1.2-unit slide — the full width
    // of the shelf, and it read as ice. 0.75 plus real damping restores the
    // deceleration wood would have applied under real gravity, which is the
    // number the eye is actually judging.
    this.world.defaultContactMaterial.friction = 0.75;
    this.world.defaultContactMaterial.restitution = 0.05;
    // Contact stiffness, relaxation and solver iterations are left at
    // cannon's defaults ON PURPOSE. Softening them was the first attempt at
    // taming the ejection when a prop is released inside a neighbour, and it
    // made every landing mushy — the real fix for that is standUp() below,
    // and the real fix for the mush was DENSITY. Eleven bodies do not need a
    // cheaper solver.

    // The wood. An infinite half-space rather than a plank-shaped box, on
    // purpose: a prop that falls off the front edge is a prop the visitor
    // cannot reach again until they walk away, and "come back in a minute"
    // is not an interaction.
    const ground = new C.Body({ type: C.Body.STATIC, shape: new C.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);

    // …and invisible half-spaces at the plank's own edges, so nothing slides
    // out over open air instead. Footprints from ShelfUnit in primitives.tsx:
    // top plank 3.2 × 0.85 centred at z 0, lower plank 3.2 × 0.6 at z −0.08.
    // The two shelves sit 0.73 apart, so the sign of y is enough to tell them
    // apart without importing the layout.
    const lower = parent.position.y < -0.3;
    const zNear = lower ? 0.19 : 0.39;
    const zFar = lower ? -0.35 : -0.39;
    for (const [pos, euler] of [
      [new C.Vec3(-1.57, 0, 0), new C.Vec3(0, Math.PI / 2, 0)],
      [new C.Vec3(1.57, 0, 0), new C.Vec3(0, -Math.PI / 2, 0)],
      [new C.Vec3(0, 0, zFar), new C.Vec3(0, 0, 0)],
      [new C.Vec3(0, 0, zNear), new C.Vec3(0, Math.PI, 0)],
    ] as const) {
      const wall = new C.Body({ type: C.Body.STATIC, shape: new C.Plane() });
      wall.position.copy(pos);
      wall.quaternion.setFromEuler(euler.x, euler.y, euler.z);
      this.world.addBody(wall);
    }

    for (const handle of handles) this.adopt(handle);
    this.addNeighbours();
  }

  /** Give a Grabbable a dynamic body, parked at its authored pose. */
  adopt(handle: ShelfHandle) {
    if (this.handles.includes(handle)) return;
    const C = this.C;
    const box = localBox(handle.group);
    this.handles.push(handle);
    handle.world = this;
    if (!box) return; // model still streaming in — authored motion covers it
    const centre = box.getCenter(new THREE.Vector3());
    box.getSize(sizeScratch).multiplyScalar(0.5);
    sizeScratch.x *= HULL_SHRINK;
    sizeScratch.z *= HULL_SHRINK;
    const volume = sizeScratch.x * sizeScratch.y * sizeScratch.z * 8;
    // The body's origin is its centre of mass, so the hull hangs off it at an
    // offset rather than the other way round.
    const com = centre.clone();
    com.y = box.min.y + (box.max.y - box.min.y) * COM_FRACTION;
    const body = new C.Body({
      mass: Math.max(0.08, volume * DENSITY),
      // Wood eats energy. Without this a knocked prop skates for a second
      // and a half, which looks like ice rather than a shelf.
      linearDamping: 0.5,
      angularDamping: 0.6,
    });
    body.addShape(
      new C.Box(new C.Vec3(sizeScratch.x, sizeScratch.y, sizeScratch.z)),
      new C.Vec3(0, centre.y - com.y, 0),
    );
    body.allowSleep = true;
    // Two thresholds pulling opposite ways. Too high and a prop toppling onto
    // another one falls asleep MID-FALL and freezes at an angle; too low and
    // a box rocking on a corner never sleeps, and a prop at rest keeps
    // rewriting its own transform every frame, which is exactly what Lift and
    // the rest phase are careful not to do. 0.05 u/s over 0.45s is under 2 cm
    // of drift — narrower than the contact shade — and both the set-down and
    // the thrown-into-a-neighbour cases reach SLEEPING within ~1.5s.
    body.sleepSpeedLimit = 0.05;
    body.sleepTimeLimit = 0.45;
    handle.body = body;
    handle.com = com;
    handle.prev = new THREE.Vector3();
    this.world.addBody(body);
    this.park(handle);
  }

  /** Static boxes for everything else standing on the same plank. This is
   * why the shelf answers back, and it is derived rather than declared: no
   * unit file lists its own props, so the world reads the scene graph it is
   * standing in. Skipping sprites (see boxIn) is what keeps the fake contact
   * shadows from becoming real geometry. */
  private addNeighbours() {
    const C = this.C;
    // Its own matrix, not the shared scratch: localBox() below runs inside
    // the same loop and would clobber it.
    const inv = new THREE.Matrix4().copy(this.parent.matrixWorld).invert();
    const dynamic = new Set(this.handles.map((h) => h.group as THREE.Object3D));
    const occupied: THREE.Box3[] = [];
    for (const handle of this.handles) {
      if (!handle.com) continue;
      const box = localBox(handle.group);
      // Against the AUTHORED pose, not wherever the prop happens to be: the
      // world is built on a grab, and a prop still springing home from an
      // earlier authored drag would otherwise veto whichever neighbour it was
      // passing over, permanently.
      if (box) occupied.push(box.translate(handle.base));
    }
    for (const child of this.parent.children) {
      if (dynamic.has(child) || !child.visible) continue;
      const box = boxIn(child, inv);
      if (!box) continue;
      // Never wrap a grabbable's rest pose in a static wall — a body born
      // inside geometry is ejected across the room on the first step.
      if (occupied.some((taken) => taken.intersectsBox(box))) continue;
      // Nothing lives under the wood; clipping the box there keeps a prop
      // that dips below y=0 (a shade-bearing group, a leaning notebook) from
      // fighting the ground half-space.
      box.min.y = Math.max(box.min.y, 0);
      box.getSize(sizeScratch);
      if (sizeScratch.y < MIN_EXTENT) continue;
      const centre = box.getCenter(new THREE.Vector3());
      sizeScratch.multiplyScalar(0.5);
      sizeScratch.x *= HULL_SHRINK;
      sizeScratch.z *= HULL_SHRINK;
      const body = new C.Body({
        type: C.Body.STATIC,
        shape: new C.Box(
          new C.Vec3(sizeScratch.x, sizeScratch.y, sizeScratch.z),
        ),
      });
      body.position.set(centre.x, centre.y, centre.z);
      this.world.addBody(body);
    }
  }

  /** A Grabbable that unmounted takes its body with it — otherwise the world
   * keeps pushing a group that is no longer in the scene, and a remount
   * (React fast refresh, a unit swapping its contents) adopts a second body
   * for the same prop. */
  drop(handle: ShelfHandle) {
    const at = this.handles.indexOf(handle);
    if (at >= 0) this.handles.splice(at, 1);
    if (handle.body) this.world.removeBody(handle.body);
    handle.body = undefined;
    handle.world = undefined;
  }

  /** Is a prop in hand right now? Grabbable uses this to hand the frame's
   * step to the carrier, whose group pose is the only one that has to be
   * fresh when the solver runs. */
  carrying(): boolean {
    return this.handles.some((h) => h.phase.current === "held");
  }

  /** Group pose → body. Used for every authored phase (held, settling,
   * springing home): the visual leads and the body follows as an
   * infinite-mass carrier, so it shoves neighbours and is never shoved. */
  private push(handle: ShelfHandle, delta: number) {
    const body = handle.body;
    if (!body || !handle.com || !handle.prev) return;
    const group = handle.group;
    vecScratch.copy(handle.com).applyQuaternion(group.quaternion);
    const x = group.position.x + vecScratch.x;
    const y = group.position.y + vecScratch.y;
    const z = group.position.z + vecScratch.z;
    // Velocity from the body's own movement, which is what the solver needs
    // to resolve a contact with something the carrier is pushing INTO. The
    // first push after a grab reports zero because prev was just seeded.
    if (delta > 0)
      body.velocity.set(
        (x - handle.prev.x) / delta,
        (y - handle.prev.y) / delta,
        (z - handle.prev.z) / delta,
      );
    body.position.set(x, y, z);
    body.quaternion.set(
      group.quaternion.x,
      group.quaternion.y,
      group.quaternion.z,
      group.quaternion.w,
    );
    handle.prev.set(x, y, z);
    body.wakeUp();
  }

  /** Body → group pose. The inverse of push, including the com offset, so a
   * prop rotates about its centre and lands on the wood rather than sinking
   * half of itself into it. */
  private pull(handle: ShelfHandle) {
    const body = handle.body;
    if (!body || !handle.com) return;
    quatScratch.set(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w,
    );
    handle.group.quaternion.copy(quatScratch);
    vecScratch.copy(handle.com).applyQuaternion(quatScratch);
    handle.group.position.set(
      body.position.x - vecScratch.x,
      body.position.y - vecScratch.y,
      body.position.z - vecScratch.z,
    );
  }

  /** Take a prop into the hand. Returns false when this handle has no body
   * (the model had not streamed in when the world was built), which tells
   * Grabbable to run the drag on authored motion instead. */
  grab(handle: ShelfHandle): boolean {
    const body = handle.body;
    if (!body || !handle.com || !handle.prev) return false;
    handle.parked = false;
    body.type = this.C.Body.KINEMATIC;
    // A stationary kinematic body falls asleep, and the broadphase drops
    // pairs where BOTH bodies are asleep — a prop pressed slowly into a
    // sleeping neighbour would pass straight through it.
    body.allowSleep = false;
    body.wakeUp();
    body.velocity.setZero();
    body.angularVelocity.setZero();
    vecScratch.copy(handle.com).applyQuaternion(handle.group.quaternion);
    handle.prev.set(
      handle.group.position.x + vecScratch.x,
      handle.group.position.y + vecScratch.y,
      handle.group.position.z + vecScratch.z,
    );
    return true;
  }

  /** Let go. `velocity` is the prop's ACTUAL per-frame movement, which
   * Grabbable already computes correctly — the gap to the cursor behaves
   * like a spring constant rather than a speed and throws everything at the
   * same 1.9 u/s no matter how gently you were moving. */
  release(handle: ShelfHandle, velocity: THREE.Vector3): boolean {
    const body = handle.body;
    if (!body) return false;
    const clamp = (v: number) => THREE.MathUtils.clamp(v, -MAX_THROW, MAX_THROW);
    this.standUp(body);
    body.type = this.C.Body.DYNAMIC;
    body.allowSleep = true;
    body.wakeUp();
    body.velocity.set(clamp(velocity.x), clamp(velocity.y), clamp(velocity.z));
    // Tumble about the axis across the direction of travel, plus the yaw the
    // authored settle used to apply on its own.
    body.angularVelocity.set(
      clamp(velocity.z) * TUMBLE,
      clamp(velocity.x) * handle.spin,
      -clamp(velocity.x) * TUMBLE,
    );
    handle.parked = false;
    handle.phase.current = "sim";
    return true;
  }

  /** Lift a body clear of anything it is standing inside, straight up.
   *
   * A carried prop is kinematic, so nothing stops you dragging the mug into
   * the middle of the picture frame. Handing THAT to the solver made it a
   * spring-loaded catapult: two overlapping boxes resolve by shoving each
   * other apart, and since one of them has infinite mass the mug left the
   * shelf like it had been fired. Standing it on top of whatever it was
   * inside costs one AABB pass and reads as exactly what the visitor did —
   * they put the mug on the picture frame, and now it topples off. */
  private standUp(body: CANNON.Body) {
    body.aabbNeedsUpdate = true;
    body.updateAABB();
    let lift = 0;
    for (const other of this.world.bodies) {
      if (other === body || other.type !== this.C.Body.STATIC) continue;
      if (other.shapes[0] instanceof this.C.Plane) continue; // ground + walls
      other.aabbNeedsUpdate = true;
      other.updateAABB();
      if (!other.aabb.overlaps(body.aabb)) continue;
      lift = Math.max(lift, other.aabb.upperBound.y - body.aabb.lowerBound.y);
    }
    if (lift > 0) body.position.y += lift + 0.004;
  }

  /** Put a prop back on its mark and let it sleep there. Called once the
   * authored spring home has finished, which is the only thing that ends a
   * rearrangement — travel to another unit, never a timer. */
  park(handle: ShelfHandle) {
    const body = handle.body;
    if (!body || !handle.com) return;
    body.type = this.C.Body.DYNAMIC;
    body.allowSleep = true;
    body.position.set(
      handle.base.x + handle.com.x,
      handle.base.y + handle.com.y,
      handle.base.z + handle.com.z,
    );
    body.quaternion.set(0, 0, 0, 1);
    body.velocity.setZero();
    body.angularVelocity.setZero();
    body.force.setZero();
    body.torque.setZero();
    handle.prev?.set(body.position.x, body.position.y, body.position.z);
    handle.parked = true;
    body.sleep();
  }

  /** Advance the shelf one frame. Idempotent per `stamp`, because every
   * Grabbable standing on this plank calls it and only one of them should
   * step. Whoever gets there first does the work; Grabbable hands that slot
   * to the carrier while a prop is in hand so the kinematic body is always
   * pushed from the current frame's carry pose. */
  tick(delta: number, stamp: number) {
    if (stamp === this.stamp) return;
    this.stamp = stamp;
    const SLEEPING = this.C.Body.SLEEPING;
    let live = false;
    for (const handle of this.handles) {
      const body = handle.body;
      if (!body) continue;
      if (handle.phase.current === "sim") {
        if (body.sleepState !== SLEEPING) live = true;
        continue;
      }
      if (handle.parked) continue; // dynamic, asleep, on its mark
      if (body.type !== this.C.Body.KINEMATIC) {
        body.type = this.C.Body.KINEMATIC;
        body.allowSleep = false;
      }
      this.push(handle, delta);
      live = true;
    }
    // Everything asleep and nothing in hand: the shelf is settled and there
    // is nothing to integrate. Props at rest must not keep the solver warm
    // any more than they keep writing their own transform.
    if (!live) return;
    this.world.step(1 / 60, delta, 4);
    if (process.env.NODE_ENV !== "production") this.logContacts();
    for (const handle of this.handles) {
      const body = handle.body;
      if (!body) continue;
      if (handle.phase.current === "sim") {
        this.pull(handle);
        continue;
      }
      if (handle.parked) {
        // Knocked awake by someone else's throw. cannon wakes a sleeping
        // body on contact with a moving one, which is the only signal we
        // need to hand this prop to the solver.
        if (body.sleepState !== SLEEPING) {
          handle.parked = false;
          handle.phase.current = "sim";
          this.pull(handle);
        }
        continue;
      }
      // A kinematic body integrates its own velocity during the step and
      // ends a frame ahead of the visual it is following. The visual is
      // authoritative, so snap it back.
      this.push(handle, 0);
    }
  }

  /** Record every prop-versus-neighbour pair the solver resolved this step,
   * skipping the ground and the four edge planes (a prop is in contact with
   * the wood almost always, which proves nothing). Dev only. */
  private logContacts() {
    for (const contact of this.world.contacts) {
      this.noteContact(contact.bi, contact.bj);
      this.noteContact(contact.bj, contact.bi);
    }
  }

  private noteContact(a: CANNON.Body, b: CANNON.Body) {
    const handle = this.handles.find((h) => h.body === a);
    if (!handle || b.shapes[0] instanceof this.C.Plane) return;
    if (this.contacts.length > 200) this.contacts.shift();
    this.contacts.push({
      key: handle.key,
      at: a.position.toArray(),
      neighbour: b.position.toArray(),
    });
  }

  /** Dev-only readout — the harness has no other way to see where a body
   * actually is, and "did it collide or did it spring" is a question about
   * positions, not pixels. */
  report() {
    const boxes: { position: number[]; half: number[] }[] = [];
    for (const body of this.world.bodies) {
      if (body.type !== this.C.Body.STATIC) continue;
      const shape = body.shapes[0];
      if (!shape || !(shape instanceof this.C.Box)) continue; // planes: ground + walls
      boxes.push({
        position: body.position.toArray(),
        half: shape.halfExtents.toArray(),
      });
    }
    return {
      bodies: this.world.bodies.length,
      neighbours: boxes,
      contacts: this.contacts,
      props: this.handles.map((handle) => ({
        key: handle.key,
        phase: handle.phase.current,
        parked: !!handle.parked,
        body: handle.body
          ? {
              type: handle.body.type,
              asleep: handle.body.sleepState === this.C.Body.SLEEPING,
              position: handle.body.position.toArray(),
              velocity: handle.body.velocity.toArray(),
              spin: handle.body.angularVelocity.length(),
              sleepState: handle.body.sleepState,
              mass: handle.body.mass,
              half: (handle.body.shapes[0] as CANNON.Box).halfExtents?.toArray(),
              com: handle.com?.toArray(),
            }
          : null,
        group: handle.group.position.toArray(),
      })),
    };
  }
}
