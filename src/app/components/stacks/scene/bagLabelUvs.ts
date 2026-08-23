// Front-face planar label UVs for a standing bag.
//
// Kenney's "Bag" (public/models/bag.glb) is a gusseted bag standing on y=0
// with its two big printed faces on ±x and palette-style UVs that cannot carry
// a label. This replaces them with one chart over the bag's own extents: v
// runs up the bag (y), u runs across the printed face (z), so a label authored
// at the face's proportions lands unstretched.
//
// Every vertex gets the same chart, which is what makes the rest of the bag
// come out right for free: the sides sit at z = min or max and sample the
// label's left/right edge columns (plain pouch colour), the bottom samples the
// v = 0 row (the label's band), the folded top samples the crimp row. The
// back face (normal -x) takes the mirrored u so that, seen from behind, it
// reads like a printed back rather than reversed numerals.
//
// The unit turns the bag's +x face to the viewer with a -90° yaw; in that
// pose model +z is the viewer's LEFT, which is why u counts down z on the
// front.
import * as THREE from "three";

export type StandingBagSize = { width: number; height: number; depth: number };

/** Clone `source` and replace its `uv` attribute with the front-face chart.
 * Dispose the clone, not the source's buffers, when it leaves the scene. */
export function projectStandingBagUvs(source: THREE.BufferGeometry): {
  geometry: THREE.BufferGeometry;
  /** Extents in the source's frame: width across the printed face (z),
   * height (y), depth through the bag (x). */
  size: StandingBagSize;
} {
  const geometry = source.clone();
  const pos = geometry.attributes.position;
  if (!pos) {
    return { geometry, size: { width: 0, height: 0, depth: 0 } };
  }
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const width = box.max.z - box.min.z || 1;
  const height = box.max.y - box.min.y || 1;
  const depth = box.max.x - box.min.x || 1;
  const normal = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const y = pos.getY(i);
    const back = normal ? normal.getX(i) < -0.5 : false;
    uv[i * 2] = back
      ? (z - box.min.z) / width
      : (box.max.z - z) / width;
    uv[i * 2 + 1] = (y - box.min.y) / height;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return { geometry, size: { width, height, depth } };
}
