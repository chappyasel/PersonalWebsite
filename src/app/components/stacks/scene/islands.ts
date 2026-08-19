// Runtime connected-island decomposition for the prop GLBs.
//
// Several props are authored as ONE mesh with one material — globe.glb is a
// single 478-triangle mesh holding a base, a stem, two axle pins, a meridian
// ring and the ball. Anything that has to animate a PART of a prop (spin the
// ball, not the stand) needs those parts back, and the only structure left in
// the file is connectivity.
//
// This is the browser-side twin of the island split in
// scripts/stacks-render.mjs; that script is the place to inspect a prop's
// islands offline (`node scripts/stacks-render.mjs globe --report`).
//
// Two traps, both already paid for:
// - Positions MUST be welded onto a grid first. Meshopt quantization leaves a
//   solid's shared corners at very slightly different coordinates, and raw
//   index connectivity shatters one ball into dozens of fragments.
// - Never identify a part by island INDEX. Traversal order is an artifact of
//   the exporter, and the next re-export through scripts/stacks-models.mjs can
//   reorder it silently. Identify by shape, and assert.
import * as THREE from "three";

export type Island = {
  /** Triangle ordinals into the source geometry, in draw order. */
  triangles: number[];
  min: THREE.Vector3;
  max: THREE.Vector3;
  center: THREE.Vector3;
  extent: THREE.Vector3;
  /** min(extent) / max(extent) — 1 is a perfect cube, and for a closed hull
   * that means a sphere. The globe's ball reads 1.000 against 0.394 for the
   * next nearest island, which is what makes this a safe discriminator. */
  sphericity: number;
};

const WELD = 1e-4;

