// The TJ medallion's shape, in one place, because two things need it and they
// used to describe it twice. `AuthoredProps.tsx` renders it into the scene and
// `scripts/generate-about-boot-silhouettes.mjs` traces its outline for the
// About boot SVG. The generator used to hand-copy these numbers and then hash
// the whole of AuthoredProps.tsx to decide whether its trace was stale, which
// meant editing any unrelated prop in that file failed a medallion test while
// editing the medallion's own numbers in only one of the two places failed
// nothing at all. Both consumers now read this file, and freshness is keyed to
// `tjMedallionSpecSignature()`.
//
// No `three` import here on purpose. `tjMedallionSolidGroup` takes the module
// as an argument so the scene bundle pulls in nothing but the numbers.

/**
 * @typedef {object} TjMedallionSolid
 * @property {string} id
 * @property {"cylinder" | "box"} shape
 * @property {number[]} args Constructor arguments, in three's own order.
 * @property {[number, number, number]} position
 * @property {[number, number, number]} rotation
 * @property {"barrel" | "strut" | "rim"} finish Which material the scene uses.
 */

/**
 * @typedef {object} TjMedallionFace
 * @property {string} id
 * @property {number} radius
 * @property {number} segments
 * @property {[number, number, number]} position
 */

/** The three shapes that form the silhouette: the barrel it stands on, the two
 * struts, and the disc they carry. */
/** @type {readonly TjMedallionSolid[]} */
export const TJ_MEDALLION_SOLIDS = Object.freeze([
  {
    id: "barrel",
    shape: "cylinder",
    args: [0.095, 0.105, 0.036, 16],
    position: [0, 0.018, 0],
    rotation: [0, 0, 0],
    finish: "barrel",
  },
  {
    id: "strut-left",
    shape: "box",
    args: [0.018, 0.12, 0.022],
    position: [-0.057, 0.074, -0.002],
    rotation: [0, 0, 0.32],
    finish: "strut",
  },
  {
    id: "strut-right",
    shape: "box",
    args: [0.018, 0.12, 0.022],
    position: [0.057, 0.074, -0.002],
    rotation: [0, 0, -0.32],
    finish: "strut",
  },
  {
    id: "rim",
    shape: "cylinder",
    args: [0.15, 0.15, 0.025, 32],
    position: [0, 0.202, 0],
    rotation: [Math.PI / 2, 0, 0],
    finish: "rim",
  },
]);

/** The coplanar discs on the front of the rim: the printed artwork and the
 * shimmer band that rides on top of it. They sit inside the rim's own circle,
 * so they never reach the outline — `tjMedallionGeometry.test.ts` asserts that
 * rather than trusting it, which is what lets the generator trace the solids
 * alone and still be complete. */
/** @type {readonly TjMedallionFace[]} */
export const TJ_MEDALLION_FACES = Object.freeze([
  {
    id: "artwork-face",
    radius: 0.143,
    segments: 32,
    position: [0, 0.202, 0.013],
  },
  {
    id: "shimmer-face",
    radius: 0.143,
    segments: 32,
    position: [0, 0.202, 0.014],
  },
]);

/** Matches ABOUT_TJ_LIGHT_YAW and the live scene scale. The scale cancels out
 * of the traced silhouette, which normalises to its own bounding box, but the
 * yaw does not: it is what the boot outline is drawn from. */
export const TJ_MEDALLION_POSE = Object.freeze({ yaw: -0.28, scale: 0.726 });

/** Canonical text for the whole specification. The silhouette generator hashes
 * this and stores the digest, so a change to any number here fails the
 * freshness test until the outline is retraced. Comments and formatting in this
 * file are deliberately not part of it. */
export function tjMedallionSpecSignature() {
  return JSON.stringify({
    version: 1,
    solids: TJ_MEDALLION_SOLIDS,
    faces: TJ_MEDALLION_FACES,
    pose: TJ_MEDALLION_POSE,
  });
}

/**
 * Build the silhouette-forming solids as a posed three group.
 * @param {typeof import("three")} THREE
 * @returns {import("three").Group}
 */
export function tjMedallionSolidGroup(THREE) {
  const group = new THREE.Group();
  for (const solid of TJ_MEDALLION_SOLIDS) {
    const geometry =
      solid.shape === "cylinder"
        ? new THREE.CylinderGeometry(
            solid.args[0],
            solid.args[1],
            solid.args[2],
            solid.args[3],
          )
        : new THREE.BoxGeometry(solid.args[0], solid.args[1], solid.args[2]);
    const mesh = new THREE.Mesh(geometry);
    mesh.position.fromArray(solid.position);
    mesh.rotation.fromArray(solid.rotation);
    group.add(mesh);
  }
  group.rotation.y = TJ_MEDALLION_POSE.yaw;
  group.scale.setScalar(TJ_MEDALLION_POSE.scale);
  return group;
}

/**
 * Front elevation of the posed solids, tessellation included, in scene units.
 * The generator's raster envelope is this box; keeping the derivation here lets
 * a test check the committed viewBox against the specification instead of
 * against a copy of it.
 * @param {typeof import("three")} THREE
 * @returns {{ width: number, height: number }}
 */
export function tjMedallionFrontElevation(THREE) {
  const group = tjMedallionSolidGroup(THREE);
  group.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  group.traverse((object) => {
    const mesh = /** @type {import("three").Mesh} */ (object);
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute("position");
    const vertex = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 1) {
      vertex
        .fromBufferAttribute(position, index)
        .applyMatrix4(mesh.matrixWorld);
      box.expandByPoint(vertex);
    }
  });
  return { width: box.max.x - box.min.x, height: box.max.y - box.min.y };
}
