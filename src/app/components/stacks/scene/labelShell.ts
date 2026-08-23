// A label strip that follows a prop's real cross-section.
//
// The Training tub (protein-powder.glb) is a rounded square in plan, and its
// wall sits at different radii across the flats and at the corners. A label
// painted on a plain cylinder can therefore only ever be wrong in one of two
// ways: inside the wall (invisible) or poking through the flats (the blue and
// orange stripes the shelf showed for a while). The fix is to read the wall
// back out of the loaded mesh, take the convex hull of a slice of it, push
// that hull out by a hair, and extrude it as an open strip with UVs measured
// along the perimeter, so one wrap of the texture is one trip around the tub.
//
// Perimeter parameterisation starts at the BACK of the prop (most -z) and
// walks clockwise as seen from above, so u = 0.5 lands at the front and text
// reads left-to-right from the viewer's side. The hull is pure geometry and
// carries no React; both pieces are unit-tested on synthetic polygons.
import * as THREE from "three";

export type Point2 = [number, number];

/** Andrew's monotone chain. Returns the hull counter-clockwise in (x, z)
 * maths convention (i.e. with +z "up" on the page); collinear points are
 * dropped. Fewer than three distinct points come back as-is. */
export function convexHull2D(points: Point2[]): Point2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const unique: Point2[] = [];
  for (const p of pts) {
    const last = unique[unique.length - 1];
    if (last?.[0] !== p[0] || last[1] !== p[1]) unique.push(p);
  }
  if (unique.length < 3) return unique;
  const cross = (o: Point2, a: Point2, b: Point2) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point2[] = [];
  for (const p of unique) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: Point2[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Reorder a hull so it starts at its rearmost point (min z) and runs
 * clockwise when viewed from above (+y). Exported for the test. */
export function orderForLabel(hull: Point2[]): Point2[] {
  if (hull.length < 3) return hull;
  // Signed area > 0 means counter-clockwise in (x, z) page convention, which
  // is what convexHull2D returns; viewed from above with +z toward the
  // viewer, that is clockwise on screen ... so it depends on the viewer's
  // frame. Fix the rule by geometry instead of by convention: after ordering,
  // the point AFTER the rearmost one must lie toward -x (the viewer's left),
  // so the walk reaches the front via the left side and u increases toward
  // +x across the front face.
  let start = 0;
  for (let i = 1; i < hull.length; i++) {
    if (hull[i]![1] < hull[start]![1]) start = i;
  }
  const rotated = hull.slice(start).concat(hull.slice(0, start));
  const next = rotated[1]!;
  const prev = rotated[rotated.length - 1]!;
  if (next[0] > prev[0]) {
    // Walking the wrong way round: reverse, keeping the start point first.
    return [rotated[0]!, ...rotated.slice(1).reverse()];
  }
  return rotated;
}

/** Build an open, outward-facing strip around `outline` between y0 and y1.
 * `inflate` scales the outline about its centroid (1.02 = 2% proud of the
 * wall). UVs: u is normalised perimeter distance from the first point (the
 * loop closes back to u = 1), v is 0 at y0 and 1 at y1. */
export function labelShellGeometry(
  outline: Point2[],
  y0: number,
  y1: number,
  inflate = 1.02,
): THREE.BufferGeometry {
  const ring = orderForLabel(convexHull2D(outline));
  const geo = new THREE.BufferGeometry();
  if (ring.length < 3) return geo;
  let cx = 0;
  let cz = 0;
  for (const [x, z] of ring) {
    cx += x;
    cz += z;
  }
  cx /= ring.length;
  cz /= ring.length;
  const pts: Point2[] = ring.map(([x, z]) => [
    cx + (x - cx) * inflate,
    cz + (z - cz) * inflate,
  ]);
  // Close the loop with a duplicate of the first point so u can reach 1.
  const loop = [...pts, pts[0]!];
  const lengths: number[] = [0];
  for (let i = 1; i < loop.length; i++) {
    const [ax, az] = loop[i - 1]!;
    const [bx, bz] = loop[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(bx - ax, bz - az));
  }
  const total = lengths[lengths.length - 1]! || 1;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < loop.length; i++) {
    const [x, z] = loop[i]!;
    // Outward normal: average of the two adjacent edge normals (the closing
    // duplicate shares the first point's neighbours).
    const prev = loop[(i - 1 + loop.length - 1) % (loop.length - 1)]!;
    const next = loop[(i + 1) % (loop.length - 1)]!;
    const e1x = x - prev[0];
    const e1z = z - prev[1];
    const e2x = next[0] - x;
    const e2z = next[1] - z;
    // Perpendicular to each edge, pointing away from the centroid.
    let nx = e1z + e2z;
    let nz = -(e1x + e2x);
    if (nx * (x - cx) + nz * (z - cz) < 0) {
      nx = -nx;
      nz = -nz;
    }
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    const u = lengths[i]! / total;
    positions.push(x, y0, z, x, y1, z);
    normals.push(nx, 0, nz, nx, 0, nz);
    uvs.push(u, 0, u, 1);
  }
  for (let i = 0; i < loop.length - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    // Two triangles per quad, wound so the face normal points outward for a
    // clockwise-from-above walk; DoubleSide material makes the winding moot
    // for rendering, but keep it honest for anything that reads it.
    indices.push(a, c, b, b, c, d);
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/** Cut a mesh's wall with horizontal planes between two heights (fractions of
 * its own y extent) and return the (x, z) footprint of those cuts, in the
 * mesh's world frame scaled by `scale`. Cutting edges, rather than collecting
 * vertices that happen to lie in the band, is what makes this work on a
 * low-poly tub whose wall is one tall quad strip with nothing in between.
 * `materialName` narrows a multi-material prop to the part that should carry
 * the label; `cuts` is how many planes to take across [from, to]. */
export function wallFootprint(
  root: THREE.Object3D,
  {
    scale = 1,
    materialName,
    from = 0.3,
    to = 0.7,
    cuts = 3,
  }: {
    scale?: number;
    materialName?: string;
    from?: number;
    to?: number;
    cuts?: number;
  },
): { points: Point2[]; yMin: number; yMax: number } {
  root.updateMatrixWorld(true);
  const points: Point2[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const entries: Array<{ mesh: THREE.Mesh; pos: THREE.BufferAttribute }> = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materialName && !mats.some((m) => m?.name === materialName)) return;
    const pos = mesh.geometry.attributes.position as
      | THREE.BufferAttribute
      | undefined;
    if (pos) entries.push({ mesh, pos });
  });
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const { mesh, pos } of entries) {
    for (let i = 0; i < pos.count; i++) {
      a.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const y = a.y * scale;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  }
  if (!Number.isFinite(yMin)) return { points, yMin: 0, yMax: 0 };
  const h = yMax - yMin;
  const planes: number[] = [];
  const n = Math.max(1, Math.floor(cuts));
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? (from + to) / 2 : from + ((to - from) * k) / (n - 1);
    planes.push(yMin + h * t);
  }
  const edge = (mesh: THREE.Mesh, pos: THREE.BufferAttribute, i: number, j: number) => {
    a.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).multiplyScalar(scale);
    b.fromBufferAttribute(pos, j).applyMatrix4(mesh.matrixWorld).multiplyScalar(scale);
    for (const y of planes) {
      if ((a.y - y) * (b.y - y) > 0) continue; // both on one side
      if (a.y === b.y) continue; // lies in the plane; its endpoints are caught by neighbours
      const t = (y - a.y) / (b.y - a.y);
      points.push([a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t]);
    }
  };
  for (const { mesh, pos } of entries) {
    const index = mesh.geometry.index;
    const triCount = (index ? index.count : pos.count) / 3;
    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      edge(mesh, pos, i0, i1);
      edge(mesh, pos, i1, i2);
      edge(mesh, pos, i2, i0);
    }
  }
  return { points, yMin, yMax };
}