/** Split a geometry into connected components by welded position. */
export function findIslands(geo: THREE.BufferGeometry): Island[] {
  const pos = geo.attributes.position;
  if (!pos) return [];
  const index = geo.index;
  const triCount = (index ? index.count : pos.count) / 3;

  const ids = new Map<string, number>();
  const vertexId = (i: number) => {
    const key = `${Math.round(pos.getX(i) / WELD)},${Math.round(pos.getY(i) / WELD)},${Math.round(pos.getZ(i) / WELD)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }
    return id;
  };

  const corners: number[][] = [];
  for (let t = 0; t < triCount; t++) {
    const a = index ? index.getX(t * 3) : t * 3;
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    corners.push([vertexId(a), vertexId(b), vertexId(c)]);
  }

  const parent = Array.from({ length: ids.size }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]!]!;
    return x;
  };
  const union = (x: number, y: number) => {
    const a = find(x);
    const b = find(y);
    if (a !== b) parent[a] = b;
  };
  for (const [a, b, c] of corners) {
    union(a!, b!);
    union(b!, c!);
  }

  const groups = new Map<number, number[]>();
  corners.forEach(([a], t) => {
    const root = find(a!);
    const list = groups.get(root);
    if (list) list.push(t);
    else groups.set(root, [t]);
  });

  const islands: Island[] = [];
  for (const triangles of groups.values()) {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const v = new THREE.Vector3();
    for (const t of triangles) {
      for (let k = 0; k < 3; k++) {
        const i = index ? index.getX(t * 3 + k) : t * 3 + k;
        v.fromBufferAttribute(pos, i);
        min.min(v);
        max.max(v);
      }
    }
    const extent = max.clone().sub(min);
    islands.push({
      triangles,
      min,
      max,
      extent,
      center: min.clone().add(max).multiplyScalar(0.5),
      sphericity:
        Math.min(extent.x, extent.y, extent.z) /
        (Math.max(extent.x, extent.y, extent.z) || 1),
    });
  }
  return islands;
}

/** The most sphere-like island, or null if nothing is convincingly round. */
export function findSphereIsland(
  islands: Island[],
  totalTriangles: number,
): Island | null {
  let best: Island | null = null;
  for (const isle of islands) {
    if (isle.sphericity < 0.8) continue;
    // A stray 8-triangle bead is round too. The part worth animating is a
    // major mass of the prop, not a rivet.
    if (isle.triangles.length < totalTriangles * 0.2) continue;
    if (!best || isle.sphericity > best.sphericity) best = isle;
  }
  return best;
}

/**
 * The axis a ball turns on, read off the hardware that holds it.
 *
 * A desk globe is mounted on two pins at its poles, and on globe.glb they are
 * a matched pair of 22-triangle islands with identical extents sitting on
 * exact opposite sides of the ball. The line between their centres is the
 * axle, and on this model it comes out 22.4° off vertical — the real 23.4°
 * axial tilt, already authored in. Deriving it beats hardcoding: the tilt is
 * the whole reason a globe reads as a globe rather than a ball on a spike,
 * and a re-export that changes it would otherwise go unnoticed.
 *
 * Returns a unit vector pointing up. Falls back to +Y when no pin pair is
 * found, which is safe — see the note in ModelProp about why a sphere can
 * spin about any axis through its own centre without touching its ring.
 */
export function findSpinAxis(
  islands: Island[],
  ball: Island,
): { axis: THREE.Vector3; tiltDegrees: number; derived: boolean } {
  const others = islands.filter((i) => i !== ball);
  let bestPair: [Island, Island] | null = null;
  let bestBalance = Infinity;

  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) {
      const a = others[i]!;
      const b = others[j]!;
      if (a.triangles.length !== b.triangles.length) continue;
      // Matched hardware: same part, mirrored. This is what separates the
      // pins from the stem, which happens to share their triangle count.
      const spread = Math.max(a.extent.length(), b.extent.length()) || 1;
      if (a.extent.distanceTo(b.extent) > spread * 0.1) continue;
      const oa = a.center.clone().sub(ball.center);
      const ob = b.center.clone().sub(ball.center);
      if (oa.length() < 1e-6 || ob.length() < 1e-6) continue;
      // Opposite poles, not two beads on the same side.
      if (oa.clone().normalize().dot(ob.clone().normalize()) > -0.8) continue;
      const balance = Math.abs(oa.length() - ob.length());
      if (balance < bestBalance) {
        bestBalance = balance;
        bestPair = [a, b];
      }
    }
  }

  if (!bestPair) {
    return { axis: new THREE.Vector3(0, 1, 0), tiltDegrees: 0, derived: false };
  }
  const [a, b] = bestPair;
  const axis = b.center.clone().sub(a.center).normalize();
  if (axis.y < 0) axis.negate();
  return {
    axis,
    tiltDegrees: THREE.MathUtils.radToDeg(
      Math.acos(THREE.MathUtils.clamp(axis.y, -1, 1)),
    ),
    derived: true,
  };
}

/**
 * Copy a subset of triangles into a standalone non-indexed geometry.
 * De-interleaved on purpose: meshopt geometry arrives interleaved, and every
 * three.js utility that touches it in place has a way of degenerating it.
 * `optionalOffset`/`optionalRotation` bake the part into its own local frame
 * so a parent group can rotate it around its own centre.
 */
export function extractTriangles(
  geo: THREE.BufferGeometry,
  triangles: number[],
  optionalOffset?: THREE.Vector3,
  optionalRotation?: THREE.Quaternion,
): THREE.BufferGeometry {
  const index = geo.index;
  const out = new THREE.BufferGeometry();
  const vertexCount = triangles.length * 3;
  const v = new THREE.Vector3();

  for (const [name, attribute] of Object.entries(geo.attributes)) {
    const src = attribute as THREE.BufferAttribute;
    const itemSize = src.itemSize;
    const array = new Float32Array(vertexCount * itemSize);
    let w = 0;
    const spatial = name === "position" || name === "normal";
    for (const t of triangles) {
      for (let k = 0; k < 3; k++) {
        const i = index ? index.getX(t * 3 + k) : t * 3 + k;
        if (spatial && (optionalOffset || optionalRotation)) {
          v.set(
            src.getComponent(i, 0),
            src.getComponent(i, 1),
            src.getComponent(i, 2),
          );
          // Normals rotate but must not translate.
          if (optionalOffset && name === "position") v.sub(optionalOffset);
          if (optionalRotation) v.applyQuaternion(optionalRotation);
          array[w++] = v.x;
          array[w++] = v.y;
          array[w++] = v.z;
          continue;
        }
        for (let c = 0; c < itemSize; c++) array[w++] = src.getComponent(i, c);
      }
    }
    out.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
  }
  // Freed by ModelProp's disposal effect; the source geometry belongs to the
  // useGLTF cache and must never be disposed.
  out.userData.owned = true;
  return out;
}

/** Partition a spherical triangle set into local octants. Rendering remains
 * byte-for-byte the same when the returned parts share a material and parent
 * transform, while per-mesh collision bounds follow the curved surface much
 * more closely than one cube around the complete sphere. */
export function partitionTrianglesByOctant(
  geometry: THREE.BufferGeometry,
  triangles: readonly number[],
  center: THREE.Vector3,
  localRotation: THREE.Quaternion,
): number[][] {
  const positions = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const parts = Array.from({ length: 8 }, () => [] as number[]);
  const centroid = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  for (const triangle of triangles) {
    centroid.set(0, 0, 0);
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex =
        index?.getX(triangle * 3 + corner) ?? triangle * 3 + corner;
      vertex.fromBufferAttribute(positions, vertexIndex);
      centroid.add(vertex);
    }
    centroid
      .multiplyScalar(1 / 3)
      .sub(center)
      .applyQuaternion(localRotation);
    const octant =
      (centroid.x >= 0 ? 1 : 0) |
      (centroid.y >= 0 ? 2 : 0) |
      (centroid.z >= 0 ? 4 : 0);
    parts[octant]!.push(triangle);
  }
  return parts.filter((part) => part.length > 0);
}
