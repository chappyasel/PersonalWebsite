// Meadow field math — terrain heights, instance sampling, and the rung-order
// contract for the homepage meadow. Single source of truth shared by
// Meadow.tsx (whose GLSL interpolates the constants below), the headless
// check script, and vitest — so the shader and its verifiers cannot drift.
// No three.js imports, worldLayout.ts pattern: DOM-side scripts and node can
// evaluate everything here without WebGL.
import { rand } from "../theme";

import {
  GOLF_COURSE_CENTER,
  golfCourseHeight,
  golfSurfaceAt,
  suppressGolfVegetation,
} from "./golf/golfCourse";
import {
  SCENE_CONTENT_DEFINITIONS,
  SCENE_FRAME_BUDGET_MS,
  type SceneContentTier,
} from "./quality";
import { ABOUT_COUCH, SEAT_POSE } from "./seated";
import { SHELF_GEOMETRY, SHELF_UNDERSIDE } from "./shelfGeometry";
import { TRAINING_BARBELL_POSE } from "./units/unitShelfLayout";
import {
  TRAVEL_LEAD_IN,
  TRAVEL_X,
  UNIT_SPACING,
  unitPose,
} from "./worldLayout";

/** Bump when authored instance positions or sizes change so Fast Refresh
 * rebuilds Meadow's frozen instance buffers on localhost. */
export const MEADOW_LAYOUT_REVISION = "2026-08-20-wide-tuft-clearance";

// ---------------------------------------------------------------------------
// Cameras the field is derived against. Every extent below is a consequence
// of these numbers; if a pose moves, the vitest + check script fail loudly
// rather than the meadow quietly growing a visible edge.
//
//   Traverse eye   (x, 0.25, 5.8), x ∈ [−1.2, 26.4]   worldLayout CAMERA/TRAVEL
//   Traverse pitch −0.0550 rad (look y −0.08 at z −0.2), ±0.0183 pointer/idle
//   Desktop lens   fov 33 → v-half 0.2880 rad; widest aspect 21:9 →
//                  h-half 0.6161 rad, +0.06 lean/yaw margin → tan 0.802
//   Phone          (x, 0.3, 7.6) fov 32.5; tablet portrait fov 40.5
//   Seated eye     SEAT_POSE (≈ −3.408, 0.02, 1.004), fov 42, pitch +0.02
export const TRAVERSE_EYE = { y: 0.25, z: 5.8 } as const;
export const TRAVERSE_MIN_X = -TRAVEL_LEAD_IN;
export const TRAVERSE_MAX_X = TRAVEL_X;
/** Lateral reach per unit of view depth from the widest checked frustum:
 * aspect 3.0 (a 1200×400 desktop window is reachable) at fov 33 gives
 * h-half atan(tan(16.5°)·3) = 0.7265 rad; +0.06 lean/yaw margin → tan
 * 0.994, rounded up so the samplers' extra 0.6-unit slack keeps every
 * vegetation side edge strictly outside every frustum (1.0 + 0.6/d > 0.994
 * at all depths). The earlier 21:9-derived 0.802 left the side trapezoid
 * ~20% inside a 3.0-aspect frame — the check script is the arbiter here. */
export const LATERAL_REACH = 1.0;
const SEAT_X = SEAT_POSE.eye[0];
const SEAT_Z = SEAT_POSE.eye[2];

// ---------------------------------------------------------------------------
// Extents — derived, not tuned.
//
// Frame-bottom elevation (pitch − v-half − parallax) decides where the ground
// first enters the frame:
//   Desktop:  −0.0550 − 0.2880 − 0.0183 = −0.3613 → ground (Δy 1.42) enters
//             at depth 3.76 → z ≤ 2.04 (2.3 with margin).
//   Phone:    −0.0487 − 0.2836 − 0.0183 = −0.3506 → depth 4.02 → z ≤ 3.58.
//   Tablet portrait (fov 40.5) at the LOW eye bob (y 0.3 − 0.11 = 0.19,
//             which also shallows the pitch to −atan(0.27/7.8) = −0.0346):
//             −0.0346 − 0.3534 − 0.0183 = −0.4063 → ground (Δy 1.325 at the
//             undulation's +0.035 crest) enters at depth 3.08 → z ≤ 4.52 —
//             TABLET AT LOW BOB, not desktop, drives the front line.
//             Vegetation starts just behind it, so no camera ever sees the
//             front density edge, and the strip desktop never reaches
//             (2.3 → 4.6) is overdraw headroom, not a visible boundary.
//   Seated:   0.02 − 0.3665 − 0.02 = −0.3665 → ground (Δy ≥ 1.155) enters
//             3.0 out → z ≥ 4.0; the seated band starts at 3.8, below frame.
export const VEGETATION_FRONT_Z = 4.6;
/** Farthest frame-bottom ground entry of any supported camera (tablet
 * portrait at low eye bob). Vegetation may only START between this and the
 * front line — a front edge inside this zone is below every frame bottom.
 * The old meadow's z = 3.25 edge sat well INSIDE the tablet frame, which is
 * the bug class the check script's self-test proves it still catches. */
export const NEAR_FEATHER_ZONE = {
  minZ: 4.52,
  maxZ: VEGETATION_FRONT_Z,
} as const;
export const inNearFeatherZone = (z: number) =>
  z >= NEAR_FEATHER_ZONE.minZ && z <= NEAR_FEATHER_ZONE.maxZ;

// Terrain rectangle. Every edge is either outside every checked frustum or
// past 99% terrain fog before geometry ends: an x-edge sample at view depth
// d is in a frustum only if |Δx| ≤ 0.994·d, so the fog bar (23.1) sets the
// minimum standoff. The WEST edge is driven by the walk phase of the seat
// transition, not the traverse: mid-walk the camera can face the edge
// directly at any yaw, so the standoff there is radial — 23.1/cos(hHalf +
// margin) ≈ 33 from the walk path's western reach (x ≈ −3.2) → minX −36.
// The east edge only ever faces traverse frustums (26.6 lateral from x
// 26.4 needs d ≥ 26.8 > 23.1). Vegetation spans per z-plane are
// trapezoidal (reach = d·1.0): near-band far z −8.2 (d 14) → x [−15.8,
// 41]; mid far z −18.2 (d 24) → x [−25.8, 51] — all inside the rectangle.
export const MEADOW_TERRAIN = {
  minX: -36,
  maxX: 53,
  minZ: -27,
  maxZ: 12.8,
  // ~0.37-unit cells keep far cells small enough that per-vertex fog color
  // interpolation cannot band against the analytic dome.
  segmentsX: 240,
  segmentsZ: 132,
} as const;

/** Extra lawn behind the ordinary camera-side grass line. It is below or
 * behind every settled travel frustum, but a hard horizontal fling yaws a
 * bottom corner into this strip. The x span reaches the terrain's own safe
 * border so an almost-sideways ultrawide fling cannot discover a second
 * vegetation edge. */
export const FLING_GRASS_APRON = {
  count: 3200,
  minX: MEADOW_TERRAIN.minX + 0.3,
  maxX: MEADOW_TERRAIN.maxX - 0.3,
  minZ: VEGETATION_FRONT_Z,
  maxZ: 6.6,
} as const;

/** Sparse flower clumps live inside the apron rather than all the way to its
 * fog-hidden side borders. Their roots remain below settled travel frames. */
export const FLING_APRON_FLOWERS = {
  count: 180,
  minX: TRAVERSE_MIN_X - 6,
  maxX: TRAVERSE_MAX_X + 6,
  minZ: 5.0,
  maxZ: 6.3,
} as const;

// One ramp story (view-depth smoothsteps): grass saturates at 22, terrain at
// 24 — exactly the scene fog far — both into the same dome-matched target, so
// the instanced→terrain handoff and all four terrain edges self-maintain in
// both themes and at every uDawn. Meadow.tsx interpolates these into GLSL;
// the check script asserts against the same numbers.
export const MEADOW_FOG = {
  terrain: [8, 24],
  grass: [8, 22],
  /** Fog CAP (owner round 3: "middle area quite bland and perhaps overly
   * foggy", "hills — I can't even tell"). The ramps above no longer converge
   * all the way to the dome color in the open field: a theme-split fraction
   * of local color survives, which is what keeps the midfield green and
   * gives the horizon ridge a readable hill form instead of a flat
   * dome-colored wall. LIGHT runs far clearer than dark (owner: "the fog
   * looks the right level in dark but in light it's too much… a more direct
   * connect between the blue sky and green grass") — the hill edge stays
   * green against the sky. The residual is REVOKED — fog returns to 100% —
   * (a) inside a band along the terrain rectangle's borders (the actual
   * edge-invisibility duty; every boundary edge still saturates exactly as
   * the check script's (a) contract assumes) and (b) past `capFade` view
   * depth, a far backstop that sits BEYOND the ridge silhouette (d ≈ 26–30
   * central) so it never re-fogs the crest line the cap exists to show. */
  cap: [0.5, 0.86],
  capFade: [32, 38],
  /** Border-recovery band widths (x edges / z edges). The z band is
   * narrower so it stays clear of the horizon ridge's far flank
   * (crest −21.5, σ 3 vs minZ −27). */
  border: 6,
  borderZ: 3,
} as const;

/** Base plain height. Room prop ground is −1.115 (shadow pools −1.114). */
export const MEADOW_GROUND_BASE = -1.17;
/** Shelf-strip terrain ceiling: 0.036 clearance under the shadow pools kills
 * the z-fight class entirely. Asserted by vitest across the room span. */
export const MEADOW_SHELF_CEILING_Y = -1.15;
/** Blade roots sink below the surface so slope contact never gaps. */
export const GRASS_ROOT_SINK = 0.015;
/** Minimum lift for camera-side apron flowers. Field flowers derive their
 * lift from the local canopy so taller rear grass cannot swallow them. */
export const FLOWER_LIFT = 0.06;

// Bank + far-skirt regions (authored silhouettes, see meadowHeight).
// The bank came IN by three units at the owner's round-2 browse ("the seated
// grass extends ~50% too far"): the grass line from the seat is set by where
// the band ENDS, not by the bank's height, so the whole rise moved closer
// and flattened (amp 0.17 → 0.08 — a subtle roll, the skirt line does the
// composition work). GRASS_BANDS.seated.d1, the bank flower group, the
// bank-calm damping window, and Meadow.tsx's seated water slide all derive
// from these numbers, so they move together.
export const MEADOW_BANK = {
  // Screenshot-tuned at the seated pose: the first cut (skirt 8.6) still
  // left the grass band at ~28% of frame height; 7.0 lands the crest line
  // at e ≈ −0.19, the ~23% band that is two-thirds of the round-1 height.
  riseStartZ: 5.0,
  crestZ: 6.7,
  skirtZ: 7.0,
  /** Bank rise amplitude, world units above the base plain. */
  amp: 0.08,
  /** Skirt drop per unit z. The steepest seated sight ray over the crest
   * falls ≈ 0.193/unit at the close crest; 0.9 ≫ that, so the terrain
   * end is never visible (also holds for the walk-phase eye at y ≤ 0.9,
   * ray slope ≈ 0.40). */
  skirtDrop: 0.9,
} as const;
export const MEADOW_FAR_SKIRT = {
  z: -24.5,
  /** Wherever the horizon ridge crests above eye level the sight ray over it
   * ASCENDS and the far terrain end is unreachable outright; at the tapered
   * ends the ray falls ≤ 0.025/unit ≪ 1.1 — and it is past 100% fog
   * regardless. */
  drop: 1.1,
} as const;

