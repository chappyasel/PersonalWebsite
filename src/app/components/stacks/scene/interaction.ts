"use client";

// What the pointer is allowed to do to a prop, and how much.
//
// Two things live here, and they are the same subject from two angles:
//
//   1. The CLAIM — "something above me already answers the pointer for this
//      subtree", so the universal hover floor stands down. Plain context;
//      nothing to run per frame.
//   2. The MEASUREMENT — how big a prop actually is, where its hinge edge is,
//      and whether it carries its own lighting. Every generic hover response
//      in the scene has to ask those three questions before it moves anything,
//      and asking them in one place is what keeps the answers the same.
//
// On (1): every GLB prop in the world renders through ModelProp, which makes
// it the one place a universal hover floor can be installed — but a prop
// wrapped in one of the scene's interaction shells (Lift, EggTrigger,
// Grabbable, PropLink) already answers. Two handlers on one subtree is not
// twice the feedback, it is a bug: the inner handler calls stopPropagation,
// r3f stops bubbling there, and the shell above never hears the pointer at
// all — so the prop double-lifts AND loses the cursor its shell was claiming.
// A shell wraps its children in InteractionClaim and ModelProp stands down.
import {
  type ReactNode,
  createContext,
  createElement,
  useContext,
} from "react";
import * as THREE from "three";

const ClaimContext = createContext(false);

/** Mark this subtree as already having pointer interaction of its own. */
export function InteractionClaim({ children }: { children: ReactNode }) {
  return createElement(ClaimContext.Provider, { value: true }, children);
}

/** True when an ancestor claimed the pointer — do not add another handler. */
export function useInteractionClaimed(): boolean {
  return useContext(ClaimContext);
}

// ---------------------------------------------------------------------------
// How big is it, really
// ---------------------------------------------------------------------------

/**
 * Greatest world-space dimension, in scene units, above which a prop is
 * FURNITURE and stops answering the pointer with motion of its own.
 *
 * A WORLD measurement taken after every scale in the chain, because `scale` is
 * a multiplier over source models that differ by an order of magnitude and
 * means nothing on its own — the floor lamp is scaled 1.67 and the mug 2.1,
 * and the lamp is three times the object.
 *
 * Measured, not guessed. Every GLB prop in the world at the time, greatest
 * world dimension in scene units. TWO OF THESE ARE GONE: eames-chair was
 * replaced by the couch (see `seated.ts`) and the ladder was cut from Books
 * (see `UnitBooks.tsx`). Their rows are left in place because the CUT was
 * chosen against this population and removing them would rewrite the evidence
 * for 0.78 — but do not read this list as the current scene. Since ADR 0020
 * the live population is `window.__stacksArchetypes()` in dev.
 *
 *   alarm-clock  0.269   desk-lamp    0.645  │  eames-chair       0.892
 *   cup-tea      0.366   lamp-table   0.650  │  golf-club         1.056
 *   headphones   0.408   pothos       0.664  │  ladder            1.259
 *   mug          0.418   basketball   0.670  │  lamp-floor        1.436
 *   potted-plant 0.471   cactus       0.696  │  monstera          1.691
 *                                            │  grandfather-clock 1.869
 *
 * The population is bimodal and the classes are exactly the semantic ones:
 * everything at or below 0.696 is something you would pick up off a shelf, and
 * everything at or above 0.892 is furniture. 0.78 sits in that empty band with
 * ~12% of margin on each side. ModelProp's FLOOR_MAX_SIZE is the same number
 * for the same reason; they are one rule and should stay one number.
 */
export const HOVER_MAX_SIZE = 0.78;

