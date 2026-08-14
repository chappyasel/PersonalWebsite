// Meadow field math — terrain heights, instance sampling, and the rung-order
// contract for the homepage meadow. Single source of truth shared by
// Meadow.tsx (whose GLSL interpolates the constants below), the headless
// check script, and vitest — so the shader and its verifiers cannot drift.
// No three.js imports, worldLayout.ts pattern: DOM-side scripts and node can
// evaluate everything here without WebGL.
import { rand } from "../theme";

import { SEAT_POSE } from "./seated";
import { TRAVEL_LEAD_IN, TRAVEL_X } from "./worldLayout";

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
/** Flower heads sit half-buried IN the grass, not floating over it. */
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
  riseStartZ: 6.5,
  crestZ: 8.2,
  skirtZ: 8.6,
  /** Bank rise amplitude, world units above the base plain. */
  amp: 0.08,
  /** Skirt drop per unit z. The steepest seated sight ray over the crest
   * falls ≈ 0.156/unit at the new, closer crest; 0.9 ≫ that, so the terrain
   * end is never visible (also holds for the walk-phase eye at y ≤ 0.9,
   * ray slope ≈ 0.30). */
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
   * edge and cut against the sky. */
  endMinX: -28,
  endMaxX: 46,
  /** Below-horizon tail height. From the lowest eye it reads at e ≈ −0.016:
   * under the horizon, over the deep-gap floor, and painted in the exact
   * dome-shadow color it sits against (invisible by construction). */
  tailY: -0.3,
} as const;

/** Authored world-y crest line of the horizon ridge, rolling in x. The held
 * band [0.37, 0.55] is derived from the eye envelope: from the HIGHEST bobbed
 * eye (phone, y 0.41, d 29.1) the lowest crest still sits at e ≥ −0.0013 (no
 * sky gap opens behind the shelves), and from the LOWEST bobbed eye (desktop,
 * y 0.14, d 27.3) the tallest crest stays under the e ≈ +0.016 cap — at or a
 * little above the horizon, never a wall. The check script measures the real
 * silhouettes; vitest pins this function's range and taper. */
export function horizonCrestY(x: number): number {
  const roll =
    0.46 +
    0.06 * Math.sin(x * 0.22 + 1.7) +
    0.028 * (vnoise1(x * 0.12, 3.7) - 0.5) * 2;
  const hold =
    smoothstep(HORIZON_RIDGE.endMinX, HORIZON_RIDGE.holdMinX, x) *
    (1 - smoothstep(HORIZON_RIDGE.holdMaxX, HORIZON_RIDGE.endMaxX, x));
  return HORIZON_RIDGE.tailY + (roll - HORIZON_RIDGE.tailY) * hold;
}