// ---------------------------------------------------------------------------
// Local math helpers (no three.js).
const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
export function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = clamp((v - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
/** exp(−((v−c)/s)²) — the same explicit-square gaussian idiom the sky shader
 * uses (pow with a negative base is undefined in GLSL ES). */
function gauss(v: number, c: number, s: number): number {
  const q = (v - c) / s;
  return Math.exp(-(q * q));
}
/** 1-D value noise over the theme's `rand` lattice — deterministic. */
function vnoise1(t: number, salt: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const s = f * f * (3 - 2 * f);
  return rand(i, salt) * (1 - s) + rand(i + 1, salt) * s;
}
/** 2-D value noise on the same lattice (bilinear, like the shader's vnoise). */
function vnoise2(x: number, y: number, salt: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const h = (cx: number, cy: number) => rand(cx + cy * 57.31, salt);
  const a = h(ix, iy) * (1 - sx) + h(ix + 1, iy) * sx;
  const b = h(ix, iy + 1) * (1 - sx) + h(ix + 1, iy + 1) * sx;
  return a * (1 - sy) + b * sy;
}

// ---------------------------------------------------------------------------
// Terrain height. TS only — vertices are baked once at build; the GLSL never
// evaluates this.
//
// The horizon ridge (owner round 2: "rolling hills at/above the horizon
// behind the shelves"). One continuous crest line replaces the old
// below-horizon far ridge and both flanking swells: it closes the water/sky
// band that used to show between the meadow and the skyline, and reads as a
// pale haze hill in front of the city's base — at ≈ 27 units of view depth
// it is 100% terrain-fogged, so it paints the flat dome-shadow color against
// the sky, which is exactly the fogged-hill read the owner approved on the
// old S_L swell.
export const HORIZON_RIDGE = {
  /** Crest plane. meadowHeight equals horizonCrestY exactly here (the ridge
   * mask reaches 1), which is what makes the silhouette provable. */
  z: -21.5,
  sigma: 3.0,
  /** x-span where the crest HOLDS above the horizon. Sized so the widest
   * checked frame (aspect 3.0) from either traverse end still sees held
   * crest across the shelf line; the taper lives outside it. */
  holdMinX: -24,
  holdMaxX: 42,
  /** Fully tapered by these x — comfortably inside the terrain rectangle
   * (−36 … 53), so an above-horizon silhouette can never reach a rectangle
   * edge and cut against the sky. Round 3 tripled the crest height, so the
   * tapers widened (4 → 7/8 units) to keep the descending shoulders
   * gradual. */
  endMinX: -31,
  endMaxX: 50,
  /** Below-horizon tail height. From the lowest eye it reads at e ≈ −0.016:
   * under the horizon, over the deep-gap floor, and painted in the exact
   * dome-shadow color it sits against (invisible by construction). */
  tailY: -0.3,
} as const;

/** Authored world-y crest line of the horizon ridge, rolling in x. Round 3
 * ("doesn't look nearly hilly enough — I can't even tell") roughly doubled
 * the whole band and its roll: held band ≈ [0.68, 1.08], derived from the
 * eye envelope. From the HIGHEST bobbed eye (phone, y 0.41, d 29.1) the
 * lowest crest still sits at e ≈ +0.009 (above the horizon — the water/sky
 * band behind the shelves stays closed), and from the LOWEST bobbed eye
 * (desktop, y 0.14, d 27.3) the tallest crest reads at e ≈ +0.034 — real
 * hills, but still under the GGB deck line (e 0.038), so no structure BODY
 * is ever swallowed. Two sine octaves + value noise make the crest roll
 * rather than wall. The check script measures the real silhouettes; vitest
 * pins this function's range and taper. */
export function horizonCrestY(x: number): number {
  const roll =
    0.88 +
    0.11 * Math.sin(x * 0.22 + 1.7) +
    0.05 * Math.sin(x * 0.53 - 0.4) +
    0.04 * (vnoise1(x * 0.12, 3.7) - 0.5) * 2;
  const hold =
    smoothstep(HORIZON_RIDGE.endMinX, HORIZON_RIDGE.holdMinX, x) *
    (1 - smoothstep(HORIZON_RIDGE.holdMaxX, HORIZON_RIDGE.endMaxX, x));
  return HORIZON_RIDGE.tailY + (roll - HORIZON_RIDGE.tailY) * hold;
}

function meadowBaseHeight(x: number, z: number): number {
  // Near undulation — big enough to give the lawn a visible swell (the flat
  // sheet was the first thing the owner rejected). Damped through the shelf
  // strip (z ∈ [−3, 1]) so the surface never rises above
  // MEADOW_SHELF_CEILING_Y, and through the bank region so the seated crest
  // silhouette stays inside its authored elevation band.
  const strip = smoothstep(-4, -3, z) * (1 - smoothstep(1, 2, z));
  const bankCalm = smoothstep(
    MEADOW_BANK.riseStartZ - 2,
    MEADOW_BANK.riseStartZ + 1,
    z,
  );
  const und =
    (0.05 * Math.sin(x * 0.58 + z * 0.31) +
      0.028 * Math.sin(x * 0.19 - z * 0.44)) *
    (1 - 0.775 * strip) *
    (1 - 0.6 * bankCalm);

  // R1 mid ridgeline (z −11.5): the first ROLLING hill line, close enough
  // to read as a hill through ~70% fog rather than a fogged bump. The crest
  // rolls in x so the read is rolling hills, not a berm. Amplitude sits
  // under the frame-corner/low-bob elevation ceiling the check enforces.
  const r1 =
    0.62 *
    gauss(z, -11.5, 3.6) *
    (0.55 +
      0.45 * Math.sin(x * 0.66 + 1.3) +
      0.18 * (vnoise1(x * 0.21, 7.3) - 0.5));

  // R2 mid-far ridgeline (z −15.5): second layer (~90% fog), x-phase offset
  // from R1 so their crests interleave in screen space — the
  // rolling-with-haze-separation layering.
  const r2 =
    0.55 * gauss(z, -15.5, 4.0) * (0.55 + 0.45 * Math.sin(x * 0.43 - 0.7));

  // Where R1's and R2's x-phases align (~every 27 units) the raw stack
  // nearly doubles and its crest would breach the skyline fade band from a
  // 3.0-aspect frame corner at low eye bob. Compress the sum's excess above
  // the knee so aligned crests top out ≈ 0.62 while solo crests keep their
  // full roll. The check script owns the exact ceiling.
  let mid = r1 + r2;
  if (mid > 0.5) mid = 0.5 + (mid - 0.5) * 0.25;

  // Seated riverbank (all x — no lateral seam to find). Crest silhouette
  // from the seat reads at e ≈ −0.155…−0.135 across the central seated
  // frame: always well below the DC waterline (the dome draws water at
  // e < 0 and every far-shore structure above it), so the bank cuts against
  // open Potomac water only — Columbia Island's own grassy bank.
  const bank =
    MEADOW_BANK.amp *
    smoothstep(MEADOW_BANK.riseStartZ, MEADOW_BANK.crestZ, z) *
    (0.75 + 0.25 * Math.sin(x * 0.55 + 1.9));

  // R4, the horizon ridge. NOT additive: the ridge mask cross-fades the
  // whole local relief (undulation, mid rolls, bank) into the authored crest
  // line, so at the crest plane meadowHeight(x, −21.5) IS horizonCrestY(x)
  // exactly — no leak from R2's tail or the undulation can push a measured
  // silhouette over the proven band. The blend also calms the last of the
  // mid rolls on the ridge's near flank, which reads as the valley before
  // the far hills.
  const ridgeMask = gauss(z, HORIZON_RIDGE.z, HORIZON_RIDGE.sigma);
  let y =
    MEADOW_GROUND_BASE +
    (und + mid + bank) * (1 - ridgeMask) +
    (horizonCrestY(x) - MEADOW_GROUND_BASE) * ridgeMask;

  // Authored skirts: both drop far faster than any sight ray over their
  // crests can descend, so the rectangle's actual ends are unreachable.
  if (z > MEADOW_BANK.skirtZ)
    y -= MEADOW_BANK.skirtDrop * (z - MEADOW_BANK.skirtZ);
  if (z < MEADOW_FAR_SKIRT.z)
    y -= MEADOW_FAR_SKIRT.drop * (MEADOW_FAR_SKIRT.z - z);
  return y;
}

const GOLF_CENTER_BASE_HEIGHT = meadowBaseHeight(
  GOLF_COURSE_CENTER.x,
  GOLF_COURSE_CENTER.z,
);

/** The putting surface is part of the canonical field, not an overlay. Every
 * terrain vertex, vegetation root, golf collision and flag placement reads
 * this same continuous function. */
export function meadowHeight(x: number, z: number): number {
  const base = meadowBaseHeight(x, z);
  return golfCourseHeight(x, z, base, GOLF_CENTER_BASE_HEIGHT);
}

// ---------------------------------------------------------------------------
// Grass distribution.
//
// Instances per unit DEPTH ∝ 1/d — the strip width already grows ≈ linearly
// with d, so per-ground-area density falls as 1/d² and SCREEN coverage stays
// constant. Inverse-CDF for that weighting: d = d0 · (d1/d0)^u.
// Instances are TUFTS (the FluffyGrass 8-card cluster, MIT, vendored as
// grass-tuft.glb), not single blades: each covers ~2.5× its height in
// footprint, so a few thousand overlapping tufts give the reference's
// full-pile coverage where tens of thousands of blades read as debris.
export const GRASS_BANDS = {
  /** Quiet short lawn, z +4.6 → −9.2 (depth 1.2 → 15 from the rail). */
  near: { count: 7200, d0: TRAVERSE_EYE.z - VEGETATION_FRONT_Z, d1: 15 },
  /** Camera-side safety grass, normally below/behind the frame. */
  apron: FLING_GRASS_APRON,
  /** The meadow moment, z −6.8 → −18.2. Its first 2.4 depth units overlap
   * the near lawn, hiding the roots of either tuft LOD at their handoff. */
  mid: { count: 2500, d0: 12.6, d1: 24 },
  /** The horizon ridge's near face, z −17.2 → −22.8 (overlapping the mid
   * band's tail by one z-unit so there is no density seam). Sparse but BIG
   * tufts: under the round-3 fog cap the ridge keeps a residual of local
   * color, and this band is what makes that residual read as a grassy hill
   * face instead of smooth felt. Heights stay modest (≤ ~0.45) so the tuft
   * fringe over the proven crest silhouette stays a fuzz, not a wall. */
  ridge: { count: 1000, d0: 23, d1: 28.6 },
  /** Seated band, z +1.6 → skirt, depths against the SEAT eye. Starts well
   * behind the rail so the walk phase of the seat transition (which can
   * face the couch's surround from close range) sees lawn, not a boundary;
   * the sampler pins 70% of the count onto the bank itself. */
  seated: { count: 2500, d0: 1.6 - SEAT_Z, d1: MEADOW_BANK.skirtZ - SEAT_Z },
} as const;

export const MEADOW_GRASS_TOTAL =
  GRASS_BANDS.near.count +
  GRASS_BANDS.apron.count +
  GRASS_BANDS.mid.count +
  GRASS_BANDS.ridge.count +
  GRASS_BANDS.seated.count;
/** A denser flowering layer: 2,800 base field heads preserve the authored
 * clumps and empty intervals, with a small planted crest compensation for
 * distance and occlusion. The 180 apron heads are additive and normally sit
 * below the settled travel frame. Flower heads remain two triangles each. */
const MEADOW_FLOWER_FIELD_TOTAL = 2800;
const MEADOW_FLOWER_TRAVERSE_TOTAL = 2270;
const MEADOW_FLOWER_HIGH_HILL_BONUS = 520;
export const MEADOW_FLOWER_TOTAL =
  MEADOW_FLOWER_FIELD_TOTAL +
  MEADOW_FLOWER_HIGH_HILL_BONUS +
  FLING_APRON_FLOWERS.count;

// The degrade dial's order contract. Each instance gets a quality quantile;
// the buffer is ordered rung-major at these cumulative fractions,
// front-to-back within each rung (early-z). `mesh.count = MEADOW_RUNG_GRASS[r]`
// then thins ALL bands uniformly — a true density dial: no band ever
// vanishes, no depth cut-line appears. (Literal back-to-front ordering would
// make a lowered count delete the far field first and pull the horizon in.)
export const MEADOW_RUNG_FRACTIONS = [0.65, 0.78, 0.9, 1] as const;
/** The near lawn draws the detailed tuft LOD in its own InstancedMesh; the
 * mid + seated + ridge bands share the light LOD in a second one. Each mesh
 * has its own rung-ordered buffer and count table; the combined table is
 * the reporting total. */
export const MEADOW_RUNG_GRASS_NEAR = [6760, 8112, 9360, 10400] as const;
export const MEADOW_RUNG_GRASS_FAR = [3900, 4680, 5400, 6000] as const;
export const MEADOW_RUNG_GRASS = [10660, 12792, 14760, 16400] as const;
/** Flowers stay OFF at the two lowest quality rungs (degrade ≥ 2). */
// Flower heads are only two triangles each (~6k total) and carry far more
// visual identity than that cost warrants removing. Durable rungs thin the
// expensive grass geometry while preserving the authored meadow colour.
export const MEADOW_RUNG_FLOWERS = [
  MEADOW_FLOWER_TOTAL,
  MEADOW_FLOWER_TOTAL,
  MEADOW_FLOWER_TOTAL,
  MEADOW_FLOWER_TOTAL,
] as const;

/** Scale one grass tuft LOD without letting its source height dictate the
 * whole footprint. The cheapest mesh gets a modest coverage correction, but
 * the cap keeps its eight cards from becoming broad, flat fans in Safety. */
export function grassTuftNormalizationScale(
  lodMaxY: number,
  referenceMaxY: number,
) {
  const safeLodMaxY = Math.max(lodMaxY, 1e-4);
  const safeReferenceMaxY = Math.max(referenceMaxY, 1e-4);
  const horizontalMaxY = Math.max(safeReferenceMaxY, safeLodMaxY * 0.82);
  return {
    x: 1 / horizontalMaxY,
    y: 1 / safeLodMaxY,
    z: 1 / horizontalMaxY,
  } as const;
}

/** Perspective makes constant-height near grass appear to shrink as it runs
 * behind the shelves. Grow that rear section into the midfield height curve
 * so the lawn reads as one continuous surface instead of a sunken strip. */
export function nearGrassHeight(depth: number, variation: number) {
  const base = 0.16 * (0.8 + 0.4 * clamp(variation, 0, 1));
  return base * (1 + 0.48 * smoothstep(4.8, 14, depth));
}

export function midGrassHeight(depth: number, variation: number) {
  return (
    (0.16 + 0.3 * smoothstep(10, 22, depth)) *
    (0.8 + 0.4 * clamp(variation, 0, 1))
  );
}

/** Keep the shelf reveal and ridge crest planted while letting the middle
 * background flowers rise far enough through the deeper grass to stay
 * visible. The cap remains below the surrounding canopy because the flower
 * geometry has no visible stem. */
export const FLOWER_VARIATION = {
  tiltRadians: 0.56,
  aspect: [0.8, 1.22],
  pixelFloor: [0.66, 1.32],
  value: [0.84, 1.16],
  fieldScale: [0.62, 1.32],
  bankScale: [0.76, 1.78],
  apronScale: [0.68, 1.4],
  /** A few individual blooms break from their clump's species color. */
  rareColorFraction: 0.035,
} as const;

export const FLOWER_BACKGROUND_LIFT = {
  shelfBackDepth: 0.5,
  shelfSideMargin: 0.12,
  riseDepth: [6.8, 9.4],
  settleDepth: [21.5, 24],
  canopyFraction: 0.52,
  max: 0.22,
} as const;

export const FLOWER_BACKGROUND_DENSITY = {
  /** Safely behind the rear edge of both staggered shelf rows. */
  startDepth: 6.8,
  dropFraction: 0.3,
  keepFraction: 0.7,
  /** Extra planted heads compensate for the crest's low, partly occluded
   * placement before the same 30% rear-field reduction is applied. */
  highHillBonus: MEADOW_FLOWER_HIGH_HILL_BONUS,
} as const;

export function flowerSurvivesBackgroundThinning(depth: number, q: number) {
  return (
    depth < FLOWER_BACKGROUND_DENSITY.startDepth ||
    q >= FLOWER_BACKGROUND_DENSITY.dropFraction
  );
}

function withinShelfBackFlowerStrip(x: number, z: number) {
  const backEdge = SHELF_GEOMETRY.top.centerZ - SHELF_GEOMETRY.top.depth / 2;
  for (let i = 0; i < SHADE_UNIT_COUNT; i += 1) {
    const pose = unitPose(i);
    const yaw = pose.rotation[1];
    const dx = x - pose.position[0];
    const dz = z - pose.position[2];
    const localX = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const localZ = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    if (
      Math.abs(localX) <=
        SHELF_GEOMETRY.width / 2 + FLOWER_BACKGROUND_LIFT.shelfSideMargin &&
      localZ <= backEdge &&
      localZ >= backEdge - FLOWER_BACKGROUND_LIFT.shelfBackDepth
    )
      return true;
  }
  return false;
}

export function flowerCanopyLift(x: number, z: number, variation = 0.5) {
  if (withinShelfBackFlowerStrip(x, z)) return FLOWER_LIFT;

  const depth = TRAVERSE_EYE.z - z;
  const rise = smoothstep(
    FLOWER_BACKGROUND_LIFT.riseDepth[0],
    FLOWER_BACKGROUND_LIFT.riseDepth[1],
    depth,
  );
  const crestSettle = smoothstep(
    FLOWER_BACKGROUND_LIFT.settleDepth[0],
    FLOWER_BACKGROUND_LIFT.settleDepth[1],
    depth,
  );
  // Near and midfield grass overlap around the LOD handoff. Follow whichever
  // canopy is taller so flower height cannot acquire a ring at d = 12.6.
  const canopy = Math.max(
    nearGrassHeight(depth, variation),
    midGrassHeight(depth, variation),
  );
  const raisedLift = clamp(
    FLOWER_LIFT +
      (canopy - FLOWER_LIFT) * FLOWER_BACKGROUND_LIFT.canopyFraction,
    FLOWER_LIFT,
    FLOWER_BACKGROUND_LIFT.max,
  );
  return FLOWER_LIFT + (raisedLift - FLOWER_LIFT) * rise * (1 - crestSettle);
}

/** Near-lawn tuft width. The traverse opens laterally with depth, so a fixed
 * footprint leaves horizontal strips of terrain visible behind the shelves.
 * Broader overlap toward the back keeps that whole shelf-to-midfield span
 * grassy without adding instances or changing the Safety triangle budget. */
export function nearGrassWidth(depth: number, variation: number) {
  const base = 0.48 + 0.18 * clamp(variation, 0, 1);
  return base * (1 + 0.12 * smoothstep(6, 14, depth));
}

/** Midfield cards stay compact enough to read as individual tufts. */
export function midGrassWidth(depth: number, variation: number) {
  const base = 0.32 + 0.16 * clamp(variation, 0, 1);
  return base * (1 + 0.78 * smoothstep(10, 24, depth));
}

/** The ridge can carry broader overlap because distance turns it into the
 * continuous texture of a grassy hill rather than a row of foreground fans. */
export function ridgeGrassWidth(variation: number) {
  return 1.4 + 0.7 * clamp(variation, 0, 1);
}

/** Instances one tile draws this frame. The dev density override beats the
 * rung while it is set; otherwise the rung table alone decides.
 *
 * A content tier appears nowhere in this signature, and that absence is the
 * point: a tier changes the triangles inside an instance, never how many
 * instances exist. Coverage is the one geometry change that reads as a
 * different meadow rather than a cheaper one. */
export function meadowTileDrawCount(
  rungCounts: readonly number[],
  rung: 0 | 1 | 2 | 3,
  density: number | null,
) {
  return density === null
    ? rungCounts[rung]!
    : Math.round(rungCounts[3]! * Math.min(1, Math.max(0, density)));
}

// ---------------------------------------------------------------------------
// Content tiers. The rung dial above answers "how many tufts"; a content tier
// answers "how many triangles inside one", and the two must not be confused.

/** The far lawn already draws the 32-triangle LOD, and fog eats most of what
 * it draws. Every content tier leaves it exactly there and spends its cut on
 * the near lawn's 66-triangle tufts instead. */
export const MEADOW_FAR_TUFT_LOD = 1;

export type MeadowContentPlan = Readonly<{
  nearTuftLod: 0 | 1 | 2;
  farTuftLod: typeof MEADOW_FAR_TUFT_LOD;
  terrainSegmentsX: number;
  terrainSegmentsZ: number;
  /** True binds the far lawn's one-sample wind variant to the near tiles as
   * well — a material swap, not a second shader. */
  nearGrassSimplified: boolean;
}>;

/** Resolve a content tier into the meadow's own vocabulary. */
export function meadowContentPlan(tier: SceneContentTier): MeadowContentPlan {
  const definition = SCENE_CONTENT_DEFINITIONS[tier];
  return {
    nearTuftLod: definition.nearTuftLod,
    farTuftLod: MEADOW_FAR_TUFT_LOD,
    terrainSegmentsX: definition.terrainSegmentsX,
    terrainSegmentsZ: definition.terrainSegmentsZ,
    nearGrassSimplified: definition.nearGrassShader === "simplified",
  };
}

export type TerrainGeometryCache<T> = Readonly<{
  has(tier: SceneContentTier): boolean;
  peek(tier: SceneContentTier): T | undefined;
  get(tier: SceneContentTier): T;
  clear(dispose: (value: T) => void): void;
}>;

/** Build each tier's terrain mesh at most once, then keep it for the mount.
 *
 * The build is a per-vertex height/shade loop over tens of thousands of
 * vertices plus `computeVertexNormals`, so returning to a tier the visitor
 * has already seen must cost a pointer swap rather than a second loop. */
export function createTerrainGeometryCache<T>(
  build: (segmentsX: number, segmentsZ: number) => T,
): TerrainGeometryCache<T> {
  const cache = new Map<SceneContentTier, T>();
  return {
    has: (tier) => cache.has(tier),
    peek: (tier) => cache.get(tier),
    get(tier) {
      const existing = cache.get(tier);
      if (existing !== undefined) return existing;
      const plan = meadowContentPlan(tier);
      const created = build(plan.terrainSegmentsX, plan.terrainSegmentsZ);
      cache.set(tier, created);
      return created;
    },
    clear(dispose) {
      for (const value of cache.values()) dispose(value);
      cache.clear();
    },
  };
}

/** Consecutive settled frames inside the frame budget before a terrain build
 * may run. */
export const TERRAIN_BUILD_SETTLED_FRAMES = 3;
/** …and the point at which waiting for them stops being prudent. A device
 * that never offers three good frames is exactly the device that asked for
 * the cheaper terrain, so an unbounded wait inverts the intent. Measured
 * across continuous rest: a travel restarts the clock. */
export const TERRAIN_BUILD_MAX_WAIT_MS = 5_000;

export type TerrainBuildGate = Readonly<{
  goodFrames: number;
  restingSince: number | null;
}>;

export const IDLE_TERRAIN_BUILD_GATE: TerrainBuildGate = Object.freeze({
  goodFrames: 0,
  restingSince: null,
});

/** When a queued terrain build is allowed to run. Travel disarms the gate
 * outright rather than merely not counting: a multi-millisecond stall during
 * a traverse is the one stall guaranteed to be seen. */
export function nextTerrainBuildGate(
  gate: TerrainBuildGate,
  {
    pending,
    travelling,
    frameMs,
    now,
  }: { pending: boolean; travelling: boolean; frameMs: number; now: number },
): Readonly<{ gate: TerrainBuildGate; build: boolean }> {
  if (!pending || travelling)
    return { gate: IDLE_TERRAIN_BUILD_GATE, build: false };
  const restingSince = gate.restingSince ?? now;
  const goodFrames =
    Number.isFinite(frameMs) && frameMs <= SCENE_FRAME_BUDGET_MS
      ? gate.goodFrames + 1
      : 0;
  const build =
    goodFrames >= TERRAIN_BUILD_SETTLED_FRAMES ||
    now - restingSince >= TERRAIN_BUILD_MAX_WAIT_MS;
  return {
    gate: build ? IDLE_TERRAIN_BUILD_GATE : { goodFrames, restingSince },
    build,
  };
}

// Authored unmown areas preserve the same instance count and keep grass taller
// beneath furniture, where a mower could not reach. Their crest is narrow:
// the room still sits IN a meadow without applying a global height multiplier.
//
// Furniture also shades the grass. The ground draws
// baked shadow decals under every unit and the couch, but tufts grow up
// through those decals and used to stay fully lit — the same-browse "the
// lighting doesn't have any impact on the grass". These sites carry a
// contact-shadow mask (aShade) that the shaders multiply straight into the
// body color inside the furniture footprints (color, never geometry —
// density stays uniform).
const SHADE_UNIT_COUNT = Math.round(TRAVEL_X / UNIT_SPACING) + 1;

/** Contact-shadow occluders — the PROGRAMMATIC model (owner round 3: "the
 * shadows are far too large under the shelves… really just under the bottom
 * shelf, with maybe a little secondary one for the top shelf… some sorta
 * algo"): each occluder is its real footprint box projected straight down,
 * and `lift` (underside height above the lawn) drives everything else —
 * penumbra width grows with lift, strength decays with it. So the LOW
 * bottom plank throws a tight dark band exactly its own size, the HIGH top
 * plank a wide faint wash (the "secondary"), and a ground-sitting fixture
 * like the Systems floor clock a hard little pool that grades out — one
 * rule, no per-prop art direction. Overlapping occluders combine
 * multiplicatively like real occlusion. Boxes stay world-axis-aligned: the
 * units' ±0.1 rad yaw skews a footprint ≈0.15 u, under its penumbra. */
type ShadeOccluder = {
  x: number;
  z: number;
  hx: number;
  hz: number;
  lift: number;
};
const SHADE_OCCLUDERS: ShadeOccluder[] = [];
/** Place a unit-local footprint into world space through the unit's yaw. */
function pushUnitOccluder(
  i: number,
  lx: number,
  lz: number,
  hx: number,
  hz: number,
  lift: number,
) {
  const pose = unitPose(i);
  const yaw = pose.rotation[1];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  SHADE_OCCLUDERS.push({
    x: pose.position[0] + lx * c + lz * s,
    z: pose.position[2] - lx * s + lz * c,
    hx,
    hz,
    lift,
  });
}
for (let i = 0; i < SHADE_UNIT_COUNT; i++) {
  // Both shelf planks, straight from the shared geometry contract.
  pushUnitOccluder(
    i,
    0,
    SHELF_GEOMETRY.lower.centerZ,
    SHELF_GEOMETRY.width / 2,
    SHELF_GEOMETRY.lower.depth / 2,
    SHELF_UNDERSIDE.lower - MEADOW_GROUND_BASE,
  );
  pushUnitOccluder(
    i,
    0,
    SHELF_GEOMETRY.top.centerZ,
    SHELF_GEOMETRY.width / 2,
    SHELF_GEOMETRY.top.depth / 2,
    SHELF_UNDERSIDE.top - MEADOW_GROUND_BASE,
  );
}
// The About couch — measured hull centre (seated.ts), frame underside ≈0.18
// above the lawn on its legs.
SHADE_OCCLUDERS.push({ x: -3.41, z: 0.0, hx: 1.0, hz: 0.72, lift: 0.18 });
// Systems floor clock (UnitSystems, local 1.98/−0.15, FootPool 0.66×0.44).
pushUnitOccluder(3, 1.98, -0.15, 0.34, 0.26, 0.02);
// Talks floor lamp base (UnitTalks, local −2.12/0.06).
pushUnitOccluder(6, -2.12, 0.06, 0.19, 0.19, 0.02);

/** Penumbra width and strength as functions of occluder lift — the whole
 * "algorithm". Bottom plank (lift ≈0.27): pen ≈0.37, strength ≈0.75. Top
 * plank (lift ≈1.14): pen ≈0.98, strength ≈0.22. Ground fixtures: pen
 * ≈0.19, strength ≈0.91. */
const SHADE_PEN_BASE = 0.18;
const SHADE_PEN_PER_LIFT = 0.7;
function occluderStrength(lift: number): number {
  return clamp(0.92 - 0.62 * lift, 0.18, 0.92);
}

/** Furniture contact-shadow mask: →0 fully shaded, 1 open lawn. Rides its
 * own instance/vertex attribute (aShade); the shaders apply it as a direct
 * body-color multiplier (depth of the darkening is a shader-side knob —
 * this function owns only the occlusion geometry). */
export function shadeScale(x: number, z: number): number {
  let s = 1;
  for (const o of SHADE_OCCLUDERS) {
    const dx = Math.max(Math.abs(x - o.x) - o.hx, 0);
    const dz = Math.max(Math.abs(z - o.z) - o.hz, 0);
    const d = Math.hypot(dx, dz);
    const pen = SHADE_PEN_BASE + SHADE_PEN_PER_LIFT * o.lift;
    s *= 1 - occluderStrength(o.lift) * (1 - smoothstep(0, pen, d));
  }
  return s;
}

type UnmownArea = {
  x: number;
  z: number;
  hx: number;
  hz: number;
  underGrowth: number;
};
const UNMOWN_AREAS: UnmownArea[] = [];
for (let i = 0; i < SHADE_UNIT_COUNT; i++) {
  const pose = unitPose(i);
  UNMOWN_AREAS.push({
    x: pose.position[0],
    z: pose.position[2],
    hx: SHELF_GEOMETRY.width / 2 + 0.08,
    hz: 0.64,
    underGrowth: 1.22,
  });
}
// About couch and dumbbell; Training golf/weight bay; Systems clock; the
// Musings/Talks practical seam. These are intentionally explicit authored
// unmown footprints, not a global grass multiplier.
UNMOWN_AREAS.push(
  { x: -3.41, z: 0, hx: 1.12, hz: 0.82, underGrowth: 1.2 },
  { x: 1.05, z: 0.62, hx: 0.42, hz: 0.35, underGrowth: 1.16 },
  {
    x: unitPose(2).position[0] - 1.5,
    z: 0.45,
    hx: 1.0,
    hz: 0.55,
    underGrowth: 1.2,
  },
  {
    x: unitPose(3).position[0] + 1.98,
    z: -0.15,
    hx: 0.4,
    hz: 0.34,
    underGrowth: 1.17,
  },
  {
    x: unitPose(6).position[0] - 2.12,
    z: 0.06,
    hx: 0.3,
    hz: 0.3,
    underGrowth: 1.17,
  },
);

export function clearanceScale(x: number, z: number): number {
  let scale = 1;
  for (const area of UNMOWN_AREAS) {
    const inside =
      Math.abs(x - area.x) <= area.hx && Math.abs(z - area.z) <= area.hz;
    const dx = Math.max(Math.abs(x - area.x) - area.hx, 0);
    const dz = Math.max(Math.abs(z - area.z) - area.hz, 0);
    const distance = Math.hypot(dx, dz);
    // Furniture blocks mowing. Keep the grass tall beneath the footprint and
    // let it crest a little higher around the reachable edge, instead of
    // cutting a bare rectangular safety mat into the meadow.
    const growth = inside
      ? area.underGrowth
      : 1 + 0.3 * (1 - smoothstep(0.03, 0.42, distance));
    scale = Math.max(scale, growth);
  }
  return scale;
}

/** Grass stays visibly unmown under the furniture but cannot pass through the
 * lower plank. The small air gap keeps alpha-card tips from flickering on the
 * solid underside at grazing camera angles. */
export const UNDER_SHELF_GRASS_TIP_Y = SHELF_UNDERSIDE.lower - 0.04;

/** The full-detail source tuft reaches 1.76 normalized units from its root in
 * the XZ plane after height normalization. Round up, then include the shader's
 * maximum horizontal lean so roots outside a shelf cannot send a card through
 * its plank. */
export function grassTuftHorizontalReach(width: number, height: number) {
  return width * 1.8 + height * 0.3;
}

export function underLowerShelf(
  x: number,
  z: number,
  horizontalReach = 0,
): boolean {
  for (let i = 0; i < SHADE_UNIT_COUNT; i += 1) {
    const pose = unitPose(i);
    const yaw = pose.rotation[1];
    const dx = x - pose.position[0];
    const dz = z - pose.position[2];
    const localX = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const localZ = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    if (
      Math.abs(localX) <= SHELF_GEOMETRY.width / 2 + horizontalReach &&
      Math.abs(localZ - SHELF_GEOMETRY.lower.centerZ) <=
        SHELF_GEOMETRY.lower.depth / 2 + horizontalReach
    )
      return true;
  }
  return false;
}

function tallGrowthBias(x: number, z: number) {
  const behindShelves = 1 - smoothstep(-0.2, 2.4, z);
  const pitch = UNIT_SPACING;
  const local = Math.abs(
    ((((x + pitch / 2) % pitch) + pitch) % pitch) - pitch / 2,
  );
  const atSeam = 1 - smoothstep(0.18, 0.72, Math.abs(local - pitch / 2));
  return Math.max(behindShelves, atSeam * 0.8);
}

// ---------------------------------------------------------------------------
// West density feather. The walk phase of the seat transition can face the
// field's western flank DIRECTLY from a few units away (any yaw, ~30 units
// of radial reach before grass fog saturates), so no hard trapezoid edge
// can survive there — the standoff would need to be ~30 units of wasted
// instances. Instead the westmost stretch of the vegetation union fades by
// SCALE over WEST_FEATHER.span units: thinning grass, no line to find. The
// check script exempts feathered boundary samples from the hard-edge rule;
// vitest pins the span. South of endZ the flank is beyond the walk's fog
// reach and traverse frustums never yaw, so the hard edge resumes.
export const WEST_FEATHER = { span: 8 } as const;

/** Far density feather: with the ridge band the vegetation far line moved
 * to z −22.8, where the fog cap still leaves a residual of local color, so
 * the last few units thin out by scale — the same no-line-to-find treatment
 * as the west flank. (The mid band's tail no longer feathers: the ridge
 * band overlaps it, so there is no line there at all.) */
export const FAR_FEATHER = { span: 3.5 } as const;
const VEGETATION_FAR_Z = TRAVERSE_EYE.z - GRASS_BANDS.ridge.d1;

export function farFeatherScale(z: number): number {
  return (
    1 -
    0.88 * smoothstep(VEGETATION_FAR_Z + FAR_FEATHER.span, VEGETATION_FAR_Z, z)
  );
}

export function inFarFeather(z: number): boolean {
  return z <= VEGETATION_FAR_Z + FAR_FEATHER.span + 0.1;
}

/** Western boundary of the vegetation union at a z plane (−Infinity where
 * no band covers z). */
export function unionWestX(z: number): number {
  let west = Infinity;
  if (z <= VEGETATION_FRONT_Z && z >= TRAVERSE_EYE.z - GRASS_BANDS.ridge.d1) {
    west = Math.min(
      west,
      TRAVERSE_MIN_X - LATERAL_REACH * (TRAVERSE_EYE.z - z) - 0.6,
    );
  }
  if (z >= SEAT_Z + GRASS_BANDS.seated.d0 && z <= MEADOW_BANK.skirtZ) {
    west = Math.min(west, SEAT_X - seatedHalfWidth(z));
  }
  return west;
}

/** Scale multiplier implementing the feather: → 0.12 at the boundary. */
export function westFeatherScale(x: number, z: number): number {
  const west = unionWestX(z);
  if (!Number.isFinite(west)) return 1;
  return 0.12 + 0.88 * smoothstep(0, WEST_FEATHER.span, x - west);
}

export function inWestFeather(x: number, z: number): boolean {
  return x <= unionWestX(z) + WEST_FEATHER.span + 0.5;
}

/** The seated band's EAST flank past the traverse front line gets the same
 * treatment: settled-seat pointer sway (±0.18 rad of yaw) grazes it at
 * ultrawide aspects, so it fades instead of cutting. */
export const EAST_FEATHER = { span: 4 } as const;

export function eastFeatherScale(x: number, z: number): number {
  if (z <= VEGETATION_FRONT_Z) return 1; // traverse band owns the east there
  const east = SEAT_X + seatedHalfWidth(z);
  return 0.12 + 0.88 * smoothstep(0, EAST_FEATHER.span, east - x);
}

export function inEastFeather(x: number, z: number): boolean {
  if (z <= VEGETATION_FRONT_Z) return false;
  return x >= SEAT_X + seatedHalfWidth(z) - EAST_FEATHER.span - 0.5;
}

/** Broad, low-frequency mowing/growth drifts for the camera-side apron.
 * Keeping the noise wavelength several world units makes the variation read
 * as patches of lawn rather than every tuft receiving an unrelated height. */
export function flingApronHeightScale(x: number, z: number): number {
  const broad = vnoise2(x * 0.075, z * 0.32, 151);
  return 0.78 + 0.72 * smoothstep(0.24, 0.8, broad);
}

export type GrassInstances = {
  count: number;
  /** Rung-major cumulative counts — must equal the mesh's rung table. */
  rungCounts: number[];
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  yaw: Float32Array;
  /** World-unit tuft height (geometry is height-normalized to 1). */
  height: Float32Array;
  /** Lateral tuft scale (geometry footprint is ~2.5 per unit height). */
  width: Float32Array;
  /** Baked half-Lambert sun term from the terrain normal under the tuft —
   * what shapes the hills into lit and shaded flanks at zero shader cost. */
  sun: Float32Array;
  /** Furniture contact-shadow mask (shadeScale): 0 under the shelves/couch,
   * 1 open lawn. Applied as a direct body-color multiplier in the shader. */
  shade: Float32Array;
  /** Source band id per instance (0 near, 1 mid, 2 seated, 3 ridge,
   * 4 fling apron). Not a GPU
   * attribute — it exists so tests can audit per-band invariants after the
   * rung-major reorder (the mid and ridge bands overlap in z). */
  band: Uint8Array;
};

type RawInstance = {
  x: number;
  z: number;
  yaw: number;
  height: number;
  width: number;
  q: number;
  band: number;
};

/** The scene key light's fixed direction (KeyLight sits at eye + (4, 6.5,
 * 6)-ish looking back at the rail — the offset never changes, so the
 * direction is a constant and the sun term can be baked per tuft). */
const SUN_DIR = (() => {
  const l = Math.hypot(4, 7, 6);
  return { x: 4 / l, y: 7 / l, z: 6 / l };
})();

function bakedSun(x: number, z: number): number {
  // Central-difference terrain normal → half-Lambert against the key. Pure
  // slope shading — the furniture contact shadow rides its own attribute
  // (shadeScale → aShade) so the two signals stay independently tunable.
  const e = 0.35;
  const dx = (meadowHeight(x + e, z) - meadowHeight(x - e, z)) / (2 * e);
  const dz = (meadowHeight(x, z + e) - meadowHeight(x, z - e)) / (2 * e);
  const l = Math.hypot(dx, 1, dz);
  const ndl =
    (-dx / l) * SUN_DIR.x + (1 / l) * SUN_DIR.y + (-dz / l) * SUN_DIR.z;
  return 0.5 + 0.5 * Math.max(-1, Math.min(1, ndl));
}

function traverseXRange(d: number): [number, number] {
  return [
    TRAVERSE_MIN_X - LATERAL_REACH * d - 0.6,
    TRAVERSE_MAX_X + LATERAL_REACH * d + 0.6,
  ];
}

/** The trapezoid clipped to the terrain rectangle — the deepest rows (the
 * ridge band and hill flowers, d > 24) out-reach the rectangle's east edge;
 * the frustum out-slopes the rectangle there anyway, and the fog cap's
 * border-recovery band fully fogs the last strip. */
function clippedTraverseXRange(d: number): [number, number] {
  const [x0, x1] = traverseXRange(d);
  return [
    Math.max(x0, MEADOW_TERRAIN.minX + 0.3),
    Math.min(x1, MEADOW_TERRAIN.maxX - 0.3),
  ];
}

function unitLocalPoint(unit: number, localX: number, localZ: number) {
  const pose = unitPose(unit);
  const yaw = pose.rotation[1];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    x: pose.position[0] + localX * c + localZ * s,
    z: pose.position[2] - localX * s + localZ * c,
  };
}

const TRAINING_BARBELL_WORLD = unitLocalPoint(
  2,
  TRAINING_BARBELL_POSE.base[0],
  TRAINING_BARBELL_POSE.base[2],
);
const ABOUT_COUCH_WORLD = unitLocalPoint(0, ABOUT_COUCH.x, ABOUT_COUCH.z);

function barbellRearDistance(x: number, z: number) {
  return Math.hypot(
    (x - TRAINING_BARBELL_WORLD.x) / 2.4,
    (z - (TRAINING_BARBELL_WORLD.z - 2.8)) / 5.2,
  );
}

function aboutApproachDistance(x: number, z: number) {
  return Math.hypot(
    (x - ABOUT_COUCH_WORLD.x) / 4,
    (z - (ABOUT_COUCH_WORLD.z - 3.2)) / 5.5,
  );
}

function golfRearDistance(x: number, z: number) {
  return Math.hypot(
    (x - GOLF_COURSE_CENTER.x) / 4.2,
    (z - (GOLF_COURSE_CENTER.z - 2.3)) / 5.2,
  );
}

/** Relative acceptance for an existing grass root. The complete shelf row,
 * including every inter-shelf span, keeps its normal density. The About
 * approach, barbell rear bay, and rough behind the golf area receive the
 * highest weight; only the far lateral margins donate roots. Rejection
 * sampling below preserves the exact instance count. */
export function traverseGrassDensityWeight(x: number, z: number) {
  const inShelfRow = x >= TRAVERSE_MIN_X - 1.2 && x <= TRAVEL_X + 1.2;
  let weight = inShelfRow ? 0.86 : 0.7;

  const wellRightOfLastShelf = x > TRAVEL_X + SHELF_GEOMETRY.width / 2 + 1.2;
  if (wellRightOfLastShelf) weight = 0.42;

  if (aboutApproachDistance(x, z) <= 1) weight = 1;
  if (barbellRearDistance(x, z) <= 1) weight = 1;
  if (golfRearDistance(x, z) <= 1 && golfSurfaceAt(x, z) === "rough")
    weight = 1;

  return weight;
}

/** A small vertical fill for the two views where the near/mid transition is
 * otherwise low enough to expose terrain. This changes no root positions and
 * does not apply inside the putting surface. */
export function grassFocusHeightScale(x: number, z: number) {
  const barbell = 1 - smoothstep(0.35, 1, barbellRearDistance(x, z));
  const golf =
    golfSurfaceAt(x, z) === "rough"
      ? 1 - smoothstep(0.35, 1, golfRearDistance(x, z))
      : 0;
  return 1 + 0.14 * Math.max(barbell, golf);
}

function focusedTraverseX(seed: number, z: number, minX: number, maxX: number) {
  let candidate = minX;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    candidate = minX + rand(seed, 201 + attempt * 2) * (maxX - minX);
    if (
      rand(seed, 202 + attempt * 2) <= traverseGrassDensityWeight(candidate, z)
    )
      return candidate;
  }
  return candidate;
}

