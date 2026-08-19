import * as THREE from "three";

import { findIslands } from "./islands";

/** Complex handheld props in the shipped model set top out at 17 connected
 * pieces. Twenty-four keeps those real silhouettes intact while retaining a
 * hard narrowphase budget for future assets. */
export const MAX_DYNAMIC_COLLIDER_SHAPES = 24;
export const MAX_STATIC_COLLIDER_SHAPES = 96;
export const MIN_COLLIDER_EXTENT = 0.008;
/** Cannon uses a slight horizontal inset so visual edges do not snag. The
 * diagnostics overlay uses this same value and therefore draws the real hull. */
export const DYNAMIC_COLLIDER_HORIZONTAL_INSET = 0.9;
/** Planters are tapered and leafy models exaggerate their square island AABB.
 * Insets may clip the outer rim slightly, which is preferable to invisible
 * corners blocking grabs beside the pot. */
export const FOLIAGE_BASE_HORIZONTAL_INSET = 0.85;

const MERGE_GAP = 0.02;
const ORIENTATION_EPS = 1e-4;

export type ColliderReason =
  | "compound-budget-fallback"
  | "static-budget-truncated";

export type OrientedBoxCollider = {
  halfExtents: THREE.Vector3;
  offset: THREE.Vector3;
  quaternion: THREE.Quaternion;
  source: string;
};

export type ColliderExtraction = {
  boxes: OrientedBoxCollider[];
  bounds: THREE.Box3 | null;
  signature: string;
  reasons: ColliderReason[];
};

export type DynamicColliderProfile = "full" | "foliage-base";

type ExtractOptions = {
  excludeRoots?: ReadonlySet<THREE.Object3D>;
  maxShapes?: number;
  fallbackToBounds?: boolean;
  splitDisconnected?: boolean;
};

const centre = new THREE.Vector3();
const size = new THREE.Vector3();
const scale = new THREE.Vector3();
const matrix = new THREE.Matrix4();
const inverse = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const islandBounds = new WeakMap<THREE.BufferGeometry, THREE.Box3[]>();

function disconnectedBounds(geometry: THREE.BufferGeometry) {
  const cached = islandBounds.get(geometry);
  if (cached) return cached;
  const boxes = findIslands(geometry).map(
    (island) => new THREE.Box3(island.min.clone(), island.max.clone()),
  );
  islandBounds.set(geometry, boxes);
  return boxes;
}

function canonicalQuaternion(input: THREE.Quaternion) {
  const q = input.clone().normalize();
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  return q;
}

function sameOrientation(a: THREE.Quaternion, b: THREE.Quaternion) {
  return 1 - Math.abs(a.dot(b)) <= ORIENTATION_EPS;
}

function ignored(object: THREE.Object3D) {
  const data = object.userData as {
    physicsIgnore?: boolean;
    contactShade?: boolean;
  };
  return (
    !object.visible || data.physicsIgnore === true || data.contactShade === true
  );
}

function boxCorners(box: OrientedBoxCollider, out: THREE.Box3) {
  out.makeEmpty();
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1])
        out.expandByPoint(
          new THREE.Vector3(
            x * box.halfExtents.x,
            y * box.halfExtents.y,
            z * box.halfExtents.z,
          )
            .applyQuaternion(box.quaternion)
            .add(box.offset),
        );
  return out;
}

function unionBounds(boxes: OrientedBoxCollider[]) {
  if (boxes.length === 0) return null;
  const out = new THREE.Box3();
  const part = new THREE.Box3();
  for (const box of boxes) out.union(boxCorners(box, part));
  return out;
}

function orientationFrameBounds(box: OrientedBoxCollider) {
  const qInv = box.quaternion.clone().invert();
  return new THREE.Box3(
    box.offset.clone().applyQuaternion(qInv).sub(box.halfExtents),
    box.offset.clone().applyQuaternion(qInv).add(box.halfExtents),
  );
}

/** Merge only boxes whose axes agree. This closes tiny seams in a stack while
 * retaining the authored rotation that an AABB would erase. */
export function mergeOrientedBoxes(boxes: OrientedBoxCollider[]) {
  const pad = new THREE.Vector3(MERGE_GAP, MERGE_GAP, MERGE_GAP);
  for (let changed = true; changed; ) {
    changed = false;
    outer: for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i]!;
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j]!;
        if (!sameOrientation(a.quaternion, b.quaternion)) continue;
        const af = orientationFrameBounds(a);
        const bf = orientationFrameBounds(b);
        if (!af.clone().expandByVector(pad).intersectsBox(bf)) continue;
        af.union(bf);
        const mergedCentre = af.getCenter(new THREE.Vector3());
        const mergedHalf = af.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        boxes[i] = {
          halfExtents: mergedHalf,
          offset: mergedCentre.applyQuaternion(a.quaternion),
          quaternion: a.quaternion.clone(),
          source: `${a.source}+${b.source}`,
        };
        boxes.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return boxes;
}

function signatureFor(boxes: OrientedBoxCollider[], reasons: ColliderReason[]) {
  const rounded = (value: number) => Math.round(value * 10000) / 10000;
  return JSON.stringify({
    boxes: boxes.map((box) => [
      ...box.offset.toArray().map(rounded),
      ...box.halfExtents.toArray().map(rounded),
      ...box.quaternion.toArray().map(rounded),
    ]),
    reasons,
  });
}