/**
 * The same line for a NOD, which is deliberately looser — and it has to be
 * measured on a different population, because the two responses do not reach
 * the same props.
 *
 * Why looser at all: a vertical bob is a thing objects do not do, so the
 * cutoff for it is "is this small enough to pick up". A nod about the edge a
 * thing is resting on IS what a standing object does when you lean it toward
 * you, and a picture frame does it at any size. Only something that reads as
 * FURNITURE looks wrong doing it.
 *
 * Why 1.0. Measured over every prop the shared Lift shell actually wraps —
 * `[stacks] tip … size=` across all seven units, sorted:
 *
 *   routine board 0.420 · trophy 0.453 · book piles 0.46–0.53 · book covers
 *   0.520 · notebooks 0.520–0.522 · plates 0.542/0.660 · kettlebell 0.559 ·
 *   sansevieria 0.611 · ct-books 0.644 · paper 0.650 · mac 0.654 · open book
 *   0.717 · project frames 0.765–0.776 · PORTRAIT 0.808 · DUMBBELL 0.871
 *   ‖ barbell 3.062
 *
 * The gap is 0.871 → 3.062 and there is nothing in it, so any value in that
 * range is the same rule; 1.0 is the round one. At the floor's 0.78 this cut
 * the portrait and the dumbbell, which are a picture frame and a hand weight —
 * neither is furniture by any reading.
 *
 * The furniture sits well clear on the other side, and the margin GREW during
 * v7 rather than shrinking: the props were scaled up mid-round (H1, "basically
 * all the on the ground stuff looks small"), and re-measuring afterwards gives
 * eames chair 1.329, ladder 1.933, golf club 2.192, floor lamp 2.451,
 * grandfather clock 2.455, monstera 2.710 — where the same six were 0.892 to
 * 1.869 before. (Chair and ladder have since left the scene; see the note
 * above HOVER_MAX_SIZE. The four that remain sit 2.192 and up, so the empty
 * band is WIDER now, not narrower.) The Lift-wrapped population did not move at all. So the empty
 * band is now 0.871 → 1.329 and 1.0 sits near the middle of it.
 *
 * Note also that none of those six is reached by this constant anyway: each
 * lives in a bespoke shell (SitChair, EggTrigger, LampSwitch) rather than a
 * Lift. Where ModelProp's universal floor DOES see them, it gates them at
 * HOVER_MAX_SIZE above.
 */
export const TILT_MAX_SIZE = 1.0;

/** One scene-wide legibility control for hover distance. This intentionally
 * scales displacement, rotation and swell DELTA without changing the damping
 * curve: props move further, not more abruptly.
 *
 * Raised from 2 to 2.5 on 2026-08-20 ("the movements are all too subtle").
 * Deliberately a smaller bump than the rotation bases got, because this is the
 * multiplier on TRANSLATION and translation is the channel that can clip. The
 * lower shelf's front edge sits at z = centerZ + depth/2 = -0.08 + 0.30 =
 * 0.22, and the largest authored push is the flat book row's 0.07, so 2.5
 * lands it at 0.175 with clear air and 3.0 would have put it on the lip.
 * Rotation was raised further on the argument that it has no such ceiling:
 * every tilt in the world is pinned to a contact edge by `hingeShift`, so it
 * can be doubled without anything leaving the plank. THAT ARGUMENT IS HALF
 * TRUE and it cost a round. The pinned edge is the one underneath; it says
 * nothing about the other end of the arc, and the props that stack have no
 * room there at all — a flat book row carries each volume on the one below it
 * with a gap of exactly zero, which `FLAT_LIFT` had already banned the RISE
 * for and nobody had banned the rotation for. 12.9 degrees on a 0.24-deep
 * board lifts its rear corner 0.052, a whole book height, into its neighbour.
 * Rotation now has a measured ceiling of its own: see `leanClearance.ts`. The
 * two channels still move by different amounts, but no longer because one of
 * them was thought to be free. */
export const HOVER_MOTION_SCALE = 2.5;

/**
 * WHICH PROPS YOU CAN PICK UP — the rule, in one place, so it can be overruled
 * in one place.
 *
 * The complaint was not that too few things were draggable, it was that the
 * set looked arbitrary: "why can i drag the pencil holder but not the apple,
 * ladder, weights, golf + basketball, etc.?". So the answer has to be a rule
 * rather than a list, and one anyone can apply to the next prop without asking.
 *
 * **A prop is draggable when it is a small, loose object that merely STANDS on
 * a plank.** Four conditions, all of them checkable:
 *
 *   1. SIZE — greatest MEASURED WORLD dimension at or under TILT_MAX_SIZE.
 *      Never the `scale` prop, which is a multiplier over source models that
 *      differ by an order of magnitude. Grabbable warns in dev when a prop it
 *      wraps measures over the line. Same number as the nod, deliberately:
 *      "small enough to tip about the edge it rests on" and "small enough to
 *      pick up" are one judgement about one object.
 *   2. LOOSE — nothing holds it. Not pinned (the corkboard prints), not hung,
 *      not leaning against the shelf back (the corkboard itself), not
 *      structurally part of another prop (a bookend holding a row up, the
 *      plate stack on a barbell).
 *   3. NOT A PHOTOGRAPH — every print in the room links to its source post
 *      now, and a drag and a click on the same print fight. A print is placed,
 *      not handled.
 *   4. NO RIG — it carries no light of its own (see litByOwnRig). Moving a
 *      prop slides it out of a lighting rig authored around it, and the light
 *      stays behind.
 *
 * Two things the rule cannot decide, because they are taste rather than
 * geometry:
 *   - A prop can be an EGG or a HANDLE, not both. The basketball bounces and
 *     the dedicated golf balls queue a club strike on click; picking either
 *     up would mean giving that interaction up.
 *   - A prop CAN be a portal and a handle at once — Grabbable takes `to`/`href`
 *     and opens on a press that never moved — so the weights can keep leading
 *     to weightlifting.chappyasel.com while also being liftable.
 */