type CriticalGrassPatch = Readonly<{
  centerX: number;
  centerZ: number;
  halfX: number;
  halfZ: number;
  columns: number;
  rows: number;
  salt: number;
}>;

const CRITICAL_GRASS_PATCHES: readonly CriticalGrassPatch[] = [
  {
    centerX: TRAINING_BARBELL_WORLD.x,
    centerZ: TRAVERSE_EYE.z - 14,
    halfX: 2.4,
    halfZ: 1.2,
    columns: 12,
    rows: 6,
    salt: 311,
  },
  {
    centerX: ABOUT_COUCH_WORLD.x,
    centerZ: ABOUT_COUCH_WORLD.z - 3.2,
    halfX: 3,
    halfZ: 3.2,
    columns: 14,
    rows: 14,
    salt: 347,
  },
] as const;

const CRITICAL_GRASS_ANCHOR_COUNT = CRITICAL_GRASS_PATCHES.reduce(
  (sum, patch) => sum + patch.columns * patch.rows,
  0,
);

/** A small stratified subset prevents random thinning from reopening the two
 * most visible patches at Safety density. These replace roots from the far
 * lateral margins, so instance and triangle counts do not change. */
function criticalGrassAnchor(index: number) {
  let localIndex = index;
  for (const patch of CRITICAL_GRASS_PATCHES) {
    const count = patch.columns * patch.rows;
    if (localIndex >= count) {
      localIndex -= count;
      continue;
    }
    const column = localIndex % patch.columns;
    const row = Math.floor(localIndex / patch.columns);
    const cellX = (patch.halfX * 2) / patch.columns;
    const cellZ = (patch.halfZ * 2) / patch.rows;
    return {
      x:
        patch.centerX -
        patch.halfX +
        (column + 0.5) * cellX +
        (rand(index, patch.salt) - 0.5) * cellX * 0.24,
      z:
        patch.centerZ -
        patch.halfZ +
        (row + 0.5) * cellZ +
        (rand(index, patch.salt + 1) - 0.5) * cellZ * 0.24,
    };
  }
  return null;
}

