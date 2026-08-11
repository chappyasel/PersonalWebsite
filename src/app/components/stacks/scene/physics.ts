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
  Sphere: typeof CANNON.Sphere;
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

/** Scene mass units per real kilogram, so a call site can declare what a prop
 * WEIGHS instead of trusting a uniform density to guess it.
 *
 * Derived from the one body that was tuned by hand: the mug's hull is
 * 0.268 × 0.418 × 0.270 = 0.0302 unit³, which at DENSITY 90 masses 2.72, and
 * the thing on the shelf is a ceramic desk caddy of about 0.4 kg. 2.72 / 0.4
 * = 6.8. Everything declared in kg therefore lands in the same load band the
 * contact defaults were tuned against, which is the only reason the number
 * exists — see the DENSITY note above for what happens outside that band.
 *
 * This matters most for the balls, where uniform density is not merely
 * imprecise, it is inverted. A basketball is a bag of air and a golf ball is
 * solid: 0.62 kg against 0.046 kg is a ratio of 13.5, while their volumes are
 * a ratio of 110. Massed by volume the golf ball comes out at 1/110th of the
 * basketball and cannot move it at all; massed in kg it shoves it about a
 * centimetre, which is what a golf ball hitting a basketball does. */
export const SCENE_MASS_PER_KG = 6.8;

/** A shape hint from the call site. "auto" measures: a prop whose AABB is
 * near-cubic is a ball, and a ball simulated as a box is the whole complaint —
 * boxes do not roll, they topple onto a face and stop. */
export type HullShape = "auto" | "sphere" | "box";

/** How square an AABB has to be before "auto" calls it a ball. A basketball
 * measures 0.216 × 0.215 × 0.214 and a golf ball is a sphereGeometry, so both
 * are inside 1%; the mug is 0.268 × 0.418 × 0.270 (1.56) and the paper stack
 * is flatter still, so nothing on these shelves is anywhere near the line. */
const SPHERICITY = 1.18;

/** A sphere gets its own damping pair, and counter-intuitively a HEAVIER one
 * than the box it replaces (0.5 / 0.6). The reason is that the two hulls are
 * braked by different things. A box slides, so contact friction does almost
 * all the work — measured against this world's own contact material, a box
 * pushed at 1.2 u/s travels 0.004 units, which is the owner's complaint
 * exactly: a basketball flicked along the shelf does not move. A ball rolling
 * without slipping dissipates nothing at the contact at all, so damping is
 * the ONLY brake it has and has to carry the whole load.
 *
 * Swept against the real solver at 1/60 with the real masses. 0.8 / 0.9 puts
 * a firm 1.2 u/s flick 0.62 units along the plank, asleep in 2.0 s, and a
 * gentle 0.4 u/s nudge 0.20 units, asleep in 1.5 s — a fifth of the shelf for
 * a hard push, which is a ball on wood rather than a ball on ice. At 0.16 /
 * 0.3 the same flick ran 2.54 units and a golf ball took 12 s to sleep.
 *
 * HARD CEILING: angular damping must stay UNDER 1. cannon integrates it as
 * pow(1 - angularDamping, dt), so 1.0 pins the spin to zero and anything above
 * it raises a negative base to a fractional power and yields NaN — the body
 * then reports enormous travel and never sleeps, which reads as a tuning
 * result and is actually a corrupted integrator. Every value at or above 1.0
 * in the sweep was that, not a slower ball. */
const BALL_LINEAR_DAMPING = 0.8;
const BALL_ANGULAR_DAMPING = 0.9;

/** cannon's sleep test compares |v|² + |ω|² against sleepSpeedLimit², and a
 * ball rolling without slipping has ω = v/r. On a 0.045-radius golf ball a
 * crawl of 0.05 u/s is 1.1 rad/s of spin, twenty times the box threshold, so a
 * ball on the box numbers NEVER sleeps and rewrites its transform forever.
 * Scaling the limit by 1/r puts both terms under the bar at the same speed. */