export const DRAGGABLE_RULE = "small, loose, and it only stands there";

const boxScratch = new THREE.Box3();
const matScratch = new THREE.Matrix4();
const invScratch = new THREE.Matrix4();
const vecScratch = new THREE.Vector3();

/**
 * AABB of a subtree's renderable MESHES, in the subtree root's own frame.
 *
 * Deliberately not `Box3.setFromObject`: that walks sprites and helper meshes
 * too. Nearly every prop on these shelves carries a camera-facing ContactShade
 * billboard, while line shaders and invisible pointer targets can have backing
 * geometry much larger than the thing they draw. Either would move a hinge
 * edge into thin air. `physicsIgnore` is the shared opt-out for those helpers,
 * matching the collider walk in `physicsColliders.ts`.
 *
 * Returns null for a subtree with no geometry yet — a GLB that has not
 * streamed in measures empty, and an empty measurement must never be cached as
 * a real one.
 */
export function meshBoxInLocal(root: THREE.Object3D): THREE.Box3 | null {
  root.updateWorldMatrix(true, true);
  invScratch.copy(root.matrixWorld).invert();
  const out = new THREE.Box3();
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (
      !mesh.isMesh ||
      !child.visible ||
      (child.userData as { physicsIgnore?: boolean }).physicsIgnore === true
    )
      return;
    const geometry = mesh.geometry;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;
    boxScratch.copy(geometry.boundingBox);
    matScratch.multiplyMatrices(invScratch, child.matrixWorld);
    boxScratch.applyMatrix4(matScratch);
    out.union(boxScratch);
  });
  return out.isEmpty() ? null : out;
}

/**
 * Is this prop lit by a rig authored AROUND it rather than inside it?
 *
 * The floor lamp on Talks is the pattern: the model is one child of a group,
 * and its spotLight, glow sprites and emissive shade discs are SIBLINGS placed
 * in the parent's frame at heights measured off the model. Move or turn the
 * model and it slides out of its own light, which stays behind. A prop like
 * this gets no generic hover motion at all.
 *
 * Proximity is what makes this safe to ask. "Does my parent contain lights?"
 * is far too blunt: the mug on About shares its group with the desk lamp's
 * whole rig and would lose its response for standing next to a lamp. A light
 * that is PART of a prop sits inside that prop's own bounding box, so the test
 * is containment, not kinship. Two levels up, because the rig is often a
 * sibling of the trigger that wraps the model rather than of the model itself.
 *
 * Real lights only, never sprites: ContactShade and FootPool are sprites
 * hugging a prop's base and nearly every prop has one, so counting sprites
 * would disable the response almost everywhere. Every glow sprite in this
 * scene accompanies a real light, so the lights alone identify every rig.
 *
 * `worldBox` must be in WORLD space.
 */
export function litByOwnRig(
  group: THREE.Object3D,
  worldBox: THREE.Box3,
): boolean {
  const near = worldBox.clone().expandByScalar(0.02);
  let found = false;
  const scan = (o: THREE.Object3D) => {
    if (found || o === group) return; // never our own subtree
    if (
      (o as THREE.Light).isLight === true &&
      near.containsPoint(o.getWorldPosition(vecScratch))
    ) {
      found = true;
      return;
    }
    for (const child of o.children) scan(child);
  };
  let scope: THREE.Object3D | null = group.parent;
  for (let up = 0; up < 2 && scope && !found; up++, scope = scope.parent) {
    for (const child of scope.children) scan(child);
  }
  return found;
}