/** Seated trapezoid half-width at a z plane — slope tan(0.7423 + 0.05)
 * (21:9 at fov 42, + lean margin) ≈ 1.017. The widest checked aspect (3.0,
 * tan ≈ 1.28) out-slopes this, but the 3.2 + 0.6 base slack keeps the band
 * edge outside that frustum at every depth to the crest (14.2 vs 13.0 at
 * the skirt line) — asserted by the check script's seated poses. */
function seatedHalfWidth(z: number): number {
  return 3.2 + (z - SEAT_Z) * 1.017 + 0.6;
}

export type GrassStreams = {
  /** Near lawn — detailed tuft LOD, its own InstancedMesh. */
  near: GrassInstances;
  /** Mid meadow + seated bank + ridge face — light tuft LOD, second
   * InstancedMesh. */
  far: GrassInstances;
};

/**
 * Spatial culling grid for the vegetation buffers. The cells are deliberately
 * broad: a portrait camera normally intersects only a handful, while an
 * ultrawide traverse still submits materially fewer vertices without turning
 * the old two grass draws into hundreds of tiny calls.
 *
 * Tile membership never changes placement. `buildMeadowTiles` stores indices
 * back into the authored stream and preserves every rung's front-to-back
 * order inside each cell.
 */
export const MEADOW_TILE_SIZE = { x: 14, z: 8 } as const;

