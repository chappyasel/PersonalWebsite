// Headless meadow frustum + fog verifier — proves, with no GPU and no
// browser, that the meadow's edges, silhouettes, and landmark clearances
// hold for every supported camera. Run: `yarn check:meadow` (exit 1 on any
// violation).
//
// WHY THIS EXISTS. The previous meadow shipped with a discoverable back
// edge, side edges in ultrawide frames, and a seated view that stared at
// the terrain's cut line at z=8 with zero fog to hide it. All of those are
// pure geometry — a function of authored extents and camera poses — so they
// are provable here, before a browser ever renders a frame, and they cannot
// silently regress when either side of the contract moves.
//
// WHAT IT CHECKS, per pose (traverse offsets × eye bob × aspects 0.462…3.0,
// plus the seated pose at every aspect):
//   (a)  No terrain or vegetation boundary edge inside any frustum at less
//        than 99% of its fog ramp, unless terrain occludes it.
//   (a2) The vegetation front line starts inside the exported near-feather
//        zone — below every frame bottom — with a self-test proving the
//        check still catches the old z=3.25 front line.
//   (b)  The far-field terrain silhouette lands inside the skyline fade
//        band (e ∈ [−0.10, −0.02]) at every azimuth column…
//   (c)  …except above-horizon rises, which must come from the two authored
//        swell footprints, stay under the global elevation cap, and keep
//        clear of every drawn landmark's azimuth×elevation window. The
//        windows are extracted from SceneEnvironment.tsx's own source text
//        (anchored regexes, loud failure on a miss) so a skyline retune
//        re-arms this check instead of stranding it.
//   (d)  The seated bank silhouette is continuous, never flat for ≥0.15 rad
//        (the end-of-rectangle signature), and is the authored crest — not
//        a fogged or cut terrain end.
//
// The hills and the ember are deliberately NOT hard windows: they are soft
// haze masses whose lowest band is already 60–85% converged on sky, and the
// swells rising in front of them read as depth layering (near hill before
// far ridge). Their protection is the global cap in (c): no swell may reach
// Sutro's lowest drawn pixel (e 0.010), the one structure inside their span.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  GRASS_BANDS,
  LATERAL_REACH,
  MEADOW_BANK,
  MEADOW_FOG,
  MEADOW_TERRAIN,
  NEAR_FEATHER_ZONE,
  VEGETATION_FRONT_Z,
  meadowHeight,
} from "../src/app/components/stacks/scene/meadowField";
import { SEAT_POSE } from "../src/app/components/stacks/scene/seated";
import {
  TRAVEL_X,
  cameraForAspect,
  cameraXForScrollOffset,
} from "../src/app/components/stacks/scene/worldLayout";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKY_SOURCE = readFileSync(
  join(ROOT, "src/app/components/stacks/scene/SceneEnvironment.tsx"),
  "utf8",
);

// ---------------------------------------------------------------------------
// Landmark windows, read out of the sky shader's own constants. A regex that
// stops matching is a FAILURE, not a skip — the check must die loudly the
// day the skyline is retuned, exactly like the floaters walker.
function extract(name: string, re: RegExp): number {
  const m = SKY_SOURCE.match(re);
  if (!m?.[1]) {
    throw new Error(
      `stacks-meadow-check: anchor regex for ${name} no longer matches ` +
        `SceneEnvironment.tsx (${re}). Re-derive the landmark window before ` +
        `trusting this check.`,
    );
  }
  return Number(m[1]);
}

