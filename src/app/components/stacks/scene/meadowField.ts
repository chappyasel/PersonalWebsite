// Meadow field math — terrain heights, instance sampling, and the rung-order
// contract for the homepage meadow. Single source of truth shared by
// Meadow.tsx (whose GLSL interpolates the constants below), the headless
// check script, and vitest — so the shader and its verifiers cannot drift.
// No three.js imports, worldLayout.ts pattern: DOM-side scripts and node can
// evaluate everything here without WebGL.
import { rand } from "../theme";

import { SEAT_POSE } from "./seated";
import { TRAVEL_LEAD_IN, TRAVEL_X, UNIT_SPACING, unitPose } from "./worldLayout";

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
export const NEAR_FEATHER_ZONE = { minZ: 4.52, maxZ: VEGETATION_FRONT_Z } as const;
export const inNearFeatherZone = (z: number) =>
  z >= NEAR_FEATHER_ZONE.minZ && z <= NEAR_FEATHER_ZONE.maxZ;

// Terrain rectangle. Every edge is either outside every checked frustum or
// past 99% terrain fog before geometry ends: an x-edge sample at view depth
// d is in a frustum only if |Δx| ≤ 0.994·d, and |Δx| ≥ 26.6 from both
// traverse extremes means that needs d ≥ 26.8 — beyond the 23.1 where the
// fog ramp passes 99%. The ±x edges also sit ≥ 24 radial from every eye on
// the seat-transition swing (eye x −3.4 → left edge 24.6 away, eye x 26.4 →
// right edge 26.6 away), covering the yaw sweep the pose matrix cannot
// sample. Vegetation spans per z-plane are trapezoidal (reach = d·1.0):
// near-band far z −8.2 (d 14) → x [−15.8, 41]; mid far z −18.2 (d 24) →
// x [−25.8, 51] — all inside the rectangle.
export const MEADOW_TERRAIN = {
  minX: -28,
  maxX: 53,
  minZ: -27,
  maxZ: 12.8,
  // 216×132 keeps far cells small enough that per-vertex fog color
  // interpolation cannot band against the analytic dome.
  segmentsX: 216,
  segmentsZ: 132,
} as const;

// One ramp story (view-depth smoothsteps): grass saturates at 22, terrain at
// 24 — exactly the scene fog far — both into the same dome-matched target, so
// the instanced→terrain handoff and all four terrain edges self-maintain in
// both themes and at every uDawn. Meadow.tsx interpolates these into GLSL;
// the check script asserts against the same numbers.
export const MEADOW_FOG = {
  terrain: [8, 24],
  grass: [8, 22],
} as const;

/** Base plain height. Room prop ground is −1.115 (shadow pools −1.114). */
export const MEADOW_GROUND_BASE = -1.17;
/** Shelf-strip terrain ceiling: 0.036 clearance under the shadow pools kills
 * the z-fight class entirely. Asserted by vitest across the room span. */
export const MEADOW_SHELF_CEILING_Y = -1.15;
/** Blade roots sink below the surface so slope contact never gaps. */
export const GRASS_ROOT_SINK = 0.015;
/** Flower heads float at canopy height above the terrain. */
export const FLOWER_LIFT = 0.1;