export type MeadowTile = {
  key: string;
  ix: number;
  iz: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  indices: Uint32Array;
  /** Cumulative local counts matching the source stream's quality rungs. */
  rungCounts: readonly [number, number, number, number];
};

type TileableInstances = {
  count: number;
  rungCounts: number[];
  x: Float32Array;
  z: Float32Array;
};

/** Partition an authored rung-major stream without dropping or moving an
 * instance. Tiles are sorted front-to-back by their z row, then west-to-east,
 * so opaque/discarded vegetation keeps the old early-z bias between draws. */
export function buildMeadowTiles(
  stream: TileableInstances,
  options: { maxPopulation?: number } = {},
): MeadowTile[] {
  if (stream.rungCounts.length !== 4 || stream.rungCounts[3] !== stream.count) {
    throw new Error("Meadow tile source must contain four cumulative rungs");
  }

  type PendingTile = {
    ix: number;
    iz: number;
    rungs: [number[], number[], number[], number[]];
  };
  const pending = new Map<string, PendingTile>();
  let start = 0;

  stream.rungCounts.forEach((end, rung) => {
    for (let i = start; i < end; i++) {
      const ix = Math.floor(
        (stream.x[i]! - MEADOW_TERRAIN.minX) / MEADOW_TILE_SIZE.x,
      );
      const iz = Math.floor(
        (stream.z[i]! - MEADOW_TERRAIN.minZ) / MEADOW_TILE_SIZE.z,
      );
      const key = `${ix}:${iz}`;
      let tile = pending.get(key);
      if (!tile) {
        tile = { ix, iz, rungs: [[], [], [], []] };
        pending.set(key, tile);
      }
      tile.rungs[rung]!.push(i);
    }
    start = end;
  });

  const finish = (
    key: string,
    tile: PendingTile,
    bounds?: Pick<MeadowTile, "minX" | "maxX" | "minZ" | "maxZ">,
  ): MeadowTile => {
    const ordered: number[] = [];
    const rungCounts: [number, number, number, number] = [0, 0, 0, 0];
    tile.rungs.forEach((indices, rung) => {
      ordered.push(...indices);
      rungCounts[rung] = ordered.length;
    });
    const minX = MEADOW_TERRAIN.minX + tile.ix * MEADOW_TILE_SIZE.x;
    const minZ = MEADOW_TERRAIN.minZ + tile.iz * MEADOW_TILE_SIZE.z;
    return {
      key,
      ix: tile.ix,
      iz: tile.iz,
      minX: bounds?.minX ?? minX,
      maxX: bounds?.maxX ?? minX + MEADOW_TILE_SIZE.x,
      minZ: bounds?.minZ ?? minZ,
      maxZ: bounds?.maxZ ?? minZ + MEADOW_TILE_SIZE.z,
      indices: Uint32Array.from(ordered),
      rungCounts,
    };
  };

  const legacy = [...pending.entries()].map(([key, tile]) => finish(key, tile));
  const maxPopulation = options.maxPopulation;
  if (!maxPopulation || maxPopulation < 1) {
    return legacy.sort((a, b) => b.iz - a.iz || a.ix - b.ix);
  }

  /** Split the densest fixed cells by spatial median. Every child retains
   * the source's incremental rung buckets, so `finish` reconstructs the same
   * local cumulative-prefix contract as the legacy grid. */
  const balanced: MeadowTile[] = [];
  const split = (key: string, tile: PendingTile, depth: number) => {
    const population = tile.rungs.reduce(
      (sum, indices) => sum + indices.length,
      0,
    );
    if (population <= maxPopulation) {
      const all = tile.rungs.flat();
      const xs = all.map((index) => stream.x[index]!);
      const zs = all.map((index) => stream.z[index]!);
      balanced.push(
        finish(key, tile, {
          minX: Math.min(...xs),
          maxX: Math.max(...xs) + 1e-4,
          minZ: Math.min(...zs),
          maxZ: Math.max(...zs) + 1e-4,
        }),
      );
      return;
    }

    const tagged = tile.rungs.flatMap((indices) =>
      indices.map((index) => ({ index })),
    );
    const xs = tagged.map(({ index }) => stream.x[index]!);
    const zs = tagged.map(({ index }) => stream.z[index]!);
    const splitX =
      Math.max(...xs) - Math.min(...xs) >= Math.max(...zs) - Math.min(...zs);
    tagged.sort((a, b) => {
      const primary = splitX
        ? stream.x[a.index]! - stream.x[b.index]!
        : stream.z[a.index]! - stream.z[b.index]!;
      const secondary = splitX
        ? stream.z[a.index]! - stream.z[b.index]!
        : stream.x[a.index]! - stream.x[b.index]!;
      return primary || secondary || a.index - b.index;
    });
    const halves = [
      tagged.slice(0, Math.ceil(population / 2)),
      tagged.slice(Math.ceil(population / 2)),
    ];
    halves.forEach((half, side) => {
      const members = new Set(half.map(({ index }) => index));
      const rungs = tile.rungs.map((indices) =>
        indices.filter((index) => members.has(index)),
      ) as PendingTile["rungs"];
      split(
        `${key}.${depth}${side}`,
        { ix: tile.ix, iz: tile.iz, rungs },
        depth + 1,
      );
    });
  };

  pending.forEach((tile, key) => split(key, tile, 0));
  return balanced.sort((a, b) => b.maxZ - a.maxZ || a.minX - b.minX);
}