/** Extract mesh-local boxes into `root` coordinates. Each mesh retains its
 * orientation; sprites and invisible/helper geometry never enter the walk. */
export function extractColliderBoxes(
  root: THREE.Object3D,
  options: ExtractOptions = {},
): ColliderExtraction {
  root.updateWorldMatrix(true, true);
  inverse.copy(root.matrixWorld).invert();
  const rootInverse = inverse.clone();
  const boxes: OrientedBoxCollider[] = [];
  const excluded = options.excludeRoots;

  const walk = (object: THREE.Object3D) => {
    if (object !== root && excluded?.has(object)) return;
    if (ignored(object)) return;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const geometryBoxes = options.splitDisconnected
        ? disconnectedBounds(mesh.geometry)
        : mesh.geometry.boundingBox
          ? [mesh.geometry.boundingBox]
          : [];
      if (geometryBoxes.length) {
        matrix.multiplyMatrices(rootInverse, mesh.matrixWorld);
        matrix.decompose(position, quaternion, scale);
        const absoluteScale = scale
          .clone()
          .set(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
        geometryBoxes.forEach((geometryBox, index) => {
          geometryBox.getSize(size).multiply(absoluteScale);
          if (Math.min(size.x, size.y, size.z) < MIN_COLLIDER_EXTENT) return;
          geometryBox.getCenter(centre).applyMatrix4(matrix);
          boxes.push({
            halfExtents: size.clone().multiplyScalar(0.5),
            offset: centre.clone(),
            quaternion: canonicalQuaternion(quaternion),
            source: options.splitDisconnected
              ? `${mesh.name || mesh.uuid}:island:${index}`
              : mesh.name || mesh.uuid,
          });
        });
      }
    }
    for (const child of object.children) walk(child);
  };
  walk(root);
  // Connected-island decomposition is specifically requested when empty
  // space inside a concave prop matters. Re-merging overlapping island AABBs
  // would chain leaves, arches, sails, or weight plates straight back into
  // the single coarse root box this path exists to avoid.
  if (!options.splitDisconnected) mergeOrientedBoxes(boxes);

  const reasons: ColliderReason[] = [];
  const maxShapes = options.maxShapes;
  const bounds = unionBounds(boxes);
  if (maxShapes !== undefined && boxes.length > maxShapes) {
    if (options.fallbackToBounds && bounds) {
      const fallbackCentre = bounds.getCenter(new THREE.Vector3());
      const fallbackHalf = bounds
        .getSize(new THREE.Vector3())
        .multiplyScalar(0.5);
      boxes.splice(0, boxes.length, {
        halfExtents: fallbackHalf,
        offset: fallbackCentre,
        quaternion: new THREE.Quaternion(),
        source: "root-aabb-fallback",
      });
      reasons.push("compound-budget-fallback");
    } else {
      boxes.splice(maxShapes);
      reasons.push("static-budget-truncated");
    }
  }
  return { boxes, bounds, signature: signatureFor(boxes, reasons), reasons };
}

/** The one dynamic-prop extraction policy used by Cannon and diagnostics.
 * GLBs frequently pack a branched object into one mesh, so mesh AABBs are not
 * a meaningful collision primitive. Connected-island boxes preserve the
 * empty space around leaves, headphone arches, sails, lamp arms, and weight
 * plates without introducing convex-hull machinery into Cannon. */
export function extractDynamicColliderBoxes(
  root: THREE.Object3D,
  profile: DynamicColliderProfile = "full",
) {
  if (profile === "foliage-base") {
    const extraction = extractColliderBoxes(root, {
      splitDisconnected: true,
    });
    const base = extraction.boxes.reduce<OrientedBoxCollider | null>(
      (largest, box) => {
        const volume =
          box.halfExtents.x * box.halfExtents.y * box.halfExtents.z;
        const largestVolume = largest
          ? largest.halfExtents.x *
            largest.halfExtents.y *
            largest.halfExtents.z
          : Number.NEGATIVE_INFINITY;
        return volume > largestVolume ? box : largest;
      },
      null,
    );
    const boxes = base
      ? [
          {
            ...base,
            halfExtents: new THREE.Vector3(
              base.halfExtents.x * FOLIAGE_BASE_HORIZONTAL_INSET,
              base.halfExtents.y,
              base.halfExtents.z * FOLIAGE_BASE_HORIZONTAL_INSET,
            ),
          },
        ]
      : [];
    const reasons: ColliderReason[] = [];
    return {
      boxes,
      bounds: unionBounds(boxes),
      signature: signatureFor(boxes, reasons),
      reasons,
    };
  }
  return extractColliderBoxes(root, {
    maxShapes: MAX_DYNAMIC_COLLIDER_SHAPES,
    fallbackToBounds: true,
    splitDisconnected: true,
  });
}

/** A stable scene-geometry revision shared by statics, releases, diagnostics,
 * and tests. Registered roots are represented by identity, not their moving
 * child geometry, so carrying a prop does not rebuild the world around it. */
export function geometryRevision(
  root: THREE.Object3D,
  excluded: ReadonlySet<THREE.Object3D>,
) {
  return extractColliderBoxes(root, {
    excludeRoots: excluded,
    maxShapes: MAX_STATIC_COLLIDER_SHAPES,
  }).signature;
}