export function meadowHeight(x: number, z: number): number {
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
    (0.55 + 0.45 * Math.sin(x * 0.66 + 1.3) + 0.18 * (vnoise1(x * 0.21, 7.3) - 0.5));

  // R2 mid-far ridgeline (z −15.5): second layer (~90% fog), x-phase offset
  // from R1 so their crests interleave in screen space — the
  // rolling-with-haze-separation layering.
  const r2 = 0.55 * gauss(z, -15.5, 4.0) * (0.55 + 0.45 * Math.sin(x * 0.43 - 0.7));

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
// Instances are TUFTS (the FluffyGrass 8-card cluster, MIT, vendored as
// grass-tuft.glb), not single blades: each covers ~2.5× its height in
// footprint, so a few thousand overlapping tufts give the reference's
// full-pile coverage where tens of thousands of blades read as debris.
export const GRASS_BANDS = {
  /** Quiet short lawn, z +4.6 → −8.2 (depth 1.2 → 14 from the rail). */
  near: { count: 6000, d0: TRAVERSE_EYE.z - VEGETATION_FRONT_Z, d1: 14 },
  /** The meadow moment, z −8.2 → −18.2: taller, wider tufts with distance. */
  mid: { count: 2500, d0: 14, d1: 24 },
  /** Seated band, z +1.6 → skirt, depths against the SEAT eye. Starts well
   * behind the rail so the walk phase of the seat transition (which can
   * face the couch's surround from close range) sees lawn, not a boundary;
   * the sampler pins 70% of the count onto the bank itself. */
  seated: { count: 2500, d0: 1.6 - SEAT_Z, d1: MEADOW_BANK.skirtZ - SEAT_Z },
} as const;

export const MEADOW_GRASS_TOTAL =
  GRASS_BANDS.near.count + GRASS_BANDS.mid.count + GRASS_BANDS.seated.count;
export const MEADOW_FLOWER_TOTAL = 1600;

// The degrade dial's order contract. Each instance gets a quality quantile;
// the buffer is ordered rung-major at these cumulative fractions,
// front-to-back within each rung (early-z). `mesh.count = MEADOW_RUNG_GRASS[r]`
// then thins ALL bands uniformly — a true density dial: no band ever
// vanishes, no depth cut-line appears. (Literal back-to-front ordering would
// make a lowered count delete the far field first and pull the horizon in.)
export const MEADOW_RUNG_FRACTIONS = [0.45, 0.7, 0.88, 1] as const;
/** The near lawn draws the detailed tuft LOD in its own InstancedMesh; the
 * mid + seated bands share the light LOD in a second one. Each mesh has its
 * own rung-ordered buffer and count table; the combined table is the
 * reporting total. */
export const MEADOW_RUNG_GRASS_NEAR = [2700, 4200, 5280, 6000] as const;
export const MEADOW_RUNG_GRASS_FAR = [2250, 3500, 4400, 5000] as const;
export const MEADOW_RUNG_GRASS = [4950, 7700, 9680, 11000] as const;
/** Flowers stay OFF at the two lowest quality rungs (degrade ≥ 2). */
export const MEADOW_RUNG_FLOWERS = [0, 0, 1408, 1600] as const;

// There are deliberately NO furniture clearings. The first round shipped
// grass that thinned and shortened around the shelf units and the couch, and
// the owner's browse called it out — the FluffyGrass reference sits its
// furniture IN the grass. Uniform density right up to the shelf posts is the
// look; the tallest near tuft tips out around y −0.97, below the shelf
// planks, so nothing clips.

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

/** Far density feather: the vegetation far line (z −18.2) reads at only
 * ~85–90% fog from the walk path (a few units west and south of the rail),
 * so the last few units of the mid band thin out by scale — the same
 * no-line-to-find treatment as the west flank. */
export const FAR_FEATHER = { span: 3.5 } as const;
const VEGETATION_FAR_Z = TRAVERSE_EYE.z - 24; // mid band d1

export function farFeatherScale(z: number): number {
  return 1 - 0.88 * smoothstep(VEGETATION_FAR_Z + FAR_FEATHER.span, VEGETATION_FAR_Z, z);
}

export function inFarFeather(z: number): boolean {
  return z <= VEGETATION_FAR_Z + FAR_FEATHER.span + 0.1;
}

/** Western boundary of the vegetation union at a z plane (−Infinity where
 * no band covers z). */
export function unionWestX(z: number): number {
  let west = Infinity;
  if (z <= VEGETATION_FRONT_Z && z >= TRAVERSE_EYE.z - GRASS_BANDS.mid.d1) {
    west = Math.min(west, TRAVERSE_MIN_X - LATERAL_REACH * (TRAVERSE_EYE.z - z) - 0.6);
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
  // Central-difference terrain normal → half-Lambert against the key.
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
  /** Mid meadow + seated bank — light tuft LOD, second InstancedMesh. */
  far: GrassInstances;
};

export function buildGrassInstances(
  total: number = MEADOW_GRASS_TOTAL,
): GrassStreams {
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
      let d: number;
      if (band.id === 2) {
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
        // Mid meadow: tufts grow to ~0.45 tall / ~2.5-unit footprints with
        // distance, holding screen fill as areal density drops.
        height = (0.16 + 0.3 * smoothstep(10, 22, d)) * (0.8 + 0.4 * rand(i, 44));
        width = (0.32 + 0.16 * rand(i, 45)) * (1 + 1.2 * smoothstep(10, 24, d));
      } else if (band.id === 2) {
        height = 0.16 * (0.9 + 0.5 * rand(i, 44));
        width = 0.32 + 0.16 * rand(i, 45);
      } else {
        height = 0.16 * (0.8 + 0.4 * rand(i, 44));
        width = 0.32 + 0.16 * rand(i, 45);
      }
      const f =
        westFeatherScale(x, z) * eastFeatherScale(x, z) * farFeatherScale(z);
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
    };
    ordered.forEach((r, k) => {
      out.x[k] = r.x;
      out.y[k] = meadowHeight(r.x, r.z) - GRASS_ROOT_SINK;
      out.z[k] = r.z;
      out.yaw[k] = r.yaw;
      out.height[k] = r.height;
      out.width[k] = r.width;
      out.sun[k] = bakedSun(r.x, r.z);
    });
    return out;
  };

  return { near: assemble([0]), far: assemble([1, 2]) };
}