export function buildGrassInstances(
  total: number = MEADOW_GRASS_TOTAL,
): GrassStreams {
  const scale = total / MEADOW_GRASS_TOTAL;
  const bands = [
    { ...GRASS_BANDS.near, id: 0 },
    { ...GRASS_BANDS.mid, id: 1 },
    { ...GRASS_BANDS.seated, id: 2 },
    { ...GRASS_BANDS.ridge, id: 3 },
    { ...GRASS_BANDS.apron, d0: 0, d1: 0, id: 4 },
  ].map((b) => ({ ...b, count: Math.round(b.count * scale) }));

  const raw: RawInstance[] = [];
  let i = 0;
  let criticalAnchorIndex = 0;
  const criticalAnchorLimit = Math.min(
    Math.round(CRITICAL_GRASS_ANCHOR_COUNT * scale),
    bands[0]!.count,
  );
  for (const band of bands) {
    for (let k = 0; k < band.count; k++, i++) {
      const u = rand(i, 41);
      let d: number;
      if (band.id === 4) {
        d = 0;
      } else if (band.id === 2) {
        // Seated band: 30% is couch-surround lawn (walk-phase coverage),
        // 70% is pinned onto the bank itself so the riverbank stays dense
        // — a single 1/d ramp from 0.6 would sink half the band behind
        // the seat where nothing ever looks.
        const bankD0 = 2.8;
        d =
          u < 0.3
            ? band.d0 * Math.pow(bankD0 / band.d0, u / 0.3)
            : bankD0 * Math.pow(band.d1 / bankD0, (u - 0.3) / 0.7);
      } else {
        d = band.d0 * Math.pow(band.d1 / band.d0, u);
      }
      let x: number;
      let z: number;
      let isCriticalAnchor = false;
      if (band.id === 4) {
        z =
          FLING_GRASS_APRON.minZ +
          rand(i, 46) * (FLING_GRASS_APRON.maxZ - FLING_GRASS_APRON.minZ);
        x =
          FLING_GRASS_APRON.minX +
          rand(i, 42) * (FLING_GRASS_APRON.maxX - FLING_GRASS_APRON.minX);
      } else if (band.id === 2) {
        z = SEAT_Z + d;
        const hw = seatedHalfWidth(z);
        x = SEAT_X - hw + rand(i, 42) * 2 * hw;
      } else {
        z = TRAVERSE_EYE.z - d;
        const [x0, x1] =
          band.id === 3 ? clippedTraverseXRange(d) : traverseXRange(d);
        x = focusedTraverseX(i, z, x0, x1);
      }
      if (
        band.id === 0 &&
        criticalAnchorIndex < criticalAnchorLimit &&
        traverseGrassDensityWeight(x, z) <= 0.7
      ) {
        const anchor = criticalGrassAnchor(criticalAnchorIndex);
        if (anchor) {
          x = anchor.x;
          z = anchor.z;
          d = TRAVERSE_EYE.z - z;
          isCriticalAnchor = true;
          criticalAnchorIndex += 1;
        }
      }
      let height: number;
      let width: number;
      if (band.id === 4) {
        const growth = flingApronHeightScale(x, z);
        height = 0.15 * (0.75 + 0.5 * rand(i, 44)) * growth;
        width =
          (0.36 + 0.2 * rand(i, 45)) * (0.9 + 0.25 * ((growth - 0.78) / 0.72));
      } else if (band.id === 1) {
        // Mid meadow: tufts grow to ~0.45 tall / ~2.5-unit footprints with
        // distance, holding screen fill as areal density drops.
        height = midGrassHeight(d, rand(i, 44));
        width = midGrassWidth(d, rand(i, 45));
      } else if (band.id === 2) {
        height = 0.16 * (0.9 + 0.5 * rand(i, 44));
        width = 0.36 + 0.18 * rand(i, 45);
      } else if (band.id === 3) {
        // Ridge face: few, huge, squat. Width carries the coverage (the
        // band is sparse); height stays under ~0.45 so the tuft fringe
        // above the proven crest silhouette is a fuzz, not a wall.
        height = 0.24 + 0.2 * rand(i, 44);
        width = ridgeGrassWidth(rand(i, 45));
      } else {
        height = nearGrassHeight(d, rand(i, 44));
        width = nearGrassWidth(d, rand(i, 45));
      }
      const f =
        band.id === 4
          ? 1
          : westFeatherScale(x, z) *
            eastFeatherScale(x, z) *
            farFeatherScale(z);
      // Exact 70/25/5 authored height tiers. Taller tiers gain a little more
      // presence behind cases and at unit seams; the furniture mask below can
      // raise them further but never shorten them.
      const tierRoll = rand(i, 144);
      const tier = tierRoll < 0.7 ? 1 : tierRoll < 0.95 ? 1.32 : 1.78;
      const concentration = tier === 1 ? 1 : 1 + tallGrowthBias(x, z) * 0.16;
      const clearance = clearanceScale(x, z);
      const rootY = meadowHeight(x, z) - GRASS_ROOT_SINK;
      const authoredHeight =
        height *
        tier *
        concentration *
        f *
        clearance *
        grassFocusHeightScale(x, z);
      const renderedWidth = width * f * (0.82 + clearance * 0.18);
      const horizontalReach = grassTuftHorizontalReach(
        renderedWidth,
        authoredHeight,
      );
      const cappedHeight = underLowerShelf(x, z, horizontalReach)
        ? Math.min(authoredHeight, Math.max(0, UNDER_SHELF_GRASS_TIP_Y - rootY))
        : authoredHeight;
      raw.push({
        x,
        z,
        yaw: rand(i, 43) * Math.PI * 2,
        height: cappedHeight,
        width: renderedWidth,
        q: isCriticalAnchor ? rand(i, 197) * 0.08 : rand(i, 97),
        band: band.id,
      });
    }
  }

  // Rung stratification: within each band, order by quality quantile and cut
  // at the exact cumulative fractions — every band thins by the same ratio
  // at every rung. Each mesh's buffer is rung-major, front-to-back
  // (ascending 5.8 − z) within each rung for early-z.
  const perBandRungs: RawInstance[][][] = bands.map(() =>
    MEADOW_RUNG_FRACTIONS.map(() => []),
  );
  bands.forEach((band, bi) => {
    const members = raw.filter((r) => r.band === band.id);
    members.sort((a, b) => a.q - b.q || a.x - b.x);
    let start = 0;
    MEADOW_RUNG_FRACTIONS.forEach((frac, ri) => {
      const end = Math.round(band.count * frac);
      perBandRungs[bi]![ri] = members.slice(start, end);
      start = end;
    });
  });

  const assemble = (bandIndices: number[]): GrassInstances => {
    const ordered: RawInstance[] = [];
    const rungCounts: number[] = [];
    MEADOW_RUNG_FRACTIONS.forEach((_, ri) => {
      const rung: RawInstance[] = [];
      for (const bi of bandIndices) rung.push(...perBandRungs[bi]![ri]!);
      // Ascending view depth (5.8 − z) = descending z.
      rung.sort((a, b) => b.z - a.z || a.x - b.x);
      ordered.push(...rung);
      rungCounts.push(ordered.length);
    });
    const out: GrassInstances = {
      count: ordered.length,
      rungCounts,
      x: new Float32Array(ordered.length),
      y: new Float32Array(ordered.length),
      z: new Float32Array(ordered.length),
      yaw: new Float32Array(ordered.length),
      height: new Float32Array(ordered.length),
      width: new Float32Array(ordered.length),
      sun: new Float32Array(ordered.length),
      shade: new Float32Array(ordered.length),
      band: new Uint8Array(ordered.length),
    };
    ordered.forEach((r, k) => {
      out.x[k] = r.x;
      out.y[k] = meadowHeight(r.x, r.z) - GRASS_ROOT_SINK;
      out.z[k] = r.z;
      out.yaw[k] = r.yaw;
      out.height[k] = r.height;
      out.width[k] = r.width;
      out.sun[k] = bakedSun(r.x, r.z);
      out.shade[k] = shadeScale(r.x, r.z);
      out.band[k] = r.band;
    });
    return out;
  };

  return { near: assemble([0, 4]), far: assemble([1, 2, 3]) };
}