// Bank + far-skirt regions (authored silhouettes, see meadowHeight).
export const MEADOW_BANK = {
  riseStartZ: 8.0,
  crestZ: 10.8,
  skirtZ: 11.2,
  /** Skirt drop per unit z. The steepest seated sight ray over the crest
   * falls 0.102/unit at the extreme azimuth; 0.9 ≫ that, so the terrain end
   * is never visible (also holds for the sit-transition eye at y 0.25,
   * ray slope 0.156). */
  skirtDrop: 0.9,
} as const;
export const MEADOW_FAR_SKIRT = {
  z: -24.5,
  /** Sight ray over the R3 crest falls at worst 0.038/unit ≪ 1.1: hidden —
   * and it is past 100% fog regardless. */
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
// The far ridge's crest is AUTHORED in world y so its silhouette can be
// proven: crest y ∈ [−1.40, −0.80] reads from the traverse eyes at elevation
// −0.028…−0.054 (desktop eye y 0.25, d 30.3; phone y 0.3, d 32.1; worst
// frame-edge cos-shallowing ×0.814 → −0.028) — inside the skyline fade band
// (structures × smoothstep(−0.10, −0.02, e)) with ≥ 0.008 margin.
export function ridgeCrestY(x: number): number {
  const y =
    -1.1 + 0.3 * Math.sin(x * 0.24 + 2.1) + 0.15 * (vnoise1(x * 0.13, 3.7) - 0.5) * 2;
  return clamp(y, -1.4, -0.8);
}

export function meadowHeight(x: number, z: number): number {
  // Near undulation, damped to ×0.3 through the shelf strip (z ∈ [−3, 1])
  // so the surface never rises above MEADOW_SHELF_CEILING_Y there.
  const strip = smoothstep(-4, -3, z) * (1 - smoothstep(1, 2, z));
  const und =
    (0.02 * Math.sin(x * 0.58 + z * 0.31) +
      0.015 * Math.sin(x * 0.19 - z * 0.44)) *
    (1 - 0.7 * strip);

  // R1 mid ridgeline (z −13): first haze layer, ~80% terrain fog at d ≈ 18.8.
  // The crest rolls in x so the read is rolling hills, not a berm.
  const r1 =
    0.42 *
    gauss(z, -13, 3.4) *
    (0.55 + 0.45 * Math.sin(x * 0.66 + 1.3) + 0.18 * (vnoise1(x * 0.21, 7.3) - 0.5));

  // R2 mid-far ridgeline (z −16): second, fainter layer (~94% fog),
  // x-phase offset from R1 so their crests interleave in screen space —
  // the rolling-with-haze-separation layering.
  const r2 = 0.55 * gauss(z, -16, 3.8) * (0.55 + 0.45 * Math.sin(x * 0.43 - 0.7));

  // Where R1's and R2's x-phases align (~every 27 units) the raw stack
  // reaches 0.85 and its crest breaches the skyline fade band from a
  // 3.0-aspect frame corner at low eye bob. Compress the sum's excess so
  // the combined crest tops out ≈ 0.51 (y ≈ −0.63, e ≤ −0.022 from every
  // pose) while solo crests keep most of their roll.
  let mid = r1 + r2;
  if (mid > 0.4) mid = 0.4 + (mid - 0.4) * 0.24;

  // R3 far ridge — the horizon silhouette. Crest y is authored directly
  // (ridgeCrestY); where the crest dips below the plain the ridge opens into
  // a fogged valley, which is what keeps the skyline handoff from reading as
  // one continuous wall.
  const r3 = (ridgeCrestY(x) - MEADOW_GROUND_BASE) * gauss(z, MEADOW_FAR_SKIRT.z, 1.6);

  // Flanking swells — the ONLY above-horizon crests, framing the city at
  // empty azimuths. S_L (−13, −22) apex world y ≈ +0.49: its above-horizon
  // azimuth span clears the GGB dome window (−2.04 ± 0.062) by ≥ 0.021 rad
  // from every traverse eye, and its apex elevation (≤ +0.009) can never
  // touch the deck at e 0.038. S_R (38, −21) apex ≈ +0.48 sits right of the
  // Bay Bridge's right edge (dome az −1.027) from every eye that frames it.
  // Amplitudes measured, not solved: R2 leaks ~0.06 under S_R, the
  // undulation adds ±0.035 under both, and the eye's LOW bob (y −0.11)
  // steepens every apex sightline — the raw 1.66/1.65 gaussians crested at
  // e 0.011+ from a bobbed-down eye, over the +0.009 ceiling the vitest and
  // check script hold them to (Sutro's lowest drawn pixel is e 0.010).
  // Trimmed until the MEASURED worst-case apexes clear it: apex world y
  // ≈ +0.40/+0.39, still above the horizon from every standing pose.
  const sw = 3.5;
  const sL =
    1.56 * Math.exp(-(((x + 13) / sw) ** 2 + ((z + 22) / sw) ** 2));
  const sR =
    1.51 * Math.exp(-(((x - 38) / sw) ** 2 + ((z + 21) / sw) ** 2));

  // Seated riverbank (all x — no lateral seam to find). Crest silhouette
  // from the seat reads at e ≈ −0.111…−0.082 across the seated frame:
  // always well below the DC waterline (the dome draws water at e < 0 and
  // every far-shore structure above it), so the bank cuts against open
  // Potomac water only — Columbia Island's own grassy bank.
  const bank =
    0.17 *
    smoothstep(MEADOW_BANK.riseStartZ, MEADOW_BANK.crestZ, z) *
    (0.75 + 0.25 * Math.sin(x * 0.55 + 1.9));

  let y = MEADOW_GROUND_BASE + und + mid + r3 + sL + sR + bank;

  // Authored skirts: both drop far faster than any sight ray over their
  // crests can descend, so the rectangle's actual ends are unreachable.
  if (z > MEADOW_BANK.skirtZ) y -= MEADOW_BANK.skirtDrop * (z - MEADOW_BANK.skirtZ);
  if (z < MEADOW_FAR_SKIRT.z) y -= MEADOW_FAR_SKIRT.drop * (MEADOW_FAR_SKIRT.z - z);
  return y;
}

// ---------------------------------------------------------------------------
// Grass distribution.
//
// Instances per unit DEPTH ∝ 1/d — the strip width already grows ≈ linearly
// with d, so per-ground-area density falls as 1/d² and SCREEN coverage stays
// constant. Inverse-CDF for that weighting: d = d0 · (d1/d0)^u.
export const GRASS_BANDS = {
  /** Quiet short lawn, z +4.4 → −8.2 (depth 1.4 → 14 from the rail). */
  near: { count: 16000, d0: TRAVERSE_EYE.z - VEGETATION_FRONT_Z, d1: 14 },
  /** The meadow moment, z −8.2 → −18.2: taller, wider blades with distance. */
  mid: { count: 3000, d0: 14, d1: 24 },
  /** Seated riverbank band, z +3.8 → skirt, depths against the SEAT eye. */
  seated: { count: 4000, d0: 3.8 - SEAT_Z, d1: MEADOW_BANK.skirtZ - SEAT_Z },
} as const;

export const MEADOW_GRASS_TOTAL =
  GRASS_BANDS.near.count + GRASS_BANDS.mid.count + GRASS_BANDS.seated.count;
export const MEADOW_FLOWER_TOTAL = 800;

// The degrade dial's order contract. Each instance gets a quality quantile;
// the buffer is ordered rung-major at these cumulative fractions,
// front-to-back within each rung (early-z). `mesh.count = MEADOW_RUNG_GRASS[r]`
// then thins ALL bands uniformly — a true density dial: no band ever
// vanishes, no depth cut-line appears. (Literal back-to-front ordering would
// make a lowered count delete the far field first and pull the horizon in.)
export const MEADOW_RUNG_FRACTIONS = [0.45, 0.7, 0.88, 1] as const;
export const MEADOW_RUNG_GRASS = [10350, 16100, 20240, 23000] as const;
/** Flowers stay OFF at the two lowest quality rungs (degrade ≥ 2). */
export const MEADOW_RUNG_FLOWERS = [0, 0, 704, 800] as const;

/** Furniture clearings: grass thins and shortens around the seven shelf
 * units and the couch — no rejection, no count churn, and nothing pokes
 * through the ground shadow pools (pool y −1.114 vs a cleared tip at
 * ≈ −1.13). Scale factor is ≥ 0.45 everywhere. */
const UNIT_COUNT = Math.round(TRAVEL_X / UNIT_SPACING) + 1;
const CLEARING_SITES: { x: number; z: number; r0: number; r1: number }[] = [];
for (let i = 0; i < UNIT_COUNT; i++) {
  const [px, , pz] = unitPose(i).position;
  CLEARING_SITES.push({ x: px, z: pz, r0: 1.6, r1: 3.0 });
}
CLEARING_SITES.push({ x: -3.5, z: -0.3, r0: 1.2, r1: 2.4 });

export function clearingScale(x: number, z: number): number {
  let clr = 1;
  for (const site of CLEARING_SITES) {
    const d = Math.hypot(x - site.x, z - site.z);
    const s = smoothstep(site.r0, site.r1, d);
    if (s < clr) clr = s;
  }
  return 0.45 + 0.55 * clr;
}

export type GrassInstances = {
  count: number;
  /** Rung-major cumulative counts — must equal MEADOW_RUNG_GRASS. */
  rungCounts: number[];
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  yaw: Float32Array;
  /** World-unit blade height (geometry is height-normalized to 1). */
  height: Float32Array;
  /** Multiplier on the blade's baked base width. */
  width: Float32Array;
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

function traverseXRange(d: number): [number, number] {
  return [
    TRAVERSE_MIN_X - LATERAL_REACH * d - 0.6,
    TRAVERSE_MAX_X + LATERAL_REACH * d + 0.6,
  ];
}

/** Seated trapezoid half-width at a z plane — slope tan(0.7423 + 0.05)
 * (21:9 at fov 42, + lean margin) ≈ 1.017. The widest checked aspect (3.0,
 * tan ≈ 1.28) out-slopes this, but the 3.2 + 0.6 base slack keeps the band
 * edge outside that frustum at every depth to the crest (14.2 vs 13.0 at
 * the skirt line) — asserted by the check script's seated poses. */
function seatedHalfWidth(z: number): number {
  return 3.2 + (z - SEAT_Z) * 1.017 + 0.6;
}

export function buildGrassInstances(
  total: number = MEADOW_GRASS_TOTAL,
): GrassInstances {
  const scale = total / MEADOW_GRASS_TOTAL;
  const bands = [
    { ...GRASS_BANDS.near, id: 0 },
    { ...GRASS_BANDS.mid, id: 1 },
    { ...GRASS_BANDS.seated, id: 2 },
  ].map((b) => ({ ...b, count: Math.round(b.count * scale) }));

  const raw: RawInstance[] = [];
  let i = 0;
  for (const band of bands) {
    for (let k = 0; k < band.count; k++, i++) {
      const u = rand(i, 41);
      const d = band.d0 * Math.pow(band.d1 / band.d0, u);
      let x: number;
      let z: number;
      if (band.id === 2) {
        z = SEAT_Z + d;
        const hw = seatedHalfWidth(z);
        x = SEAT_X - hw + rand(i, 42) * 2 * hw;
      } else {
        z = TRAVERSE_EYE.z - d;
        const [x0, x1] = traverseXRange(d);
        x = x0 + rand(i, 42) * (x1 - x0);
      }
      let height: number;
      let width: number;
      if (band.id === 1) {
        // Mid meadow: blades grow to ~0.18 tall / ~1.9× wide with distance,
        // holding screen fill as areal density drops.
        height = (0.083 + 0.1 * smoothstep(10, 22, d)) * (0.8 + 0.4 * rand(i, 44));
        width = (0.8 + 0.5 * rand(i, 45)) * (1 + 0.9 * smoothstep(10, 24, d));
      } else if (band.id === 2) {
        height = 0.083 * (0.9 + 0.5 * rand(i, 44));
        width = 0.8 + 0.5 * rand(i, 45);
      } else {
        height = 0.083 * (0.8 + 0.4 * rand(i, 44));
        width = 0.8 + 0.5 * rand(i, 45);
      }
      const f = clearingScale(x, z);
      raw.push({
        x,
        z,
        yaw: rand(i, 43) * Math.PI * 2,
        height: height * f,
        width: width * f,
        q: rand(i, 97),
        band: band.id,
      });
    }
  }

  // Rung stratification: within each band, order by quality quantile and cut
  // at the exact cumulative fractions — every band thins by the same ratio
  // at every rung. Buffer order is rung-major, front-to-back (ascending
  // 5.8 − z) within each rung for early-z.
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

  const ordered: RawInstance[] = [];
  const rungCounts: number[] = [];
  MEADOW_RUNG_FRACTIONS.forEach((_, ri) => {
    const rung: RawInstance[] = [];
    for (const bandRungs of perBandRungs) rung.push(...bandRungs[ri]!);
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
  };
  ordered.forEach((r, k) => {
    out.x[k] = r.x;
    out.y[k] = meadowHeight(r.x, r.z) - GRASS_ROOT_SINK;
    out.z[k] = r.z;
    out.yaw[k] = r.yaw;
    out.height[k] = r.height;
    out.width[k] = r.width;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Flowers — placed in connected drifts (~10 units apart) via a low-frequency
// value-noise mask, mid-field weighted along the traverse plus a handful on
// the bank crest so a few heads break the water silhouette from the seat.
export type FlowerInstances = {
  count: number;
  rungCounts: number[];
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  scale: Float32Array;
};

const DRIFT_SALT = 83;
export function driftMask(x: number, z: number): boolean {
  return vnoise2(x * 0.09, z * 0.09, DRIFT_SALT) > 0.62;
}

type RawFlower = { x: number; z: number; scale: number; q: number };

export function buildFlowerPositions(
  total: number = MEADOW_FLOWER_TOTAL,
): FlowerInstances {
  const traverseCount = Math.round(total * (620 / MEADOW_FLOWER_TOTAL));
  const bankCount = total - traverseCount;
  const groups: RawFlower[][] = [[], []];

  for (let i = 0; i < traverseCount; i++) {
    // Depth weighting ∝ exp(−((d − 15)/6)²) on [6, 24]: the drifts dominate
    // the mid field and stay sparse in the near lawn. Deterministic salted
    // tries stand in for rejection sampling; a miss keeps its last candidate
    // (an isolated head, not a hole).
    let x = 0;
    let z = 0;
    for (let t = 0; t < 6; t++) {
      const d = 6 + rand(i, 61 + t * 7) * 18;
      if (rand(i, 62 + t * 7) > gauss(d, 15, 6)) continue;
      z = TRAVERSE_EYE.z - d;
      const [x0, x1] = traverseXRange(d);
      x = x0 + rand(i, 63 + t * 7) * (x1 - x0);
      if (driftMask(x, z)) break;
    }
    if (x === 0 && z === 0) {
      const d = 15;
      z = TRAVERSE_EYE.z - d;
      const [x0, x1] = traverseXRange(d);
      x = x0 + rand(i, 64) * (x1 - x0);
    }
    groups[0]!.push({ x, z, scale: 0.8 + rand(i, 66) * 0.5, q: rand(i, 98) });
  }

  for (let i = 0; i < bankCount; i++) {
    const j = traverseCount + i;
    // Bias toward the crest (pow < 1 pushes z toward the skirt line) so the
    // heads sit on the silhouette against the water.
    let x = 0;
    let z = 0;
    for (let t = 0; t < 6; t++) {
      z =
        MEADOW_BANK.riseStartZ +
        Math.pow(rand(j, 61 + t * 7), 0.5) *
          (MEADOW_BANK.skirtZ - MEADOW_BANK.riseStartZ);
      const hw = seatedHalfWidth(z);
      x = SEAT_X - hw + rand(j, 63 + t * 7) * 2 * hw;
      if (driftMask(x, z)) break;
    }
    groups[1]!.push({ x, z, scale: 0.8 + rand(j, 66) * 0.5, q: rand(j, 98) });
  }

  // Same stratified-order contract as the grass, with the flower rung table's
  // own fractions (0 / 0 / 0.88 / 1 of the buffer): both groups thin by the
  // same ratio, front-to-back within each stratum.
  const fractions = MEADOW_RUNG_FLOWERS.map((c) => c / MEADOW_FLOWER_TOTAL);
  const perGroupRungs: RawFlower[][][] = groups.map(() => fractions.map(() => []));
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
  };
  ordered.forEach((f, k) => {
    out.x[k] = f.x;
    out.y[k] = meadowHeight(f.x, f.z) + FLOWER_LIFT;
    out.z[k] = f.z;
    out.scale[k] = f.scale;
  });
  return out;
}
