// The app-icon tile as one solid: a rounded-square silhouette extruded with a
// rounded edge bevel, whose flat front cap IS the artwork face.
//
// It used to be a drei RoundedBox with the artwork on a separate plane a
// millimetre in front. From the shelf that read fine; brought up to the camera
// and turned by hand, the plane's edge stood proud of the box's big edge radius
// like a sticker peeling off (owner review, 2026-09-11). A single slab has
// nothing to peel: the cap is flush by construction, and the silhouette's
// corner radius (`body.radius`, shared with the boot SVG) is independent of
// the edge bevel (`body.edgeRadius`), which a RoundedBox cannot offer.
//
// Lives apart from projectIconGeometry.ts on purpose: that file is on the boot
// screen's import graph and must not pull three.js in.
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  type projectIconBody,
  traceProjectIconOutline,
} from "./projectIconGeometry";

export type ProjectIconBody = ReturnType<typeof projectIconBody>;

/** Material slots on the slab: the artwork cap, the walls and bevels,
 * and the back cap. */
export const PROJECT_ICON_SLAB_FRONT = 0;
export const PROJECT_ICON_SLAB_WALLS = 1;
export const PROJECT_ICON_SLAB_BACK = 2;

/** Width of the flat front cap: the silhouette less the bevel on each side.
 * The artwork's UVs span exactly this, so the image fills the cap. */
export function projectIconCapSize(body: ProjectIconBody) {
  return body.size - body.edgeRadius * 2;
}

function roundedSquare(half: number, radius: number) {
  const shape = new THREE.Shape();
  traceProjectIconOutline(shape, half * 2, radius);
  return shape;
}

/**
 * Build the slab, centred on the origin with the artwork cap facing +z.
 *
 * three's bevel grows OUTWARD from the shape by `bevelSize` in x/y and by
 * `bevelThickness` in z, so the shape is the silhouette shrunk by the bevel
 * and the extrusion depth is the body depth less two bevels; the outer
 * bounds then come out at `body.size` by `body.depth`. The cap uses the
 * same continuous corner profile with its reach reduced by the bevel.
 */
export function createProjectIconSlabGeometry(body: ProjectIconBody) {
  const bevel = body.edgeRadius;
  const half = body.size / 2 - bevel;
  const raw = new THREE.ExtrudeGeometry(
    roundedSquare(half, Math.max(0.0005, body.radius - bevel)),
    {
      depth: body.depth - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: 0,
      bevelSegments: 8,
      curveSegments: 12,
    },
  );
  // The cap group holds both lids, one at each end. Split it so the front
  // (the +z end after centring) and back can use opposite artwork UV
  // transforms, then centre the slab on its depth.
  const [lids, walls] = raw.groups;
  if (!lids || !walls) return raw;
  const halfLids = lids.count / 2;
  const zFirst = raw.getAttribute("position").getZ(lids.start);
  const zLast = raw.getAttribute("position").getZ(lids.start + lids.count - 1);
  const frontFirst = zFirst > zLast;
  raw.clearGroups();
  raw.addGroup(
    lids.start,
    halfLids,
    frontFirst ? PROJECT_ICON_SLAB_FRONT : PROJECT_ICON_SLAB_BACK,
  );
  raw.addGroup(
    lids.start + halfLids,
    halfLids,
    frontFirst ? PROJECT_ICON_SLAB_BACK : PROJECT_ICON_SLAB_FRONT,
  );
  raw.addGroup(walls.start, walls.count, PROJECT_ICON_SLAB_WALLS);
  raw.translate(0, 0, -(body.depth / 2 - bevel));

  // Shared vertices across the lid-to-bevel rim so the bevel shades smoothly
  // into the cap. The default UVs are dropped first: they differ between lid
  // and wall at the same position and would keep the rim from merging. The
  // caps get theirs back below, spanning the cap so the artwork fills it.
  raw.deleteAttribute("uv");
  raw.deleteAttribute("normal");
  const geometry = mergeVertices(raw);
  raw.dispose();
  geometry.computeVertexNormals();
  const position = geometry.getAttribute("position");
  const cap = projectIconCapSize(body);
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = position.getX(i) / cap + 0.5;
    uv[i * 2 + 1] = position.getY(i) / cap + 0.5;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}