/** How far up the tree to look for the thing resting on a prop.
 *
 * Four, because the shells nest: a Grabbable's measured node is its `nod`,
 * inside an `impulse` group, inside the carrier that owns `base` — so the
 * siblings that could be stacked on it are three levels up, and a Lift's are
 * one. Cheaper than it looks: the walk stops at the FIRST scope that finds
 * anything, so a lone prop pays one shallow pass and a stacked one stops at
 * its own stack. */
const CLEARANCE_SCOPE_LEVELS = 4;

/** How far a neighbour's underside may sit BELOW a prop's top face and still
 * count as resting on it. Half a centimetre at the shelves' 2 units/m. */
const CLEARANCE_CONTACT = 0.01;

const clearanceBoxScratch = new THREE.Box3();
const clearanceMatScratch = new THREE.Matrix4();
const clearanceInvScratch = new THREE.Matrix4();

/**
 * Vertical air above a prop before a neighbour's geometry begins, measured in
 * the prop's OWN frame. Infinity when nothing is stacked on it.
 *
 * WHY THIS EXISTS. `hingeShift` pins the contact edge so a tilt cannot drive a
 * prop down through the plank it stands on, and the constant that scales hover
 * motion says as much: "rotation has no such ceiling ... it can be doubled
 * without anything leaving the plank." That is true of the plank BELOW and
 * false of everything above. A book in a horizontal stack has its neighbour
 * resting flat on its top face with no gap at all — `FLAT_LIFT` in
 * primitives.tsx has said "a volume inside a horizontal stack cannot rise
 * without entering the one above it" since long before ADR 0020 — and a 12.9
 * degree tilt raises a 0.24-deep board's rear corner 0.052, which is a whole
 * book height. The rise was banned and the rotation was not, so ADR 0020's
 * automatic nod walked straight back into the collision the ban was written
 * for. Measuring is the fix rather than a list of stacked call sites, because
 * this is the same bug `hingeShift` describes as having regrown in eleven
 * places, and the twelfth will be authored by someone who never read this.
 *
 * WHAT COUNTS. A renderable mesh, visible, not marked `physicsIgnore`, whose
 * box overlaps ours in X and Z, reaches above our top face, and BEGINS at or
 * near it. Sprites are excluded by `isMesh`, which is what keeps every prop's
 * ContactShade from reading as a lid. Same filters as `meshBoxInLocal`, for
 * the same reasons.
 *
 * That third test is what makes the question "is something resting on me"
 * rather than "is something taller than me nearby". Without it an upright book
 * standing alongside a flat stack — floor to well above our top, and possibly
 * overlapping by a stagger — would read as a lid and silence a prop that has
 * nothing on it at all. `CLEARANCE_CONTACT` is the slack: a stack authored as
 * exactly touching measures zero, and one authored with a hair of overlap to
 * hide a bevel still has to read as touching.
 *
 * Neighbours are read at their LAST RENDERED transform rather than forced up
 * to date. This runs on a prop's first hover, hundreds of frames after the
 * renderer began updating the whole scene every frame, and the neighbour we
 * care about is by definition a thing sitting still on a shelf.
 */
export function clearanceAbove(
  group: THREE.Object3D,
  localBox: THREE.Box3,
): number {
  clearanceInvScratch.copy(group.matrixWorld).invert();
  let gap = Number.POSITIVE_INFINITY;
  const scan = (o: THREE.Object3D) => {
    // Prunes our own subtree, exactly as litByOwnRig does: the measured node
    // is reached through its ancestors and recursion stops the moment it is.
    if (o === group) return;
    const mesh = o as THREE.Mesh;
    if (
      mesh.isMesh === true &&
      o.visible &&
      (o.userData as { physicsIgnore?: boolean }).physicsIgnore !== true &&
      mesh.geometry
    ) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox;
      if (bounds) {
        clearanceBoxScratch.copy(bounds);
        clearanceMatScratch.multiplyMatrices(
          clearanceInvScratch,
          o.matrixWorld,
        );
        clearanceBoxScratch.applyMatrix4(clearanceMatScratch);
        const b = clearanceBoxScratch;
        if (
          b.min.x < localBox.max.x &&
          b.max.x > localBox.min.x &&
          b.min.z < localBox.max.z &&
          b.max.z > localBox.min.z &&
          // Reaches ABOVE our top face. A neighbour at the same level, or the
          // board this prop is standing ON, is not a lid.
          b.max.y > localBox.max.y &&
          // ...and STARTS there. A tall thing standing beside us rises past
          // our top but begins at the plank, and it is not on us.
          b.min.y > localBox.max.y - CLEARANCE_CONTACT
        ) {
          gap = Math.min(gap, Math.max(0, b.min.y - localBox.max.y));
        }
      }
    }
    for (const child of o.children) scan(child);
  };
  let scope: THREE.Object3D | null = group.parent;
  for (
    let up = 0;
    up < CLEARANCE_SCOPE_LEVELS && scope && !Number.isFinite(gap);
    up++, scope = scope.parent
  ) {
    for (const child of scope.children) scan(child);
  }
  return gap;
}

