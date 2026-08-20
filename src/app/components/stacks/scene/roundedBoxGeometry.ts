import { ExtrudeGeometry, Shape } from "three";
import { toCreasedNormals } from "three-stdlib";

/**
 * Shared, cached geometry for drei's `RoundedBox`.
 *
 * WHY. `RoundedBox` builds an `ExtrudeGeometry` per instance and then runs
 * `toCreasedNormals` on it from a layout effect. That pass allocates a string
 * key — `` `${x},${y},${z}` `` — for every vertex and drops them into a Map,
 * to find which face normals to average. It is the single largest identified
 * cost in a mobile cold boot: 12 percent of main-thread samples in a CPU
 * profile of a production build at 6x throttle, across the scene's 35 call
 * sites.
 *
 * Almost none of those are unique. Book covers, shelf planks, boards and
 * risers repeat the same handful of dimensions, so the same geometry is being
 * derived from scratch dozens of times. Keying it by its parameters turns
 * that into one build per distinct box.
 *
 * The room already does exactly this for the bumper plates
 * (`plateGeometryCache` in primitives.tsx); this is the same trick where the
 * measurement says it is worth the most.
 *
 * SAFETY. The cache owns these geometries for the lifetime of the module and
 * never disposes them, because several meshes share one instance and a mesh
 * unmounting must not pull the geometry out from under its siblings. That is
 * the same contract the plate cache keeps. Nothing mutates a geometry after
 * it is built, so sharing is otherwise invisible.
 */

/** drei's epsilon, reproduced so the shape is identical to what it built. */
const EPS = 0.00001;

/** Byte-for-byte drei's `createShape`. Any drift here changes the silhouette
 * of every box in the room, so it is copied rather than reinterpreted. */
function createShape(width: number, height: number, radius0: number) {
  const shape = new Shape();
  const radius = radius0 - EPS;
  shape.absarc(EPS, EPS, EPS, -Math.PI / 2, -Math.PI, true);
  shape.absarc(EPS, height - radius * 2, EPS, Math.PI, Math.PI / 2, true);
  shape.absarc(
    width - radius * 2,
    height - radius * 2,
    EPS,
    Math.PI / 2,
    0,
    true,
  );
  shape.absarc(width - radius * 2, EPS, EPS, 0, -Math.PI / 2, true);
  return shape;
}

export type RoundedBoxSpec = Readonly<{
  width: number;
  height: number;
  depth: number;
  radius?: number;
  steps?: number;
  smoothness?: number;
  bevelSegments?: number;
  creaseAngle?: number;
}>;

/** drei's defaults. Reproduced so a call site that omits a prop gets the same
 * box it got before, and so the cache key is complete. */
export const ROUNDED_BOX_DEFAULTS = {
  radius: 0.05,
  steps: 1,
  smoothness: 4,
  bevelSegments: 4,
  creaseAngle: 0.4,
} as const;

const cache = new Map<string, ExtrudeGeometry>();

export function roundedBoxCacheKey(spec: RoundedBoxSpec) {
  const {
    width,
    height,
    depth,
    radius = ROUNDED_BOX_DEFAULTS.radius,
    steps = ROUNDED_BOX_DEFAULTS.steps,
    smoothness = ROUNDED_BOX_DEFAULTS.smoothness,
    bevelSegments = ROUNDED_BOX_DEFAULTS.bevelSegments,
    creaseAngle = ROUNDED_BOX_DEFAULTS.creaseAngle,
  } = spec;
  return `${width}|${height}|${depth}|${radius}|${steps}|${smoothness}|${bevelSegments}|${creaseAngle}`;
}

/** The geometry for one box, built at most once per distinct set of
 * parameters. Shared: callers must not mutate or dispose it. */
export function roundedBoxGeometry(spec: RoundedBoxSpec): ExtrudeGeometry {
  const key = roundedBoxCacheKey(spec);
  const hit = cache.get(key);
  if (hit) return hit;

  const {
    width,
    height,
    depth,
    radius = ROUNDED_BOX_DEFAULTS.radius,
    steps = ROUNDED_BOX_DEFAULTS.steps,
    smoothness = ROUNDED_BOX_DEFAULTS.smoothness,
    bevelSegments = ROUNDED_BOX_DEFAULTS.bevelSegments,
    creaseAngle = ROUNDED_BOX_DEFAULTS.creaseAngle,
  } = spec;

  const geometry = new ExtrudeGeometry(createShape(width, height, radius), {
    depth: depth - radius * 2,
    bevelEnabled: true,
    bevelSegments: bevelSegments * 2,
    steps,
    bevelSize: radius - EPS,
    bevelThickness: radius,
    curveSegments: smoothness,
  });
  geometry.center();
  // ExtrudeGeometry is non-indexed, so this mutates in place and returns the
  // same object — which is why drei discarding its return value was never a
  // bug. Assigning is still correct, and stays correct if that changes.
  const creased = toCreasedNormals(geometry, creaseAngle) as ExtrudeGeometry;
  cache.set(key, creased);
  return creased;
}

/** Distinct geometries currently held. Exposed for the diagnostics overlay
 * and for tests; the point of the cache is that this stays far below the
 * number of boxes on screen. */
export function roundedBoxCacheSize() {
  return cache.size;
}

/** Tests only. Production never empties this: shared geometry outlives the
 * meshes that reference it. */
export function clearRoundedBoxCache() {
  for (const geometry of cache.values()) geometry.dispose();
  cache.clear();
}