// ---------------------------------------------------------------------------
// Flowers — CLUMPED (owner round 2): the drift-masked candidate logic that
// used to place every head now places ~1/5 of them as CLUSTER SEEDS, and
// each seed spawns 4–6 heads at deterministic gaussian offsets — cornflower
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
  /** Per-head species tint in [0,1), shared across a clump — the shader's
   * vTint thresholds (0.55 / 0.75) turn it into the A/B/C color split. */
  tint: Float32Array;
};

const DRIFT_SALT = 83;
export function driftMask(x: number, z: number): boolean {
  return vnoise2(x * 0.09, z * 0.09, DRIFT_SALT) > 0.66;
}

export const FLOWER_CLUSTER = {
  headsMin: 4,
  headsMax: 6,
  /** Gaussian offset σ in world units. */
  sigma: 0.35,
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

type RawFlower = { x: number; z: number; scale: number; q: number; tint: number };

export function buildFlowerPositions(
  total: number = MEADOW_FLOWER_TOTAL,
): FlowerInstances {
  const traverseCount = Math.round(total * (1240 / MEADOW_FLOWER_TOTAL));
  const bankCount = total - traverseCount;
  const groups: RawFlower[][] = [[], []];

  for (let s = 0; groups[0]!.length < traverseCount; s++) {
    // Seed placement — depth weighting ∝ exp(−((d − 16)/5)²) on [8, 24]: the
    // drifts dominate the mid field and stay sparse in the near lawn (near
    // heads read huge at the rail). Deterministic salted tries stand in for
    // rejection sampling; a miss keeps its last candidate (an isolated clump).
    let x = 0;
    let z = 0;
    for (let t = 0; t < 6; t++) {
      const d = 8 + rand(s, 61 + t * 7) * 16;
      if (rand(s, 62 + t * 7) > gauss(d, 16, 5)) continue;
      z = TRAVERSE_EYE.z - d;
      const [x0, x1] = traverseXRange(d);
      x = x0 + rand(s, 63 + t * 7) * (x1 - x0);
      if (driftMask(x, z)) break;
    }
    if (x === 0 && z === 0) {
      const d = 15;
      z = TRAVERSE_EYE.z - d;
      const [x0, x1] = traverseXRange(d);
      x = x0 + rand(s, 64) * (x1 - x0);
    }
    const tint = rand(s, 69);
    const heads =
      FLOWER_CLUSTER.headsMin +
      Math.floor(
        rand(s, 68) * (FLOWER_CLUSTER.headsMax - FLOWER_CLUSTER.headsMin + 1),
      );
    for (let h = 0; h < heads && groups[0]!.length < traverseCount; h++) {
      const i = groups[0]!.length;
      // Clamp the head back into its own depth's trapezoid so a clump seeded
      // near a band boundary cannot leak a head past the proven extents.
      const d = clamp(TRAVERSE_EYE.z - (z + clusterOffset(i, 76)), 8, 24);
      const hz = TRAVERSE_EYE.z - d;
      const [x0, x1] = traverseXRange(d);
      const hx = clamp(x + clusterOffset(i, 71), x0, x1);
      groups[0]!.push({
        x: hx,
        z: hz,
        scale:
          (0.7 + rand(i, 66) * 0.5) *
          westFeatherScale(hx, hz) *
          farFeatherScale(hz),
        q: rand(i, 98),
        tint,
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
    const tint = rand(sj, 69);
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
        scale: (0.9 + rand(j, 66) * 0.7) * westFeatherScale(hx, hz),
        q: rand(j, 98),
        tint,
      });
    }
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
    tint: new Float32Array(ordered.length),
  };
  ordered.forEach((f, k) => {
    out.x[k] = f.x;
    out.y[k] = meadowHeight(f.x, f.z) + FLOWER_LIFT;
    out.z[k] = f.z;
    out.scale[k] = f.scale;
    out.tint[k] = f.tint;
  });
  return out;
}