function ballSleepLimit(radius: number) {
  return 0.05 * (1 + 1 / Math.max(radius, 0.02));
}

/** Which plank a body stands on. It decides where the ground is, where the
 * edges are, and whether there is a plank overhead to stop a throw. Resolved
 * from the prop's WORLD matrix (see resolveShelf), so nesting depth does not
 * change the answer; a call site may still override it with `standsOn`. */
export type ShelfPlane = "top" | "lower" | "floor";

/** ShelfUnit's two plank surfaces. Unit-local y in primitives.tsx's `SHELF`,
 * and — because every unit root sits at world y 0 (worldLayout.unitPose) —
 * WORLD y here. Typed rather than imported so the solver chunk keeps no
 * static edge into the render layer; if `SHELF` moves, this moves with it. */
const PLANK_Y = { top: 0.035, lower: -0.6925 } as const;
/** Tolerance for "is this ancestor at a plank". The two heights are 0.73
 * apart and the ground bay sits at 0, which is 0.035 from the top plank — so
 * this has to be well under half of that, and the values are exact constants
 * rather than measurements, so it only has to absorb float drift. */
const PLANK_EPS = 0.01;

const worldScratch = new THREE.Vector3();

function plankAt(y: number): ShelfPlane | null {
  if (Math.abs(y - PLANK_Y.top) < PLANK_EPS) return "top";
  if (Math.abs(y - PLANK_Y.lower) < PLANK_EPS) return "lower";
  return null;
}

/** True when `obj` is somewhere below `root`. */
function isUnder(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o = obj.parent; o; o = o.parent) if (o === root) return true;
  return false;
}

/**
 * The group that IS the plank a prop stands on — and which plank that is.
 *
 * NOT `group.parent`, and that substitution was two bugs wearing one coat.
 * Unit files wrap several props in a layout `<group>` for positioning, so the
 * immediate parent is a different object for almost every prop on the same
 * shelf. Measured before this existed: `grab:mug` and `grab:headphones`, both
 * standing on the Musings lower plank, built two SEPARATE worlds holding one
 * dynamic body each (3 and 12 neighbour boxes), so they could not collide with
 * one another — the same root cause as the `addNeighbours()` bug fixed last
 * round (a local-space shortcut standing in for a world-space question),
 * surviving in a second function. And the plank was read off that layout
 * group's LOCAL y, which reported the About mug — declared inside `lower={…}`
 * — as standing on the TOP shelf, so its world got the top plank's wall
 * positions and no overhead lid.
 *
 * World y answers both at once. Climb while the ancestor is still at the same
 * plank height and take the OUTERMOST one: that is ShelfUnit's own
 * `<group position={[0, SHELF.x, 0]}>`, because its parent — the unit root —
 * sits at y 0 and ends the climb.
 *
 * The ground bay is deliberately left alone: its content hangs directly off
 * the unit root at y 0, which is indistinguishable by height from the unit
 * root itself and from the scene root above it, so climbing would swallow the
 * whole unit. Those props keep the old behaviour (key on the immediate parent,
 * plane "floor"), which is correct for a single prop and merely does not share
 * a world. Nothing on the ground bay is grabbable today.
 */
export function resolveShelf(group: THREE.Object3D): {
  shelf: THREE.Object3D;
  plane: ShelfPlane;
} {
  const start = group.parent ?? group;
  start.updateWorldMatrix(true, false);
  const plane = plankAt(start.getWorldPosition(worldScratch).y);
  if (!plane) return { shelf: start, plane: "floor" };
  let shelf = start;
  for (let o = start.parent; o; o = o.parent) {
    if (plankAt(o.getWorldPosition(worldScratch).y) !== plane) break;
    shelf = o;
  }
  return { shelf, plane };
}

/** Under-plank clearance on the lower shelf: top plank underside (−0.035)
 * minus the lower plank surface (−0.6925). Measured off ShelfUnit's own
 * RoundedBox args in primitives.tsx, not typed in by hand. */