const PAN_SPAN = extract("PAN_SPAN", /const PAN_SPAN = ([\d.]+);/);
const PAN_BIAS = extract("PAN_BIAS", /const PAN_BIAS = ([\d.]+);/);
const GGB_AZ = extract("GGB_AZ", /const GGB_AZ = (-[\d.]+);/);
const GGB_GX = extract("GGB_GX", /const GGB_GX = ([\d.]+);/);
const GGB_SPAN = extract("GGB span", /if \(abs\(gx\) < ([\d.]+) &&/);
const GGB_DECK_E = extract("GGB deck", /float deckY = ([\d.]+) \+/);
const SUTRO_AZ = -extract("Sutro az", /float dSut = a \+ ([\d.]+);/);
const SUTRO_HALF = extract("Sutro half", /if \(abs\(dSut\) < ([\d.]+) &&/);
const SUTRO_HILL_E = extract("Sutro hill", /float eh = e - ([\d.]+);/);
const SUTRO_BOTTOM_EH = extract("Sutro bottom", /&& eh > (-[\d.]+)\)/);
const COIT_AZ = -extract("Coit az", /float dCoit = a \+ ([\d.]+);/);
const COIT_HALF = extract("Coit half", /if \(abs\(dCoit\) < ([\d.]+) &&/);
const COIT_BOTTOM = extract("Coit bottom", /step\(([\d.]+), e\) \* step\(e, 0\.040\)/);
const TRANS_AZ = -extract("Trans az", /float dTr = a \+ ([\d.]+);/);
const TRANS_HALF = extract("Trans half", /if \(abs\(dTr\) < ([\d.]+) &&/);
const SALES_AZ = -extract("Sales az", /float dSf = a \+ ([\d.]+);/);
const SALES_HALF = extract("Sales half", /if \(abs\(dSf\) < ([\d.]+) &&/);
const BAY_AZ = -extract("Bay az", /float bx = \(a \+ ([\d.]+)\) \/ [\d.]+;/);
const BAY_GX = extract("Bay gx", /float bx = \(a \+ [\d.]+\) \/ ([\d.]+);/);
const BAY_SPAN = extract("Bay span", /if \(abs\(bx\) < ([\d.]+) &&/);
const CARPET_AZ = -extract("carpet az", /abs\(a \+ ([\d.]+)\)\);/);
const CARPET_HALF = extract("carpet half", /smoothstep\(([\d.]+), 0\.10,/);

const SUTRO_BOTTOM = SUTRO_HILL_E + SUTRO_BOTTOM_EH; // 0.030 − 0.02 = 0.010

type Window = {
  name: string;
  az: number;
  half: number;
  /** Lowest drawn elevation — a silhouette may share the azimuth window as
   * long as it stays below this (with margin); 0 means hard-forbidden. */
  bottom: number;
};
const WINDOWS: Window[] = [
  { name: "goldengate", az: GGB_AZ, half: GGB_SPAN * GGB_GX, bottom: GGB_DECK_E },
  { name: "sutro", az: SUTRO_AZ, half: SUTRO_HALF, bottom: SUTRO_BOTTOM },
  { name: "coit", az: COIT_AZ, half: COIT_HALF, bottom: COIT_BOTTOM },
  { name: "transamerica", az: TRANS_AZ, half: TRANS_HALF, bottom: 0 },
  { name: "salesforce", az: SALES_AZ, half: SALES_HALF, bottom: 0 },
  { name: "baybridge", az: BAY_AZ, half: BAY_SPAN * BAY_GX, bottom: 0.002 },
  { name: "carpet", az: CARPET_AZ, half: CARPET_HALF, bottom: 0 },
];

// ---------------------------------------------------------------------------
// Poses.
const H_MARGIN = 0.06; // camera lean / yaw parallax
const V_MARGIN = 0.0183; // pointer + idle pitch swing
const OFFSETS = [0, 0.25, 0.5, 0.75, 1];
const ASPECTS = [0.462, 0.75, 1.0, 1.33, 1.78, 2.39, 3.0];
const Y_BOB = [-0.11, 0, 0.11];
/** Global cap for any above-horizon terrain: below Sutro's lowest pixel. */
const SWELL_E_CAP = 0.0095;
const SWELL_FOOTPRINTS = [
  { x: -13, z: -22 },
  { x: 38, z: -21 },
];

function fog99(ramp: readonly [number, number]): number {
  // Invert smoothstep(a, b, d) = 0.99 for d.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (mid * mid * (3 - 2 * mid) < 0.99) lo = mid;
    else hi = mid;
  }
  return ramp[0] + ((lo + hi) / 2) * (ramp[1] - ramp[0]);
}
const TERRAIN_FOG99 = fog99(MEADOW_FOG.terrain);
const GRASS_FOG99 = fog99(MEADOW_FOG.grass);

type Vec3 = [number, number, number];
type Pose = {
  name: string;
  eye: Vec3;
  forward: Vec3;
  hHalf: number;
  vHalf: number;
  pan: number;
  seat: boolean;
};

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

const poses: Pose[] = [];
for (const offset of OFFSETS) {
  for (const aspect of ASPECTS) {
    const cam = cameraForAspect(aspect);
    const vHalf = ((cam.fov / 2) * Math.PI) / 180;
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const eyeX = cameraXForScrollOffset(offset);
    const progress = Math.min(1, Math.max(0, eyeX / TRAVEL_X));
    for (const bob of Y_BOB) {
      const y = cam.y + bob;
      poses.push({
        name: `traverse o${offset} a${aspect} y${y.toFixed(2)}`,
        eye: [eyeX, y, cam.z],
        // CameraRig's look target: (x, −0.08, −0.2).
        forward: norm([0, -0.08 - y, -0.2 - cam.z]),
        hHalf,
        vHalf,
        pan: progress * PAN_SPAN - PAN_BIAS,
        seat: false,
      });
    }
  }
}
const SEAT_FOV = 42;
for (const aspect of ASPECTS) {
  const vHalf = ((SEAT_FOV / 2) * Math.PI) / 180;
  poses.push({
    name: `seated a${aspect}`,
    eye: [...SEAT_POSE.eye] as Vec3,
    forward: norm([
      SEAT_POSE.target[0] - SEAT_POSE.eye[0],
      SEAT_POSE.target[1] - SEAT_POSE.eye[1],
      SEAT_POSE.target[2] - SEAT_POSE.eye[2],
    ]),
    hHalf: Math.atan(Math.tan(vHalf) * aspect),
    vHalf,
    pan: -PAN_BIAS, // progress 0 at the About stop
    seat: true,
  });
}

// ---------------------------------------------------------------------------
// Camera math.
function basis(pose: Pose): { f: Vec3; r: Vec3; u: Vec3 } {
  const f = pose.forward;
  const r = norm([f[2], 0, -f[0]]); // cross(f, +y), horizontal right
  const u: Vec3 = [
    r[1] * f[2] - r[2] * f[1],
    r[2] * f[0] - r[0] * f[2],
    r[0] * f[1] - r[1] * f[0],
  ];
  return { f, r, u };
}

/** View-axis depth (the shader's −mv.z) and in-frustum test with margins. */
function project(pose: Pose, p: Vec3): { df: number; inFrustum: boolean } {
  const { f, r, u } = basis(pose);
  const v: Vec3 = [p[0] - pose.eye[0], p[1] - pose.eye[1], p[2] - pose.eye[2]];
  const df = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
  if (df <= 0.01) return { df, inFrustum: false };
  const dr = v[0] * r[0] + v[1] * r[1] + v[2] * r[2];
  const du = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
  return {
    df,
    inFrustum:
      Math.abs(Math.atan(dr / df)) <= pose.hHalf + H_MARGIN &&
      Math.abs(Math.atan(du / df)) <= pose.vHalf + V_MARGIN,
  };
}

/** True if the terrain rises above the eye→p sight line anywhere en route. */
function occluded(pose: Pose, p: Vec3): boolean {
  const dx = p[0] - pose.eye[0];
  const dy = p[1] - pose.eye[1];
  const dz = p[2] - pose.eye[2];
  const dist = Math.hypot(dx, dz);
  const steps = Math.ceil(dist / 0.2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = pose.eye[0] + dx * t;
    const z = pose.eye[2] + dz * t;
    if (
      x < MEADOW_TERRAIN.minX ||
      x > MEADOW_TERRAIN.maxX ||
      z < MEADOW_TERRAIN.minZ ||
      z > MEADOW_TERRAIN.maxZ
    )
      continue;
    if (meadowHeight(x, z) > pose.eye[1] + dy * t + 0.005) return true;
  }
  return false;
}

const failures: string[] = [];
let checks = 0;
function assertOk(ok: boolean, message: string) {
  checks++;
  if (!ok) failures.push(message);
}

// ---------------------------------------------------------------------------
// (a) Boundary edges: terrain perimeter + vegetation band boundaries.
type EdgeSample = { p: Vec3; kind: "terrain" | "grass" };
const edgeSamples: EdgeSample[] = [];
for (let x = MEADOW_TERRAIN.minX; x <= MEADOW_TERRAIN.maxX; x += 0.5) {
  for (const z of [MEADOW_TERRAIN.minZ, MEADOW_TERRAIN.maxZ]) {
    edgeSamples.push({ p: [x, meadowHeight(x, z), z], kind: "terrain" });
  }
}
for (let z = MEADOW_TERRAIN.minZ; z <= MEADOW_TERRAIN.maxZ; z += 0.5) {
  for (const x of [MEADOW_TERRAIN.minX, MEADOW_TERRAIN.maxX]) {
    edgeSamples.push({ p: [x, meadowHeight(x, z), z], kind: "terrain" });
  }
}
// Vegetation boundaries (roots). The grass region is the UNION of the
// traverse trapezoid and the seated trapezoid — a band's own edge that lies
// INSIDE the other band is interior grass, not a boundary (the traverse
// side edge passes right through the seated band in front of the couch).
const NEAR_EYE_Z = 5.8;
const seatedHw = (z: number) => 3.2 + (z - SEAT_POSE.eye[2]) * 1.017 + 0.6;
function inTraverseBand(x: number, z: number): boolean {
  if (z > VEGETATION_FRONT_Z || z < NEAR_EYE_Z - GRASS_BANDS.mid.d1) return false;
  const d = NEAR_EYE_Z - z;
  return (
    x > -1.2 - LATERAL_REACH * d - 0.6 + 0.05 &&
    x < TRAVEL_X + LATERAL_REACH * d + 0.6 - 0.05
  );
}
function inSeatedBand(x: number, z: number): boolean {
  if (z < 3.8 || z > MEADOW_BANK.skirtZ) return false;
  return Math.abs(x - SEAT_POSE.eye[0]) < seatedHw(z) - 0.05;
}
for (let d = GRASS_BANDS.near.d0; d <= GRASS_BANDS.mid.d1; d += 0.2) {
  const z = NEAR_EYE_Z - d;
  for (const side of [-1, 1]) {
    const x =
      side < 0
        ? -1.2 - LATERAL_REACH * d - 0.6
        : TRAVEL_X + LATERAL_REACH * d + 0.6;
    if (inSeatedBand(x, z)) continue;
    edgeSamples.push({ p: [x, meadowHeight(x, z), z], kind: "grass" });
  }
}
{
  const zFar = NEAR_EYE_Z - GRASS_BANDS.mid.d1;
  const half = LATERAL_REACH * GRASS_BANDS.mid.d1 + 0.6;
  for (let x = -1.2 - half; x <= TRAVEL_X + half; x += 0.5) {
    edgeSamples.push({ p: [x, meadowHeight(x, zFar), zFar], kind: "grass" });
  }
}
// Seated band front + side edges (the rear edge is the authored crest,
// checked in d).
for (let z = 3.8; z <= MEADOW_BANK.skirtZ; z += 0.2) {
  for (const side of [-1, 1]) {
    const x = SEAT_POSE.eye[0] + side * seatedHw(z);
    if (inTraverseBand(x, z)) continue;
    edgeSamples.push({ p: [x, meadowHeight(x, z), z], kind: "grass" });
  }
}
{
  const hw = seatedHw(3.8);
  for (let x = SEAT_POSE.eye[0] - hw; x <= SEAT_POSE.eye[0] + hw; x += 0.5) {
    if (inTraverseBand(x, 3.8)) continue;
    edgeSamples.push({ p: [x, meadowHeight(x, 3.8), 3.8], kind: "grass" });
  }
}

for (const pose of poses) {
  for (const s of edgeSamples) {
    const { df, inFrustum } = project(pose, s.p);
    if (!inFrustum) continue;
    const bar = s.kind === "terrain" ? TERRAIN_FOG99 : GRASS_FOG99;
    if (df >= bar) continue;
    assertOk(
      occluded(pose, s.p),
      `(a) ${s.kind} edge visible at <99% fog: (${s.p[0].toFixed(1)}, ` +
        `${s.p[2].toFixed(1)}) depth ${df.toFixed(1)} < ${bar.toFixed(1)} [${pose.name}]`,
    );
  }
}

// (a2) Vegetation front line: every root on it sits inside the feather zone,
// which itself sits below every frame bottom.
assertOk(
  VEGETATION_FRONT_Z <= NEAR_FEATHER_ZONE.maxZ &&
    VEGETATION_FRONT_Z >= NEAR_FEATHER_ZONE.minZ,
  "(a2) vegetation front line left the near-feather zone",
);
let frontLineSeen = false;
for (const pose of poses.filter((p) => !p.seat)) {
  for (let dx = -8; dx <= 8; dx += 0.5) {
    const x = pose.eye[0] + dx;
    const front: Vec3 = [x, meadowHeight(x, VEGETATION_FRONT_Z), VEGETATION_FRONT_Z];
    assertOk(
      !project(pose, front).inFrustum,
      `(a2) vegetation front root in frame at x ${x.toFixed(1)} [${pose.name}]`,
    );
    // Self-test: the OLD front line (z 3.25) must be caught by this very
    // test on portrait profiles — otherwise the check has gone blind.
    const old: Vec3 = [x, meadowHeight(x, 3.25), 3.25];
    if (project(pose, old).inFrustum) frontLineSeen = true;
  }
}
assertOk(
  frontLineSeen,
  "(a2 self-test) the old z=3.25 front line is no longer detectable — the frame-bottom math has drifted",
);

// ---------------------------------------------------------------------------
// (b) + (c): terrain silhouette per azimuth column, traverse poses.
const AZ_STEP = 0.00873; // 0.5°
type Silhouette = { e: number; x: number; z: number; s: number };

function silhouetteAt(pose: Pose, phi: number): Silhouette | null {
  const a0 = Math.atan2(pose.forward[2], pose.forward[0]);
  const dirX = Math.cos(a0 + phi);
  const dirZ = Math.sin(a0 + phi);
  let best: Silhouette | null = null;
  const maxS = 52 / Math.max(Math.cos(phi), 0.5);
  for (let s = 0.4; s <= maxS; s += 0.25) {
    const x = pose.eye[0] + dirX * s;
    const z = pose.eye[2] + dirZ * s;
    if (
      x < MEADOW_TERRAIN.minX ||
      x > MEADOW_TERRAIN.maxX ||
      z < MEADOW_TERRAIN.minZ ||
      z > MEADOW_TERRAIN.maxZ
    )
      continue;
    const e = Math.atan((meadowHeight(x, z) - pose.eye[1]) / s);
    if (!best || e > best.e) best = { e, x, z, s };
  }
  return best;
}

let fadeBandColumns = 0;
let swellColumns = 0;
for (const pose of poses.filter((p) => !p.seat)) {
  const span = pose.hHalf + H_MARGIN;
  for (let phi = -span; phi <= span; phi += AZ_STEP) {
    const sil = silhouetteAt(pose, phi);
    if (!sil) continue;
    if (sil.e <= -0.02) {
      fadeBandColumns++;
      assertOk(
        sil.e >= -0.101,
        `(b) silhouette below the fade band: e ${sil.e.toFixed(4)} at ` +
          `(${sil.x.toFixed(1)}, ${sil.z.toFixed(1)}) [${pose.name}]`,
      );
      continue;
    }
    // Above the fade band: only the authored swells may do this.
    swellColumns++;
    const inSwell = SWELL_FOOTPRINTS.some(
      (c) => Math.hypot(sil.x - c.x, sil.z - c.z) < 9,
    );
    assertOk(
      inSwell,
      `(c) above-band silhouette outside the swell footprints at ` +
        `(${sil.x.toFixed(1)}, ${sil.z.toFixed(1)}) e ${sil.e.toFixed(4)} [${pose.name}]`,
    );
    assertOk(
      sil.e <= SWELL_E_CAP,
      `(c) swell over the global cap: e ${sil.e.toFixed(4)} [${pose.name}]`,
    );
    const domeAz =
      Math.atan2(sil.z - pose.eye[2], sil.x - pose.eye[0]) + pose.pan;
    for (const w of WINDOWS) {
      const inWindow = Math.abs(domeAz - w.az) <= w.half + 0.015;
      if (!inWindow) continue;
      assertOk(
        w.bottom > 0 && sil.e < w.bottom - 0.001,
        `(c) swell inside the ${w.name} window (dome az ${domeAz.toFixed(3)}, ` +
          `e ${sil.e.toFixed(4)} vs bottom ${w.bottom}) [${pose.name}]`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// (d) Seated bank silhouette: continuous authored crest, no rectangle end.
for (const pose of poses.filter((p) => p.seat)) {
  const span = pose.hHalf + 0.05;
  const line: Silhouette[] = [];
  for (let phi = -span; phi <= span; phi += AZ_STEP) {
    const sil = silhouetteAt(pose, phi);
    assertOk(!!sil, `(d) seated column with no terrain at phi ${phi.toFixed(3)} [${pose.name}]`);
    if (sil) line.push(sil);
  }
  let flatRun = 0;
  for (let i = 0; i < line.length; i++) {
    const sil = line[i]!;
    // The silhouette must be the authored crest — near (unfogged; the
    // crest line sits ≤ 16.6 out even at the widest fan angle, well under
    // the 21.2 where grass fog saturates) and at the bank, never the far
    // skirt or a fogged terrain end.
    assertOk(
      sil.z <= MEADOW_BANK.skirtZ + 0.3 && sil.s < 18,
      `(d) seated silhouette is not the bank crest: (${sil.x.toFixed(1)}, ` +
        `${sil.z.toFixed(1)}) at ${sil.s.toFixed(1)} out [${pose.name}]`,
    );
    if (i === 0) continue;
    const de = Math.abs(sil.e - line[i - 1]!.e);
    assertOk(
      de < 0.01,
      `(d) seated silhouette jump of ${de.toFixed(4)} rad at column ${i} [${pose.name}]`,
    );
    flatRun = de < 1e-5 ? flatRun + AZ_STEP : 0;
    assertOk(
      flatRun < 0.15,
      `(d) flat silhouette run ≥ 0.15 rad (rectangle-end signature) at column ${i} [${pose.name}]`,
    );
  }
}

// ---------------------------------------------------------------------------
console.log(
  `stacks-meadow-check: ${poses.length} poses, ${edgeSamples.length} edge samples, ` +
    `${checks} assertions (${fadeBandColumns} fade-band columns, ` +
    `${swellColumns} swell columns), ${failures.length} failure(s)`,
);
// A zero here means a whole branch went dead — the swells left every frame
// or the silhouette scan stopped seeing terrain — which is itself a failure.
if (fadeBandColumns === 0 || swellColumns === 0) {
  failures.push(
    `coverage: fade-band columns ${fadeBandColumns}, swell columns ${swellColumns} — a check branch is no longer exercised`,
  );
}
if (failures.length) {
  const shown = failures.slice(0, 40);
  for (const f of shown) console.error("  FAIL " + f);
  if (failures.length > shown.length) {
    console.error(`  … and ${failures.length - shown.length} more`);
  }
  process.exit(1);
}
console.log("  all clear — no discoverable meadow boundary from any pose");