// ---------------------------------------------------------------------------
// Flowers — CLUMPED (owner round 2): the drift-masked candidate logic that
// used to place every head now places ~1/5 of them as CLUSTER SEEDS, and
// each seed spawns 3–8 heads at deterministic gaussian offsets — cornflower
// and poppy clumps rather than confetti. Every head keeps its own quality
// quantile q, so the rung dial thins clumps head-by-head instead of
// deleting whole clusters. Each CLUMP draws one species color (tint is
// per-seed): a blue drift here, an orange drift there.
export type FlowerInstances = {
  count: number;
  rungCounts: number[];
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  scale: Float32Array;
  /** Independent per-head variation used by lift, tilt, size floor, and
   * restrained color modulation. */
  variation: Float32Array;
  /** Per-head species tint in [0,1), shared across a clump — the shader's
   * vTint thresholds (0.55 / 0.75) turn it into the A/B/C color split. */
  tint: Float32Array;
  /** 1 for the camera-side fling apron, 0 for the authored field/bank. */
  apron: Uint8Array;
};

const DRIFT_SALT = 83;
/** Keep generated tints below the removed seed-head range. */
const FLOWER_TINT_CEILING = 0.92;
function flowerTint(i: number, salt: number) {
  const tint = rand(i, salt);
  return tint < FLOWER_TINT_CEILING
    ? tint
    : ((tint - FLOWER_TINT_CEILING) / (1 - FLOWER_TINT_CEILING)) *
        FLOWER_TINT_CEILING;
}
export function driftMask(x: number, z: number): boolean {
  return vnoise2(x * 0.09, z * 0.09, DRIFT_SALT) > 0.66;
}

export const FLOWER_CLUSTER = {
  headsMin: 3,
  headsMax: 8,
  /** Gaussian offset σ in world units. */
  sigma: 0.42,
} as const;

/** Bounded deterministic ≈gaussian (Irwin–Hall of 4 lattice draws, rescaled
 * to sd σ): clumps read organic but no head can stray past 3.46σ, so the
 * clamps below almost never engage. */
function clusterOffset(i: number, salt: number): number {
  const s =
    rand(i, salt) +
    rand(i, salt + 1) +
    rand(i, salt + 2) +
    rand(i, salt + 3) -
    2;
  return s * FLOWER_CLUSTER.sigma * 1.732;
}

type RawFlower = {
  x: number;
  z: number;
  scale: number;
  q: number;
  tint: number;
  apron: boolean;
};