const LOWER_HEADROOM = 0.6575;

/** Static-collider budget. The neighbour pass walks INTO groups now (see
 * collectStatics), so a shelf that used to yield three boxes can yield
 * thirty; cannon's default broadphase is O(n²) on AABB pairs, and 48 statics
 * is ~2300 overlap tests per step (tens of microseconds) while 200 would not
 * be. Depth is capped for the same reason — a packed book row is fourteen
 * meshes and none of them is a collider anyone will ever notice. */
const MAX_STATICS = 48;
/** Deep enough to reach a GLB's own meshes. The wrappers between a shelf and
 * its geometry are not decorative — PropLink, Lift, Suspense's group,
 * ModelProp's group and the glTF scene node are five levels before the first
 * mesh, and a cap of 4 stopped one short: the barbell came out as a single
 * 2.37 × 0.48 slab, an invisible wall where the visible object is a 3 cm rod
 * with a plate stack at each end. The real guards on cost are MAX_STATICS and
 * SPLIT_EXTENT, which stop the descent on width, not on nesting. */
const MAX_SPLIT_DEPTH = 8;

/** Boxes closer than this get unioned back together after a split.
 *
 * Splitting is right for a layout group and wrong for a STACK. The Musings
 * paper stack is three sheets 16 mm apart, and one collider per sheet builds a
 * staircase with 1 mm treads: the mug set down on it wedges between two of
 * them, fights both contacts, and never reaches sleep — measured, it sat
 * SLEEPY for 3.6 s where the single box had it SLEEPING in 1.0 s, which means
 * a prop at rest rewriting its transform forever. 2 cm is also below anything
 * a ball could roll into, so nothing is lost by closing the gap. */
const MERGE_GAP = 0.02;

/** …but ONLY inside a subtree this size or under.
 *
 * Merging is undoing an over-split, so it must not reach across props. Run
 * unscoped it does exactly that: measured on Musings, the paper stack's
 * sheets and the table lamp's mesh parts overlap in x once each is measured
 * on its own, and a blind proximity merge fused them into one 0.89-wide,
 * 0.65-tall slab spanning the middle of the shelf. The mug thrown at it
 * climbed on top and slept at y 0.784, standing on an invisible wall in the
 * 5 cm of air between two props.
 *
 * The line: a subtree under this bound is one OBJECT that got split into its
 * own parts (the paper stack 0.62, the table lamp 0.65) and should come back
 * together; anything over it is either a layout group (Training's wrapper,
 * 2.9 across) or a prop big enough that per-mesh hulls beat its AABB (the
 * barbell, 2.37 — bar plus a plate stack at each end, rather than one slab at
 * plate diameter spanning the whole shelf). Nothing measured lands between
 * 0.65 and 2.37, so the exact value is not load-bearing. */
const MERGE_UNION_MAX = 0.9;

/** Any single prop on these shelves fits inside this. A box wider than it is
 * a LAYOUT group — a unit file wrapping several props for positioning — and
 * wrapping one collider around the lot is what let props clip each other. */
const SPLIT_EXTENT = 0.55;

/** How far a body may get from the plank before it is treated as escaped
 * rather than thrown. Generous: the walls are at |x| 1.57 and the whole point
 * of them is that this should never fire. */
const ESCAPE_X = 2.4;
const ESCAPE_Z = 1.6;
const ESCAPE_Y_DOWN = -1.4;
const ESCAPE_Y_UP = 3;

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
  /** Hull to build. Defaults to "auto", which measures the AABB. */
  shape?: HullShape;
  /** What the prop weighs, in real kilograms. Overrides the uniform-density
   * guess, which is wrong by two orders of magnitude on anything hollow. */
  massKg?: number;
  /** Which plank this prop stands on. Defaults to a read of the parent
   * group's y, which is right for anything mounted through ShelfUnit. */
  plane?: ShelfPlane;
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
  /** The handle's PARENT frame expressed in the shelf frame — the transform
   * that lets a prop nested in a layout group share a world with a prop that
   * is a direct child of the plank. Identity in the second case, which is
   * exactly what every body used to assume unconditionally. Kept as position +
   * quaternion for the per-frame pose conversions and as a matrix for the box
   * work; `frameQi` is the cached inverse rotation, because pull() runs every
   * frame and inverting a quaternion per prop per frame is free work. */
  frame?: THREE.Vector3;
  frameQ?: THREE.Quaternion;
  frameQi?: THREE.Quaternion;
  frameM?: THREE.Matrix4;
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
const IDENTITY = new THREE.Quaternion();

