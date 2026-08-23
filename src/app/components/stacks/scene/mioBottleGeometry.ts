// MiO bottle geometry: the packshot's silhouette on a lathe, squashed
// front-to-back.
//
// The profile below is MEASURED, not drawn: every row of the owner's MiO
// Hydrate packshot (1000×1000, bottle on white) was scanned for its left and
// right edge, width ÷ max width at 29 evenly spaced heights is the radius
// column, height fraction from the base is the other. The Lemonade packshot
// measures the same curve to within 0.04 everywhere (its top is inflated by
// the 2X MORE disc, which is why Hydrate is the source). What the numbers say
// that a guess did not: widest at 0.32–0.39 of height, a rounded base that
// pulls in to 0.66 at 4%, then ONE continuous taper to a narrow rounded top
// (0.52 at 0.86, 0.25 at 0.96) — the cap is the top of that same curve, not
// a drum on a neck.
//
// Width/height from the same scan is 0.72 (Hydrate) / 0.66 (Lemonade, disc
// included); 0.70 is used. Depth is the one number a front shot cannot give:
// 0.65 × width, from the product's listed dimensions.
//
// UVs: u once around from the lathe (0 at the seam, which the component turns
// to the back so u = 0.5 faces the viewer); v is rewritten to plain HEIGHT,
// 0 at the base and 1 at the top, so a label authored as a flat 768 × 640
// sheet lands where it was drawn (the lathe's own v is by sample index, and
// the flat underside would otherwise eat the first rows of the chart).
import * as THREE from "three";

export type MioBottleSize = { width: number; height: number; depth: number };

const WIDTH_OVER_HEIGHT = 0.7;
const DEPTH_OVER_WIDTH = 0.65;

function sized(height: number): MioBottleSize {
  const width = height * WIDTH_OVER_HEIGHT;
  return { width, height, depth: width * DEPTH_OVER_WIDTH };
}

/** Heights at the room's 2 world units per metre, at ~0.75 of real (1.62 oz
 * ≈ 9.5 cm, 3.24 oz ≈ 11.4 cm): where they stopped shouting next to the
 * bags (owner call, 2026-08-22). Width and depth follow the measured ratios. */
export const MIO_SIZES = {
  /** 1.62 fl oz: the standard bottle. */
  hydrate: sized(0.14),
  /** 3.24 fl oz: the "2X more" bottle. */
  lemonade: sized(0.168),
} as const satisfies Record<string, MioBottleSize>;

/** (radius, height) from the base up, max radius 1, height 1 — the scan of
 * the Hydrate packshot (scratch script: measure_mio.py, 2026-08-22). The
 * first and last entries close the lathe on the axis. */
const PROFILE: Array<[number, number]> = [
  [0, 0],
  [0.3, 0],
  [0.66, 0.04],
  [0.74, 0.07],
  [0.81, 0.11],
  [0.86, 0.14],
  [0.9, 0.18],
  [0.94, 0.21],
  [0.97, 0.25],
  [0.98, 0.29],
  [1.0, 0.32],
  [1.0, 0.36],
  [1.0, 0.39],
  [0.99, 0.43],
  [0.98, 0.46],
  [0.96, 0.5],
  [0.94, 0.54],
  [0.91, 0.57],
  [0.88, 0.61],
  [0.84, 0.64],
  [0.8, 0.68],
  [0.76, 0.71],
  [0.71, 0.75],
  [0.65, 0.79],
  [0.59, 0.82],
  [0.52, 0.86],
  [0.45, 0.89],
  [0.36, 0.93],
  [0.25, 0.96],
  [0.08, 1.0],
  [0, 1.0],
];

const RADIAL_SEGMENTS = 36;

/** Build one bottle at the given extents: bottom at y = 0, centred on x/z. */
export function mioBottleGeometry(size: MioBottleSize): THREE.BufferGeometry {
  const points = PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
  const geometry = new THREE.LatheGeometry(points, RADIAL_SEGMENTS);
  geometry.scale(size.width / 2, size.height, size.depth / 2);
  // v = height, not profile-sample index (see the header).
  const pos = geometry.attributes.position!;
  const uv = geometry.attributes.uv!;
  for (let i = 0; i < uv.count; i++) {
    uv.setY(i, Math.min(1, Math.max(0, pos.getY(i) / size.height)));
  }
  uv.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}