/** Where a hover tilt hinges, in the measured group's own coordinates, plus
 * the world size the gate was decided on (reported either way — it is what a
 * dev log is for). */
export type Hinge = {
  /** Local support edge for a positive X tilt. */
  positiveTiltPivot: THREE.Vector3;
  /** Local support edge for a negative X tilt. */
  negativeTiltPivot: THREE.Vector3;
  /** Greatest world dimension, scene units. */
  size: number;
  /** Null when the prop may tilt; otherwise why it may not. */
  reason: string | null;
  /** Signed local height of the corner that RISES, measured from the support
   * edge: the top face for a prop standing on something, the bottom face
   * (hence negative) for one hanging from its top. */
  swingHeight: number;
  /** Local Z span between the two pivot edges — how far the rising corner
   * reaches out from the hinge, which is what turns an angle into a travel. */
  depth: number;
  /** Local vertical air above the top face before a neighbour begins, or
   * Infinity. See `clearanceAbove`. */
  headroom: number;
};

/**
 * Work out the edge a prop should hinge about when the pointer crosses it.
 *
 * A rotation about the group ORIGIN is the wrong shape of motion and it is the
 * bug this scene keeps regrowing in a new place: half the object goes up and
 * the other half goes DOWN, through the plank it is standing on. Real objects
 * tip about the edge they are resting on. A positive X tilt uses the
 * front-bottom edge so the rear rises. A negative X tilt uses the rear-bottom
 * edge so the front rises. The live camera decides which tilt applies.
 *
 * `held` inverts the Y half of that. A print pinned to the corkboard hangs
 * from brass at its TOP corner; hinging it at the bottom would swing the pin
 * out of the cork. The caller does not have to say so twice: a lift with no
 * vertical component IS the call site declaring the prop cannot rise, which is
 * only ever true of something held.
 *
 * Returns a reason instead of a pivot when the prop must not tilt: too big to
 * be anything but furniture, or carrying its own lighting rig. Returns null
 * only when there is nothing to measure yet, so the caller can ask again once
 * the model has streamed in.
 *
 * The pivot protects the support BELOW and nothing above it, so the result
 * also carries the measurements `leanBudget` needs to keep a prop out of
 * whatever is stacked on it. See `leanClearance.ts`.
 */
export function hingeFor(
  group: THREE.Object3D,
  held: boolean,
  maxSize: number = HOVER_MAX_SIZE,
): Hinge | null {
  const local = meshBoxInLocal(group);
  if (!local) return null;
  // World size, not local: ancestors carry the unit pose and the two house
  // scales (2.00 units/m on the shelves, ~0.96 on the floor).
  group.getWorldScale(vecScratch);
  const s = local.getSize(new THREE.Vector3());
  const size = Math.max(
    s.x * Math.abs(vecScratch.x),
    s.y * Math.abs(vecScratch.y),
    s.z * Math.abs(vecScratch.z),
  );
  const supportY = held ? local.max.y : local.min.y;
  const positiveTiltPivot = new THREE.Vector3(0, supportY, local.max.z);
  const negativeTiltPivot = new THREE.Vector3(0, supportY, local.min.z);
  const worldBox = local.clone().applyMatrix4(group.matrixWorld);
  const reason = litByOwnRig(group, worldBox)
    ? "rig"
    : size > maxSize
      ? "furniture"
      : null;
  return {
    positiveTiltPivot,
    negativeTiltPivot,
    size,
    reason,
    swingHeight: held ? -s.y : s.y,
    depth: s.z,
    // Not measured for a prop that HANGS: the corner that swings on one of
    // those is below the pivot, and a corkboard print has nothing stacked on
    // it by construction.
    headroom: held ? Number.POSITIVE_INFINITY : clearanceAbove(group, local),
  };
}

/** Choose the support edge that makes the opposite side rise. */
export function hingePivotForTilt(hinge: Hinge, tilt: number) {
  return tilt < 0 ? hinge.negativeTiltPivot : hinge.positiveTiltPivot;
}