/** AABB of `obj`'s renderable geometry expressed in the frame `invFrame`
 * takes world space into.
 *
 * Deliberately not `Box3.setFromObject`: that walks sprites too, and half the
 * things standing on these shelves carry a ContactShade billboard as a child.
 * A 0.55-wide shade sprite next to a 0.42-wide paper stack grew the stack's
 * box by 6 cm on the near side — an invisible bumper the mug bounced off. */
function rawBoxIn(
  obj: THREE.Object3D,
  invFrame: THREE.Matrix4,
): THREE.Box3 | null {
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
  return out.isEmpty() ? null : out;
}

/** The same box, gated to the size a PROP can be. Used for the dynamic hull,
 * where a measurement outside this range means the model has not streamed in
 * or the caller handed us the wrong group, and authored motion is the honest
 * fallback. The neighbour pass deliberately does NOT use this gate — see
 * collectStatics. */
function boxIn(obj: THREE.Object3D, invFrame: THREE.Matrix4): THREE.Box3 | null {
  const out = rawBoxIn(obj, invFrame);
  if (!out) return null;
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

/** Union any boxes that touch, in place, until nothing else can merge.
 *
 * The counterpart to collectStatics: descending finds every prop, and this
 * puts back together the ones that were never separate objects to begin with —
 * a stack of sheets, the two halves of a lamp, the plate and the collar of a
 * barbell. A collider set with a 1 mm gap in it is worse than a coarse one,
 * because a resting body wedges in the gap and fights both faces forever.
 *
 * O(n²) per merge round over at most MAX_STATICS boxes, run once when the
 * world is built. */
function mergeTouching(boxes: THREE.Box3[], from = 0) {
  const pad = new THREE.Vector3(MERGE_GAP, MERGE_GAP, MERGE_GAP);
  for (let merged = true; merged; ) {
    merged = false;
    outer: for (let i = from; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        boxScratch.copy(boxes[i]!).expandByVector(pad);
        if (!boxScratch.intersectsBox(boxes[j]!)) continue;
        boxes[i]!.union(boxes[j]!);
        boxes.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// One world per shelf
// ---------------------------------------------------------------------------

const worlds = new WeakMap<THREE.Object3D, ShelfWorld>();

/** The world for the plank `group` stands on, built on first use from every
 * handle standing on the same one. Cached against the plank group, so it dies
 * with the scene and survives every travel in between — which is what lets a
 * prop stay knocked over while you are looking at it.
 *
 * Membership is "is a DESCENDANT of the plank", not "is a direct child of the
 * same parent". That one word is the fix: it is what puts every prop on a
 * shelf into one world so they can actually hit each other. */
export function worldFor(
  group: THREE.Object3D,
  handles: Iterable<ShelfHandle>,
): ShelfWorld | null {
  if (!CANNON_MOD) return null;
  const { shelf, plane } = resolveShelf(group);
  const mine: ShelfHandle[] = [];
  for (const handle of handles)
    if (handle.group === group || isUnder(handle.group, shelf)) mine.push(handle);
  let world = worlds.get(shelf);
  if (!world) {
    world = new ShelfWorld(CANNON_MOD, shelf, plane, mine);
    worlds.set(shelf, world);
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
  /** The plank group. Every body in this world lives in its frame. */
  private readonly shelf: THREE.Object3D;
  /** Which plank this world models — decides the edge walls and whether
   * there is a lid. Set in the constructor, read by report(). */
  readonly plane: ShelfPlane;
  readonly handles: ShelfHandle[] = [];
  /** Sphere bodies, by body id. cannon has no per-body "is a ball" flag and
   * `instanceof` on the shape means reaching for the class on every read;
   * the radius is what release() and the sleep threshold both want anyway. */
  private readonly balls = new Map<number, number>();
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
    shelf: THREE.Object3D,
    plane: ShelfPlane,
    handles: ShelfHandle[],
  ) {
    this.C = C;
    this.shelf = shelf;
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
    // top plank 3.2 × 0.85 centred at z 0, lower plank 3.2 × 0.6 at z −0.08,
    // ground bay the full 0.85 again. Which plank this is came off the shelf
    // group's WORLD y (see resolveShelf) rather than a parent's local y, so a
    // prop nested three layout groups deep resolves the same plank as one
    // standing directly on the wood. `standsOn` remains as an override and is
    // now needed only for the ground bay.
    this.plane = handles.find((h) => h.plane)?.plane ?? plane;
    const zNear = this.plane === "lower" ? 0.19 : 0.39;
    const zFar = this.plane === "lower" ? -0.35 : -0.39;
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

    // The plank overhead, on the one shelf that has one. Without it a ball
    // thrown up from the lower shelf sails through 5 cm of solid wood and
    // lands on the shelf above, which is a worse read than any clipping this
    // pass fixes. The top shelf gets no lid on purpose: there is no plank
    // above it, and a prop thrown off it is caught by the walls and gravity.
    if (this.plane === "lower") {
      const lid = new C.Body({ type: C.Body.STATIC, shape: new C.Plane() });
      lid.position.set(0, LOWER_HEADROOM, 0);
      lid.quaternion.setFromEuler(Math.PI / 2, 0, 0); // normal −Y
      this.world.addBody(lid);
    }

    for (const handle of handles) this.adopt(handle);
    this.addNeighbours();
  }

  /** Work out where this handle's own parent frame sits inside the shelf
   * frame, once, at adopt time. Layout groups are static — a unit file's
   * `<group position={…}>` never moves — so this is a mount-time constant, and
   * it is the identity for a prop that hangs directly off the plank.
   *
   * Scale is asserted rather than supported: every group between a plank and a
   * prop in this scene is a pure translation or rotation (props scale INSIDE
   * ModelProp, below the Grabbable), and a scaled frame would need the hull
   * measurements scaled too. A dev warning is the honest response to one
   * appearing rather than silently simulating the wrong size. */
  private measureFrame(handle: ShelfHandle) {
    const parent = handle.group.parent ?? this.shelf;
    this.shelf.updateWorldMatrix(true, false);
    parent.updateWorldMatrix(true, false);
    const m = new THREE.Matrix4()
      .copy(this.shelf.matrixWorld)
      .invert()
      .multiply(parent.matrixWorld);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    m.decompose(position, quaternion, sizeScratch);
    if (
      process.env.NODE_ENV !== "production" &&
      Math.abs(sizeScratch.x - 1) + Math.abs(sizeScratch.y - 1) + Math.abs(sizeScratch.z - 1) > 3e-3
    ) {
      console.warn(
        `[stacks] physics: ${handle.key} sits under a SCALED group (${sizeScratch.toArray().map((v) => v.toFixed(3)).join(", ")}). ` +
          "Its hull is measured unscaled and will be the wrong size.",
      );
    }
    handle.frame = position;
    handle.frameQ = quaternion;
    handle.frameQi = quaternion.clone().invert();
    handle.frameM = m;
  }

  /** Parent-frame point → shelf frame, in place. */
  private intoShelf(handle: ShelfHandle, v: THREE.Vector3): THREE.Vector3 {
    return handle.frameQ ? v.applyQuaternion(handle.frameQ).add(handle.frame!) : v;
  }

  /** Shelf-frame point → the handle's parent frame, in place. */
  private outOfShelf(handle: ShelfHandle, v: THREE.Vector3): THREE.Vector3 {
    return handle.frameQi ? v.sub(handle.frame!).applyQuaternion(handle.frameQi) : v;
  }

  /** Give a Grabbable a dynamic body, parked at its authored pose. */
  adopt(handle: ShelfHandle) {
    if (this.handles.includes(handle)) return;
    const C = this.C;
    const box = localBox(handle.group);
    this.handles.push(handle);
    handle.world = this;
    this.measureFrame(handle);
    if (!box) return; // model still streaming in — authored motion covers it
    const centre = box.getCenter(new THREE.Vector3());
    box.getSize(sizeScratch).multiplyScalar(0.5);
    const halfX = sizeScratch.x * HULL_SHRINK;
    const halfY = sizeScratch.y;
    const halfZ = sizeScratch.z * HULL_SHRINK;
    const volume = halfX * halfY * halfZ * 8;

    // Ball or box. A ball measured as a box is the owner's complaint stated
    // precisely: a box on a plank has four stable faces and rolls onto one of
    // them, so a basketball flicked along the shelf slides, tips and stops
    // dead square. It does not matter how good the contacts are.
    const span = [halfX, halfY, halfZ];
    const round =
      handle.shape === "sphere" ||
      (handle.shape !== "box" &&
        Math.max(...span) / Math.max(Math.min(...span), 1e-6) < SPHERICITY);
    // The INSCRIBED radius, not the circumscribed one: a ball that pokes out
    // of its own silhouette hovers visibly above the wood, and this is a
    // scene with no shadows to hide it.
    const radius = Math.min(halfX, halfY, halfZ);

    // A ball's centre of mass is its centre. COM_FRACTION exists because the
    // shelf props are bottom-heavy silhouettes (a cup with scissors in it, a
    // base with a shade); applying it to a sphere would put the mass 15% of
    // the radius below the middle, which is a weeble, not a ball.
    const com = centre.clone();
    if (!round) com.y = box.min.y + (box.max.y - box.min.y) * COM_FRACTION;

    const body = new C.Body({
      // Declared weight wins. Uniform density is a reasonable guess for a
      // solid object and an inverted one for anything hollow — see
      // SCENE_MASS_PER_KG.
      mass:
        handle.massKg !== undefined
          ? Math.max(0.05, handle.massKg * SCENE_MASS_PER_KG)
          : Math.max(0.08, volume * DENSITY),
      // Wood eats energy. Without this a knocked prop skates for a second
      // and a half, which looks like ice rather than a shelf. A ball is the
      // one thing on the shelf that is SUPPOSED to keep going, so it gets
      // rolling resistance instead of skid resistance.
      linearDamping: round ? BALL_LINEAR_DAMPING : 0.5,
      angularDamping: round ? BALL_ANGULAR_DAMPING : 0.6,
    });
    if (round) {
      body.addShape(
        new C.Sphere(radius),
        new C.Vec3(0, centre.y - com.y, 0),
      );
      this.balls.set(body.id, radius);
    } else {
      body.addShape(
        new C.Box(new C.Vec3(halfX, halfY, halfZ)),
        new C.Vec3(0, centre.y - com.y, 0),
      );
    }
    body.allowSleep = true;
    // Two thresholds pulling opposite ways. Too high and a prop toppling onto
    // another one falls asleep MID-FALL and freezes at an angle; too low and
    // a box rocking on a corner never sleeps, and a prop at rest keeps
    // rewriting its own transform every frame, which is exactly what Lift and
    // the rest phase are careful not to do. 0.05 u/s over 0.45s is under 2 cm
    // of drift — narrower than the contact shade — and both the set-down and
    // the thrown-into-a-neighbour cases reach SLEEPING within ~1.5s.
    body.sleepSpeedLimit = round ? ballSleepLimit(radius) : 0.05;
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
    const inv = new THREE.Matrix4().copy(this.shelf.matrixWorld).invert();
    const dynamic = new Set(this.handles.map((h) => h.group as THREE.Object3D));
    const occupied: THREE.Box3[] = [];
    for (const handle of this.handles) {
      if (!handle.com) continue;
      const box = localBox(handle.group);
      // Against the AUTHORED pose, not wherever the prop happens to be: the
      // world is built on a grab, and a prop still springing home from an
      // earlier authored drag would otherwise veto whichever neighbour it was
      // passing over, permanently. Placed at base in the handle's PARENT
      // frame, then carried into the shelf frame the static boxes live in.
      if (!box) continue;
      box.translate(handle.base);
      if (handle.frameM) box.applyMatrix4(handle.frameM);
      occupied.push(box);
    }
    const boxes: THREE.Box3[] = [];
    for (const child of this.shelf.children)
      this.collectStatics(child, inv, dynamic, boxes, 0);

    for (const box of boxes) {
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

  /** Walk a shelf child down to one box per PROP rather than one per group.
   *
   * This is the clipping bug, and it is not a solver problem. The old pass
   * looked only at the shelf group's DIRECT children and dropped any whose
   * union AABB was bigger than MAX_EXTENT. That is not a rare case, it is the
   * common one: unit files wrap several props in a single layout `<group>`
   * for positioning. On Training that wrapper holds the dumbbell, the
   * basketball, a 2.37-wide barbell and two framed photographs — about 2.9
   * units across, over the cap — so the entire shelf silently had NO
   * colliders and everything on it passed through everything else. Where the
   * union did squeak under the cap it was worse than nothing: one box bridged
   * the gap between two props and became an invisible wall in the air
   * between them.
   *
   * The rule: a box wider than any single prop can be (SPLIT_EXTENT) is a
   * layout group, so descend. A leaf that is genuinely that big — the barbell
   * — splits into its own meshes, which is a better hull than its AABB was
   * anyway: bar, and a plate stack at each end, instead of one slab spanning
   * the whole shelf at plate diameter.
   *
   * Deliberately NOT boxIn(): its MIN_EXTENT gate rejects anything with one
   * thin axis, which is every photograph and every sheet of paper on these
   * shelves. A ball should hit a picture frame. */
  private collectStatics(
    obj: THREE.Object3D,
    inv: THREE.Matrix4,
    dynamic: Set<THREE.Object3D>,
    out: THREE.Box3[],
    depth: number,
  ) {
    if (out.length >= MAX_STATICS) return;
    if (!obj.visible || dynamic.has(obj)) return;
    const box = rawBoxIn(obj, inv);
    if (!box) return;
    box.getSize(sizeScratch);
    const max = Math.max(sizeScratch.x, sizeScratch.y, sizeScratch.z);
    if (max < MIN_EXTENT) return; // a sliver, or a helper with no geometry
    if (max > SPLIT_EXTENT && depth < MAX_SPLIT_DEPTH && obj.children.length) {
      const before = out.length;
      for (const child of obj.children)
        this.collectStatics(child, inv, dynamic, out, depth + 1);
      // Only accept the split if it produced something. A single oversized
      // MESH has no children to descend into and falls through to the cap
      // below, which is the honest outcome: too big to be a prop.
      if (out.length > before) {
        // …and if what was split is still one object rather than a layout,
        // put its parts back together. Scoped to the boxes THIS subtree
        // produced, which is what keeps a merge from reaching across props.
        if (max <= MERGE_UNION_MAX) mergeTouching(out, before);
        return;
      }
    }
    if (max > MAX_EXTENT) return;
    out.push(box);
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
    // Group pose is in the handle's PARENT frame; bodies live in the shelf's.
    // The two are the same frame for a prop that hangs off the plank directly,
    // and a fixed offset (plus rotation) for one inside a layout group.
    this.intoShelf(handle, vecScratch.add(group.position));
    const x = vecScratch.x;
    const y = vecScratch.y;
    const z = vecScratch.z;
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
    quatScratch.copy(group.quaternion);
    if (handle.frameQ) quatScratch.premultiply(handle.frameQ);
    body.quaternion.set(
      quatScratch.x,
      quatScratch.y,
      quatScratch.z,
      quatScratch.w,
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
    // Shelf frame → the handle's parent frame, the exact inverse of push.
    if (handle.frameQi) quatScratch.premultiply(handle.frameQi);
    handle.group.quaternion.copy(quatScratch);
    // com is in the prop's OWN local frame, so it rotates by the group's
    // quaternion — which is now the parent-frame one — and is subtracted after
    // the body position has come back out of the shelf frame.
    vecScratch.set(body.position.x, body.position.y, body.position.z);
    this.outOfShelf(handle, vecScratch);
    handle.group.position.copy(vecScratch);
    vecScratch.copy(handle.com).applyQuaternion(quatScratch);
    handle.group.position.sub(vecScratch);
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
    // Shelf frame, like every other body coordinate — `prev` is differenced
    // against body positions to produce the carrier's velocity.
    this.intoShelf(handle, vecScratch.add(handle.group.position));
    handle.prev.copy(vecScratch);
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
    const radius = this.balls.get(body.id);
    if (radius !== undefined) {
      // A ball leaves the hand ROLLING, at the no-slip rate ω = v/r, about
      // the axis across the direction of travel. TUMBLE's "legible fraction"
      // exists so a thrown mug does not blur; a ball that spins slower than
      // it travels is a ball skidding on ice, and the eye reads that
      // immediately. Friction would eventually spin it up to this anyway —
      // handing it over at release just skips the skid.
      body.angularVelocity.set(
        clamp(velocity.z) / radius,
        0,
        -clamp(velocity.x) / radius,
      );
    } else {
      // Tumble about the axis across the direction of travel, plus the yaw
      // the authored settle used to apply on its own.
      body.angularVelocity.set(
        clamp(velocity.z) * TUMBLE,
        clamp(velocity.x) * handle.spin,
        -clamp(velocity.x) * TUMBLE,
      );
    }
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
    // The authored pose is in the handle's parent frame; the body is not.
    vecScratch.copy(handle.base).add(handle.com);
    this.intoShelf(handle, vecScratch);
    body.position.set(vecScratch.x, vecScratch.y, vecScratch.z);
    // A parked prop's group rotation is identity, so the body's is whatever
    // the layout group above it contributes.
    quatScratch.copy(handle.frameQ ?? IDENTITY);
    body.quaternion.set(
      quatScratch.x,
      quatScratch.y,
      quatScratch.z,
      quatScratch.w,
    );
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
        // A body that has left the shelf entirely comes home rather than
        // falling forever. The walls and the ground make this all but
        // unreachable, but "all but" is doing real work: a tab that was
        // backgrounded mid-throw, or a release inside geometry that standUp
        // could not resolve, can hand the solver a step big enough to tunnel,
        // and a prop the visitor can never see again is worse than one that
        // clipped. Parking is the same ending travel already gives it.
        if (this.escaped(body)) {
          this.park(handle);
          handle.phase.current = "rest";
          continue;
        }
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

  private escaped(body: CANNON.Body) {
    const p = body.position;
    return (
      Math.abs(p.x) > ESCAPE_X ||
      Math.abs(p.z) > ESCAPE_Z ||
      p.y < ESCAPE_Y_DOWN ||
      p.y > ESCAPE_Y_UP ||
      !Number.isFinite(p.x + p.y + p.z)
    );
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
      plane: this.plane,
      neighbours: boxes,
      contacts: this.contacts,
      props: this.handles.map((handle) => ({
        key: handle.key,
        phase: handle.phase.current,
        parked: !!handle.parked,
        body: handle.body
          ? {
              type: handle.body.type,
              // "Is it a ball" is the question this pass exists to answer,
              // and a trajectory cannot answer it — a box on a flat plank
              // slides in a straight line too.
              shape: this.balls.has(handle.body.id) ? "sphere" : "box",
              radius: this.balls.get(handle.body.id) ?? null,
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
