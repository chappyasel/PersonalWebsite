// The path the live scene cannot exercise today: a Grabbable nested inside a
// TRANSLATED and ROTATED layout group. Both existing grabbables happen to hang
// off an untransformed fragment <group>, so their frame transform is the
// identity and passes trivially — which is exactly the case that was never
// broken. This builds the geometry the unit files WILL have once props are
// wrapped, and checks the two things the rewrite has to get right:
//
//   1. resolveShelf() picks the PLANK group, not the layout group, and names
//      the right plank from world y — at any nesting depth, and through a
//      unit root that carries the unit's yaw and a 4.4-unit x offset.
//   2. the pose round-trip (parent frame → shelf frame → parent frame) is the
//      identity, so a prop handed to the solver comes back where it started.
//
// Run: node_modules/.bin/tsx scripts/stacks-frames.test.ts
import * as THREE from "three";

import { resolveShelf } from "~/app/components/stacks/scene/physics";
import { SHELF_SURFACE } from "~/app/components/stacks/scene/shelfGeometry";

const SHELF = SHELF_SURFACE;
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(
    `${ok ? "ok  " : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`,
  );
  if (!ok) failures++;
};

/** A unit exactly as Scene.tsx builds it: yawed, offset down the room. */
function unit(index: number) {
  const root = new THREE.Group();
  root.position.set(index * 4.4, 0, index % 2 === 0 ? 0 : -0.55);
  root.rotation.set(0, index % 2 === 0 ? 0.1 : -0.12, 0);
  const top = new THREE.Group();
  top.position.set(0, SHELF.top, 0);
  const lower = new THREE.Group();
  lower.position.set(0, SHELF.lower, 0);
  root.add(top, lower);
  return { root, top, lower };
}

const { root, top, lower } = unit(3);
const scene = new THREE.Scene();
scene.add(root);

// Three props on ONE plank, wrapped exactly the way the unit files wrap them:
// one bare, one in a translated layout group, one two groups deep with a yaw.
const bare = new THREE.Group();
bare.position.set(-0.4, 0, 0.1);
lower.add(bare);

const layout = new THREE.Group();
layout.position.set(0.25, 0, 0);
const nested = new THREE.Group();
nested.position.set(0.3, 0, -0.05);
layout.add(nested);
lower.add(layout);

const outerA = new THREE.Group();
outerA.position.set(-0.8, 0, 0);
outerA.rotation.set(0, 0.37, 0);
const outerB = new THREE.Group();
outerB.position.set(0.15, 0, 0.2);
const deep = new THREE.Group();
deep.position.set(0.05, 0, 0);
outerA.add(outerB);
outerB.add(deep);
lower.add(outerA);

// …and one on the other plank, which must NOT resolve to the same shelf.
const upstairs = new THREE.Group();
const upLayout = new THREE.Group();
upLayout.position.set(0.5, 0, 0);
upLayout.add(upstairs);
top.add(upLayout);

scene.updateMatrixWorld(true);

// --- 1. resolution -----------------------------------------------------------
for (const [name, g] of [
  ["bare", bare],
  ["in a layout group", nested],
  ["two groups deep, yawed", deep],
] as const) {
  const r = resolveShelf(g);
  check(`${name}: shelf is the lower plank`, r.shelf === lower);
  check(`${name}: plane is "lower"`, r.plane === "lower", r.plane);
}
const up = resolveShelf(upstairs);
check("top-shelf prop resolves to the OTHER plank", up.shelf === top);
check('top-shelf prop plane is "top"', up.plane === "top", up.plane);
check(
  "the three lower props share one shelf (this is the collision fix)",
  resolveShelf(bare).shelf === resolveShelf(nested).shelf &&
    resolveShelf(nested).shelf === resolveShelf(deep).shelf,
);

// The old rule, for contrast: read the plank off the IMMEDIATE parent's LOCAL
// y, which is what shipped. All three props stand on the lower plank. The rule
// is right for the one whose parent IS the plank and wrong for both nested
// ones — which is the whole shape of the bug, and why it survived: it looks
// correct in exactly the case anyone writes a first test for.
for (const [name, g, shouldBeWrong] of [
  ["bare", bare, false],
  ["in a layout group", nested, true],
  ["two groups deep", deep, true],
] as const) {
  const old = g.parent!.position.y < -0.3 ? "lower" : "top";
  check(
    `old rule reads "${name}" as ${old}` +
      (shouldBeWrong ? " (wrong)" : " (right)"),
    (old === "top") === shouldBeWrong,
  );
}

// --- 2. pose round-trip ------------------------------------------------------
// The exact composition physics.ts uses: frame = shelf⁻¹ · parentWorld,
// decomposed to position + quaternion, applied forward in push() and inverted
// in pull().
function roundTrip(g: THREE.Object3D, label: string) {
  const { shelf } = resolveShelf(g);
  const parent = g.parent!;
  const m = new THREE.Matrix4()
    .copy(shelf.matrixWorld)
    .invert()
    .multiply(parent.matrixWorld);
  const frame = new THREE.Vector3();
  const frameQ = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(frame, frameQ, scale);
  const frameQi = frameQ.clone().invert();

  check(
    `${label}: frame is unscaled`,
    Math.abs(scale.x - 1) + Math.abs(scale.y - 1) + Math.abs(scale.z - 1) <
      1e-9,
    scale.toArray().join(", "),
  );

  // A pose in the prop's parent frame, tumbled as the solver would leave it.
  const pos = new THREE.Vector3(0.12, 0.31, -0.07);
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0.4, -1.1, 0.25),
  );

  const shelfPos = pos.clone().applyQuaternion(frameQ).add(frame);
  const shelfQuat = quat.clone().premultiply(frameQ);
  const backPos = shelfPos.clone().sub(frame).applyQuaternion(frameQi);
  const backQuat = shelfQuat.clone().premultiply(frameQi);

  check(
    `${label}: position round-trips`,
    backPos.distanceTo(pos) < 1e-9,
    `${backPos.distanceTo(pos)}`,
  );
  check(
    `${label}: rotation round-trips`,
    backQuat.angleTo(quat) < 1e-6,
    `${backQuat.angleTo(quat)}`,
  );

  // …and the forward transform genuinely agrees with the scene graph: a point
  // in the prop's parent frame must land where three.js says it lands.
  const viaFrame = pos.clone().applyQuaternion(frameQ).add(frame);
  const viaGraph = parent.localToWorld(pos.clone());
  shelf.worldToLocal(viaGraph);
  check(
    `${label}: agrees with the scene graph`,
    viaFrame.distanceTo(viaGraph) < 1e-9,
    `${viaFrame.distanceTo(viaGraph)}`,
  );
}
roundTrip(bare, "bare");
roundTrip(nested, "layout group");
roundTrip(deep, "two deep + yaw");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