export function buildFlowerPositions(
  total: number = MEADOW_FLOWER_TOTAL,
): FlowerInstances {
  const apronCount = Math.round(
    total * (FLING_APRON_FLOWERS.count / MEADOW_FLOWER_TOTAL),
  );
  const highHillCount = Math.round(
    total * (MEADOW_FLOWER_HIGH_HILL_BONUS / MEADOW_FLOWER_TOTAL),
  );
  const fieldCount = total - apronCount - highHillCount;
  const traverseCount = Math.round(
    fieldCount * (MEADOW_FLOWER_TRAVERSE_TOTAL / MEADOW_FLOWER_FIELD_TOTAL),
  );
  const bankCount = fieldCount - traverseCount;
  const groups: RawFlower[][] = [[], [], [], []];

  for (let s = 0; groups[0]!.length < traverseCount; s++) {
    // Seed placement — two-lobed depth weighting on [4.8, ridge.d1]: the
    // main gaussian keeps the drifts dominating the mid field; the second
    // lobe carries them up the horizon ridge's face (owner round 3: "the
    // flowers need to go all the way into the hills"); and the 0.3 floor
    // (his second pass on 0.16: "you can have more up close") scatters
    // clumps right through the shelf strip (z −3…1 is d 4.8…8.8 —
    // "should the flowers come all the way up to the shelves? ya") at
    // ~a third of midfield density, so the furniture sits IN the
    // flowering meadow without near heads crowding the placards.
    // Deterministic salted tries stand in for rejection sampling; a miss
    // keeps its last candidate.
    let x = 0;
    let z = 0;
    for (let t = 0; t < 6; t++) {
      // Range starts at d 2.6 (z 3.2, well in front of the shelves —
      // third pass: "they can still come up a bit further").
      const d = 2.6 + rand(s, 61 + t * 7) * (GRASS_BANDS.ridge.d1 - 2.6);
      const w = Math.max(gauss(d, 16, 5), 0.8 * gauss(d, 26.5, 3), 0.3);
      if (rand(s, 62 + t * 7) > w) continue;
      z = TRAVERSE_EYE.z - d;
      const [x0, x1] = clippedTraverseXRange(d);
      x = x0 + rand(s, 63 + t * 7) * (x1 - x0);
      if (driftMask(x, z)) break;
    }
    if (x === 0 && z === 0) {
      const d = 15;
      z = TRAVERSE_EYE.z - d;
      const [x0, x1] = traverseXRange(d);
      x = x0 + rand(s, 64) * (x1 - x0);
    }
    const tint = flowerTint(s, 69);
    const heads =
      FLOWER_CLUSTER.headsMin +
      Math.floor(
        rand(s, 68) * (FLOWER_CLUSTER.headsMax - FLOWER_CLUSTER.headsMin + 1),
      );
    for (let h = 0; h < heads && groups[0]!.length < traverseCount; h++) {
      const i = groups[0]!.length;
      // Clamp the head back into its own depth's trapezoid so a clump seeded
      // near a band boundary cannot leak a head past the proven extents.
      const d = clamp(
        TRAVERSE_EYE.z - (z + clusterOffset(i, 76)),
        2.6,
        GRASS_BANDS.ridge.d1,
      );
      const hz = TRAVERSE_EYE.z - d;
      const [x0, x1] = clippedTraverseXRange(d);
      const hx = clamp(x + clusterOffset(i, 71), x0, x1);
      groups[0]!.push({
        x: hx,
        z: hz,
        // Hill heads grow like the far tufts do, so a drift on the ridge
        // face reads as a drift, not dust (the pixel floor handles the
        // very far tail). The boost is steep — at the first cut (×1.9 max)
        // the owner couldn't find them ("really hard to see them").
        scale:
          (FLOWER_VARIATION.fieldScale[0] +
            rand(i, 66) *
              (FLOWER_VARIATION.fieldScale[1] -
                FLOWER_VARIATION.fieldScale[0])) *
          (1 + 1.6 * smoothstep(18, 27, d)) *
          westFeatherScale(hx, hz) *
          farFeatherScale(hz),
        q: rand(i, 98),
        tint,
        apron: false,
      });
    }
  }

  for (let s = 0; groups[1]!.length < bankCount; s++) {
    const sj = 4096 + s; // clear of the traverse seeds' lattice rows
    // Bias toward the crest (pow < 1 pushes z toward the skirt line) so the
    // clumps sit on the silhouette against the water.
    let x = 0;
    let z = 0;
    for (let t = 0; t < 6; t++) {
      z =
        MEADOW_BANK.riseStartZ +
        Math.pow(rand(sj, 61 + t * 7), 0.5) *
          (MEADOW_BANK.skirtZ - MEADOW_BANK.riseStartZ);
      const hw = seatedHalfWidth(z);
      x = SEAT_X - hw + rand(sj, 63 + t * 7) * 2 * hw;
      if (driftMask(x, z)) break;
    }
    const tint = flowerTint(sj, 69);
    const heads =
      FLOWER_CLUSTER.headsMin +
      Math.floor(
        rand(sj, 68) * (FLOWER_CLUSTER.headsMax - FLOWER_CLUSTER.headsMin + 1),
      );
    for (let h = 0; h < heads && groups[1]!.length < bankCount; h++) {
      const j = traverseCount + groups[1]!.length;
      const hz = clamp(
        z + clusterOffset(j, 76),
        MEADOW_BANK.riseStartZ - 0.8,
        MEADOW_BANK.skirtZ,
      );
      const hw = seatedHalfWidth(hz);
      const hx = clamp(x + clusterOffset(j, 71), SEAT_X - hw, SEAT_X + hw);
      groups[1]!.push({
        x: hx,
        z: hz,
        scale:
          (FLOWER_VARIATION.bankScale[0] +
            rand(j, 66) *
              (FLOWER_VARIATION.bankScale[1] - FLOWER_VARIATION.bankScale[0])) *
          westFeatherScale(hx, hz),
        q: rand(j, 98),
        tint,
        apron: false,
      });
    }
  }

  // Camera-side flowers: a handful of compact clumps across the travel
  // corridor, set back from the ordinary z=4.6 lawn line. A low-frequency
  // acceptance mask creates broad empty stretches between clusters so a
  // fling reveals a little discovery, not evenly spread confetti.
  for (let s = 0; groups[2]!.length < apronCount; s++) {
    const sj = 8192 + s;
    let x = 0;
    let z = 0;
    for (let t = 0; t < 8; t++) {
      x =
        FLING_APRON_FLOWERS.minX +
        rand(sj, 121 + t * 5) *
          (FLING_APRON_FLOWERS.maxX - FLING_APRON_FLOWERS.minX);
      z =
        FLING_APRON_FLOWERS.minZ +
        rand(sj, 122 + t * 5) *
          (FLING_APRON_FLOWERS.maxZ - FLING_APRON_FLOWERS.minZ);
      if (vnoise2(x * 0.11, z * 0.5, 173) > 0.5) break;
    }
    const tint = flowerTint(sj, 129);
    const heads =
      FLOWER_CLUSTER.headsMin +
      Math.floor(
        rand(sj, 128) * (FLOWER_CLUSTER.headsMax - FLOWER_CLUSTER.headsMin + 1),
      );
    for (let h = 0; h < heads && groups[2]!.length < apronCount; h++) {
      const j = fieldCount + groups[2]!.length;
      groups[2]!.push({
        x: clamp(
          x + clusterOffset(j, 131),
          FLING_APRON_FLOWERS.minX,
          FLING_APRON_FLOWERS.maxX,
        ),
        z: clamp(
          z + clusterOffset(j, 136) * 0.65,
          FLING_APRON_FLOWERS.minZ,
          FLING_APRON_FLOWERS.maxZ,
        ),
        scale:
          FLOWER_VARIATION.apronScale[0] +
          rand(j, 126) *
            (FLOWER_VARIATION.apronScale[1] - FLOWER_VARIATION.apronScale[0]),
        q: rand(j, 138),
        tint,
        apron: true,
      });
    }
  }

  // The crest flowers stay rooted at the original low lift, so distant grass
  // hides more of each head than it does in the middle background. This
  // dedicated layer restores equal visible density without lifting the heads
  // back into the floating silhouette the owner rejected.
  for (let s = 0; groups[3]!.length < highHillCount; s++) {
    const sj = 12288 + s;
    let x = 0;
    let z = 0;
    for (let t = 0; t < 6; t++) {
      const shelfView = Math.min(
        SHADE_UNIT_COUNT - 1,
        Math.floor(rand(sj, 180) * SHADE_UNIT_COUNT),
      );
      const d =
        FLOWER_BACKGROUND_LIFT.settleDepth[1] +
        rand(sj, 181 + t * 7) *
          (GRASS_BANDS.ridge.d1 - FLOWER_BACKGROUND_LIFT.settleDepth[1]);
      z = TRAVERSE_EYE.z - d;
      const [x0, x1] = clippedTraverseXRange(d);
      const viewCenter = unitPose(shelfView).position[0];
      const viewHalfWidth = d * 0.58;
      x = clamp(
        viewCenter + (rand(sj, 182 + t * 7) - 0.5) * viewHalfWidth * 2,
        x0,
        x1,
      );
      if (driftMask(x, z)) break;
    }
    const tint = flowerTint(sj, 189);
    const heads =
      FLOWER_CLUSTER.headsMin +
      Math.floor(
        rand(sj, 188) * (FLOWER_CLUSTER.headsMax - FLOWER_CLUSTER.headsMin + 1),
      );
    for (let h = 0; h < heads && groups[3]!.length < highHillCount; h++) {
      const j = fieldCount + apronCount + groups[3]!.length;
      const d = clamp(
        TRAVERSE_EYE.z - (z + clusterOffset(j, 196)),
        FLOWER_BACKGROUND_LIFT.settleDepth[1],
        GRASS_BANDS.ridge.d1,
      );
      const hz = TRAVERSE_EYE.z - d;
      const [x0, x1] = clippedTraverseXRange(d);
      const hx = clamp(x + clusterOffset(j, 191), x0, x1);
      groups[3]!.push({
        x: hx,
        z: hz,
        scale:
          (FLOWER_VARIATION.fieldScale[0] +
            rand(j, 186) *
              (FLOWER_VARIATION.fieldScale[1] -
                FLOWER_VARIATION.fieldScale[0])) *
          (1 + 1.6 * smoothstep(18, 27, d)) *
          westFeatherScale(hx, hz) *
          farFeatherScale(hz),
        q: rand(j, 198),
        tint,
        apron: false,
      });
    }
  }

  // Same stratified-order contract as the grass, with the flower rung table's
  // own fractions. Field, bank, camera-side, and high-hill groups thin by the
  // same ratio, front-to-back within each stratum.
  const fractions = MEADOW_RUNG_FLOWERS.map((c) => c / MEADOW_FLOWER_TOTAL);
  const perGroupRungs: RawFlower[][][] = groups.map(() =>
    fractions.map(() => []),
  );
  groups.forEach((members, gi) => {
    const sorted = [...members].sort((a, b) => a.q - b.q || a.x - b.x);
    let start = 0;
    fractions.forEach((frac, ri) => {
      const end = Math.round(members.length * frac);
      perGroupRungs[gi]![ri] = sorted.slice(start, Math.max(start, end));
      start = Math.max(start, end);
    });
  });

  const ordered: RawFlower[] = [];
  const rungCounts: number[] = [];
  fractions.forEach((_, ri) => {
    const rung: RawFlower[] = [];
    for (const groupRungs of perGroupRungs) rung.push(...groupRungs[ri]!);
    rung.sort((a, b) => b.z - a.z || a.x - b.x);
    ordered.push(...rung);
    rungCounts.push(ordered.length);
  });

  const out: FlowerInstances = {
    count: ordered.length,
    rungCounts,
    x: new Float32Array(ordered.length),
    y: new Float32Array(ordered.length),
    z: new Float32Array(ordered.length),
    scale: new Float32Array(ordered.length),
    variation: new Float32Array(ordered.length),
    tint: new Float32Array(ordered.length),
    apron: new Uint8Array(ordered.length),
  };
  ordered.forEach((f, k) => {
    const variation = vnoise2(f.x * 2.9, f.z * 2.9, 241);
    const depth = TRAVERSE_EYE.z - f.z;
    const visibleInLowerHill = depth < 18 || depth >= 24 || variation >= 0.42;
    const survivesBackgroundThinning = flowerSurvivesBackgroundThinning(
      depth,
      f.q,
    );
    const golf = suppressGolfVegetation(f.x, f.z, variation);
    out.x[k] = f.x;
    const lift = f.apron ? FLOWER_LIFT : flowerCanopyLift(f.x, f.z, variation);
    out.y[k] = meadowHeight(f.x, f.z) + lift;
    out.z[k] = f.z;
    out.scale[k] =
      visibleInLowerHill && survivesBackgroundThinning && golf.flowers
        ? f.scale
        : 0;
    out.variation[k] = variation;
    out.tint[k] = f.tint;
    out.apron[k] = f.apron ? 1 : 0;
  });
  return out;
}
