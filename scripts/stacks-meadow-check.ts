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
//        than 99% of its fog ramp, unless terrain occludes it. (The round-3
//        fog CAP does not weaken this: the cap's residual local color is
//        revoked inside the terrain rectangle's border bands and past
//        capFade depth — see MEADOW_FOG.cap — so fog still saturates at
//        every boundary this check samples.)
//   (a2) The vegetation front line starts inside the exported near-feather
//        zone below every settled frame. A camera-side grass apron covers
//        that line at CameraRig's maximum fast-fling yaw; both its back and
//        side boundaries stay outside those transient frustums.
//   (b)  Any silhouette column that drops below the skyline fade band's top
//        (e ≤ −0.02) stays above the deep-gap floor (e ≥ −0.101), and rays
//        crossing the horizon ridge's HELD span never open a sub-horizon
//        gap (e ≥ −0.002) — the water/sky band behind the shelves stays
//        closed from every eye, including the highest bob.
//   (c)  Every silhouette column stays under the global elevation cap
//        (e ≤ +0.036): real hills above the horizon (round 3), but still
//        under the GGB deck line (e 0.038), never a wall.
//        Landmark azimuth windows are deliberately GONE (owner round 2):
//        a full-span ridge sweeps every window as the eye traverses, and
//        the hill-in-front-of-city-base read is the desired depth cue. The
//        cap alone keeps the GGB deck (e 0.038) and every structure body
//        clear; only structure BASES tuck behind the ridge.
//   (d)  The seated bank silhouette is continuous, never flat for ≥0.15 rad
//        (the end-of-rectangle signature), and is the authored crest — not
//        a fogged or cut terrain end.
import {
  FLING_GRASS_APRON,
  GRASS_BANDS,
  HORIZON_RIDGE,
  LATERAL_REACH,
  MEADOW_BANK,
  MEADOW_FOG,
  MEADOW_TERRAIN,
  NEAR_FEATHER_ZONE,
  VEGETATION_FRONT_Z,
  inEastFeather,
  inFarFeather,
  inWestFeather,
  meadowHeight,
} from "../src/app/components/stacks/scene/meadowField";
import { SEAT_POSE } from "../src/app/components/stacks/scene/seated";
import {
  CAMERA_LOOK_X_MAX_LAG,
  TRAVEL_X,
  cameraForAspect,
  cameraXForScrollOffset,
} from "../src/app/components/stacks/scene/worldLayout";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKY_SOURCE = readFileSync(
  join(ROOT, "src/app/components/stacks/scene/SceneEnvironment.tsx"),
  "utf8",
);

// ---------------------------------------------------------------------------
// Camera pan, read out of the sky shader's own constants. A regex that
// stops matching is a FAILURE, not a skip — the check must die loudly the
// day the sky is retuned, exactly like the floaters walker. (The landmark
// window extraction that used to live here left with the swells: the
// horizon ridge deliberately sweeps every window, so only the pan survives
// — it still positions the dome relative to each pose.)
function extract(name: string, re: RegExp): number {
  const m = SKY_SOURCE.match(re);
  if (!m?.[1]) {
    throw new Error(
      `stacks-meadow-check: anchor regex for ${name} no longer matches ` +
        `SceneEnvironment.tsx (${re}). Re-derive the constant before ` +
        `trusting this check.`,
    );
  }
  return Number(m[1]);
}

const PAN_SPAN = extract("PAN_SPAN", /const PAN_SPAN = ([\d.]+);/);
const PAN_BIAS = extract("PAN_BIAS", /const PAN_BIAS = ([\d.]+);/);

// ---------------------------------------------------------------------------
// Poses.
const H_MARGIN = 0.06; // camera lean / yaw parallax
const V_MARGIN = 0.0183; // pointer + idle pitch swing
const OFFSETS = [0, 0.25, 0.5, 0.75, 1];
const ASPECTS = [
  0.462, 0.5, 0.6, 0.7, 0.74, 0.75, 0.751, 1.0, 1.33, 1.78, 2.39, 3.0,
];
const Y_BOB = [-0.11, 0, 0.11];
/** Global silhouette elevation cap. Round 3 ("doesn't look nearly hilly
 * enough") raised the crest band to read as real hills — but the cap still
 * sits under the GGB deck line (e 0.038), so no structure BODY is ever
 * swallowed; only structure bases tuck behind the ridge. */
const RIDGE_E_CAP = 0.036;
/** No silhouette column whose ray crosses the ridge's held span may dip
 * below this — the raised crest now clears the horizon PROPER from every
 * eye (lowest margin ≈ +0.006 at the widest oblique), so the floor moved
 * above zero: the water/sky band behind the shelves is closed outright. */
const RIDGE_GAP_FLOOR = 0.002;
/** Checked hold span, pulled in from the authored one so the smoothstep
 * shoulders (which are mid-taper by design) are not held to the floor. */
const RIDGE_HOLD = {
  minX: HORIZON_RIDGE.holdMinX + 2,
  maxX: HORIZON_RIDGE.holdMaxX - 2,
};

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
  /** Horizontal frustum widening: lean margin for the traverse, lean +
   * pointer-sway yaw (±0.18 rad, CameraRig seatAim) for the settled seat. */
  hMargin: number;
  /** traverse → edge + silhouette/window checks; fling → near-edge checks;
   * seat → edge + bank checks; swing → edge checks only (transient frames
   * have no skyline handoff to hold to the fade band). */
  mode: "traverse" | "fling" | "seat" | "swing";
};

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

const poses: Pose[] = [];
const flingPoses: Pose[] = [];
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
        hMargin: H_MARGIN,
        mode: "traverse",
      });
      // CameraRig damps the look target behind the camera during a fast
      // fling. Both signs are checked because either scroll direction can
      // occur at an arbitrary offset. This transient participates in the
      // near grass-line check below, but not the settled perimeter/skyline
      // composition checks.
      // The damped aim can trail a fling by at most the global cap, but it
      // cannot originate beyond either travel endpoint (apart from the
      // authored ±0.45 pointer sway). Avoid impossible outward-facing poses
      // at the two terminal stops.
      const minLookX = cameraXForScrollOffset(0) - 0.45;
      const maxLookX = cameraXForScrollOffset(1) + 0.45;
      for (const lag of [
        Math.max(-CAMERA_LOOK_X_MAX_LAG, minLookX - eyeX),
        Math.min(CAMERA_LOOK_X_MAX_LAG, maxLookX - eyeX),
      ]) {
        flingPoses.push({
          name: `fling o${offset} a${aspect} y${y.toFixed(2)} lag${lag}`,
          eye: [eyeX, y, cam.z],
          forward: norm([lag, -0.08 - y, -0.2 - cam.z]),
          hHalf,
          vHalf,
          pan: progress * PAN_SPAN - PAN_BIAS,
          hMargin: H_MARGIN,
          mode: "fling",
        });
      }
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
    hMargin: 0.18 + H_MARGIN,
    mode: "seat",
  });
}
// Travel↔seat swing, modeled on CameraRig's actual two-phase transition
// (CameraRig.tsx:405-505): the WALK carries the eye along a quadratic
// Bezier to a standing point behind the seat while the view turns (turn
// completes at s = 0.72), and only THEN does the SIT phase widen the fov
// 33 → 42 while the yaw is already within ~22° of the seat direction. So
// the wide-fov frustum never looks down the traverse — bracketing every
// yaw at fov 42 would demand a frame no real camera produces. Walk-phase
// poses sweep every azimuth the turn can pass at the travel frustum;
// sit-phase poses use the widened frustum inside the ±0.45 rad yaw cone.
// These frames have no authored skyline composition — edge rules only.
{
  const seatEye = SEAT_POSE.eye;
  const standZ = seatEye[2] + 0.82; // STAND_BACK
  const walkVHalf = ((33 / 2) * Math.PI) / 180;
  const walkHHalf = Math.atan(Math.tan(walkVHalf) * 3.0);
  for (const startX of [0, -1.2]) {
    const ctrl: Vec3 = [
      startX + (seatEye[0] - startX) * 0.15,
      0.25 + 0.325,
      5.8 + (standZ - 5.8) * 0.55,
    ];
    for (const w of [0.3, 0.6, 0.9]) {
      const iw = 1 - w;
      const eye: Vec3 = [
        iw * iw * startX + 2 * iw * w * ctrl[0] + w * w * seatEye[0],
        iw * iw * 0.25 + 2 * iw * w * ctrl[1] + w * w * (0.25 + 0.65),
        iw * iw * 5.8 + 2 * iw * w * ctrl[2] + w * w * standZ,
      ];
      for (const az of [-0.5, -0.75, -1.0, 0.75, 0.5].map((f) => Math.PI * f)) {
        poses.push({
          name: `swing-walk x${startX} w${w} az${az.toFixed(2)}`,
          eye,
          forward: [Math.cos(az), -0.055, Math.sin(az)],
          hHalf: walkHHalf,
          vHalf: walkVHalf,
          pan: -PAN_BIAS,
          hMargin: H_MARGIN,
          mode: "swing",
        });
      }
    }
  }
  for (const sit of [0.25, 0.5, 0.75]) {
    const fov = 33 + (SEAT_FOV - 33) * sit;
    const vHalf = ((fov / 2) * Math.PI) / 180;
    const eye: Vec3 = [
      seatEye[0],
      0.9 + (seatEye[1] - 0.9) * sit,
      standZ + (seatEye[2] - standZ) * sit,
    ];
    // Residual turn yaw decays as the fov opens; the turn arrives from the
    // WEST, so the residual only ever points that side of the seat aim.
    const dev = 0.38 * (1 - sit);
    for (const az of [Math.PI / 2, Math.PI / 2 + dev]) {
      poses.push({
        name: `swing-sit s` + sit + ` az` + az.toFixed(2),
        eye,
        forward: [Math.cos(az), 0.02, Math.sin(az)],
        hHalf: Math.atan(Math.tan(vHalf) * 3.0),
        vHalf,
        pan: -PAN_BIAS,
        hMargin: H_MARGIN,
        mode: "swing",
      });
    }
  }
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
      Math.abs(Math.atan(dr / df)) <= pose.hHalf + pose.hMargin &&
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
const SEATED_Z0 = SEAT_POSE.eye[2] + GRASS_BANDS.seated.d0;
const seatedHw = (z: number) => 3.2 + (z - SEAT_POSE.eye[2]) * 1.017 + 0.6;
function inTraverseBand(x: number, z: number): boolean {
  if (z > VEGETATION_FRONT_Z || z < NEAR_EYE_Z - GRASS_BANDS.ridge.d1)
    return false;
  const d = NEAR_EYE_Z - z;
  return (
    x > -1.2 - LATERAL_REACH * d - 0.6 + 0.05 &&
    x < TRAVEL_X + LATERAL_REACH * d + 0.6 - 0.05
  );
}
function inSeatedBand(x: number, z: number): boolean {
  if (z < SEATED_Z0 || z > MEADOW_BANK.skirtZ) return false;
  return Math.abs(x - SEAT_POSE.eye[0]) < seatedHw(z) - 0.05;
}
// Boundary samples inside the exported west feather are exempt: the flank
// fades by density over WEST_FEATHER.span units precisely because the walk
// phase can face it from arbitrary yaw at close range — there is no line
// there to discover (vitest pins the feather's shape).
for (let d = GRASS_BANDS.near.d0; d <= GRASS_BANDS.ridge.d1; d += 0.2) {
  const z = NEAR_EYE_Z - d;
  for (const side of [-1, 1]) {
    const x =
      side < 0
        ? -1.2 - LATERAL_REACH * d - 0.6
        : TRAVEL_X + LATERAL_REACH * d + 0.6;
    if (inSeatedBand(x, z) || inWestFeather(x, z) || inFarFeather(z)) continue;
    edgeSamples.push({ p: [x, meadowHeight(x, z), z], kind: "grass" });
  }
}
// The far line is a terminal density feather (inFarFeather) — no line to
// test. Its hard-boundary duty transfers to the feather-shape vitest.
// Seated band front + side edges (the rear edge is the authored crest,
// checked in d).
for (let z = SEATED_Z0; z <= MEADOW_BANK.skirtZ; z += 0.2) {
  for (const side of [-1, 1]) {
    const x = SEAT_POSE.eye[0] + side * seatedHw(z);
    if (inTraverseBand(x, z) || inWestFeather(x, z) || inEastFeather(x, z))
      continue;
    edgeSamples.push({ p: [x, meadowHeight(x, z), z], kind: "grass" });
  }
}
{
  const hw = seatedHw(SEATED_Z0);
  for (let x = SEAT_POSE.eye[0] - hw; x <= SEAT_POSE.eye[0] + hw; x += 0.5) {
    if (inTraverseBand(x, SEATED_Z0) || inWestFeather(x, SEATED_Z0)) continue;
    edgeSamples.push({
      p: [x, meadowHeight(x, SEATED_Z0), SEATED_Z0],
      kind: "grass",
    });
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
for (const pose of poses.filter((p) => p.mode === "traverse")) {
  for (let dx = -8; dx <= 8; dx += 0.5) {
    const x = pose.eye[0] + dx;
    const front: Vec3 = [
      x,
      meadowHeight(x, VEGETATION_FRONT_Z),
      VEGETATION_FRONT_Z,
    ];
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

// (a3) Fast flings keep their full authored yaw. The extra apron must cover
// the ordinary front line without exposing a new camera-side or lateral edge.
const apronEdges: Vec3[] = [];
for (
  let x = FLING_GRASS_APRON.minX;
  x <= FLING_GRASS_APRON.maxX;
  x += 0.5
) {
  apronEdges.push([
    x,
    meadowHeight(x, FLING_GRASS_APRON.maxZ),
    FLING_GRASS_APRON.maxZ,
  ]);
}
for (
  let z = FLING_GRASS_APRON.minZ;
  z <= FLING_GRASS_APRON.maxZ;
  z += 0.2
) {
  for (const x of [FLING_GRASS_APRON.minX, FLING_GRASS_APRON.maxX]) {
    apronEdges.push([x, meadowHeight(x, z), z]);
  }
}
for (const pose of flingPoses) {
  for (const edge of apronEdges) {
    const projected = project(pose, edge);
    assertOk(
      !projected.inFrustum ||
        projected.df >= GRASS_FOG99 ||
        occluded(pose, edge),
      `(a3) fling-grass apron edge visible at (${edge[0].toFixed(1)}, ` +
        `${edge[2].toFixed(1)}) [${pose.name}]`,
    );
  }
}

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

let horizonColumns = 0;
let belowColumns = 0;
for (const pose of poses.filter((p) => p.mode === "traverse")) {
  const a0 = Math.atan2(pose.forward[2], pose.forward[0]);
  const span = pose.hHalf + pose.hMargin;
  for (let phi = -span; phi <= span; phi += AZ_STEP) {
    const sil = silhouetteAt(pose, phi);
    if (!sil) continue;
    // (c) The global cap — every column, ridge and mid rolls alike.
    assertOk(
      sil.e <= RIDGE_E_CAP,
      `(c) silhouette over the global cap: e ${sil.e.toFixed(4)} at ` +
        `(${sil.x.toFixed(1)}, ${sil.z.toFixed(1)}) [${pose.name}]`,
    );
    if (sil.e > RIDGE_GAP_FLOOR) horizonColumns++;
    else belowColumns++;
    // (b) Deep-gap floor for anything that drops below the fade band's top.
    if (sil.e <= -0.02) {
      assertOk(
        sil.e >= -0.101,
        `(b) silhouette below the fade band: e ${sil.e.toFixed(4)} at ` +
          `(${sil.x.toFixed(1)}, ${sil.z.toFixed(1)}) [${pose.name}]`,
      );
    }
    // (b) Horizon coverage: a ray that crosses the ridge's held span must
    // crest at or above the horizon — no sky/water gap behind the shelves.
    // The HIGH bob is the binding eye; checking every pose subsumes it.
    const dirX = Math.cos(a0 + phi);
    const dirZ = Math.sin(a0 + phi);
    if (dirZ < -0.01) {
      const s = (HORIZON_RIDGE.z - pose.eye[2]) / dirZ;
      const xr = pose.eye[0] + dirX * s;
      if (xr >= RIDGE_HOLD.minX && xr <= RIDGE_HOLD.maxX) {
        assertOk(
          sil.e >= RIDGE_GAP_FLOOR,
          `(b) sub-horizon gap through the held ridge span: e ` +
            `${sil.e.toFixed(4)} at ridge x ${xr.toFixed(1)} [${pose.name}]`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// (d) Seated bank silhouette: continuous authored crest, no rectangle end.
for (const pose of poses.filter((p) => p.mode === "seat")) {
  const span = pose.hHalf + pose.hMargin;
  const line: { sil: Silhouette; phi: number }[] = [];
  for (let phi = -span; phi <= span; phi += AZ_STEP) {
    const sil = silhouetteAt(pose, phi);
    assertOk(
      !!sil,
      `(d) seated column with no terrain at phi ${phi.toFixed(3)} [${pose.name}]`,
    );
    if (sil) line.push({ sil, phi });
  }
  let flatRun = 0;
  for (let i = 0; i < line.length; i++) {
    const { sil, phi } = line[i]!;
    // The silhouette must be the authored crest — at the bank (never the
    // far skirt or a cut terrain end) and nearly unfogged. Nearness is a
    // FOG-depth bound: at wide fan angles the crest is radially far but
    // its view-axis depth (what the fog ramp reads) stays ≈ 10.
    const fogDepth = sil.s * Math.cos(phi);
    assertOk(
      sil.z <= MEADOW_BANK.skirtZ + 0.3 && fogDepth < 15,
      `(d) seated silhouette is not the bank crest: (${sil.x.toFixed(1)}, ` +
        `${sil.z.toFixed(1)}) fog depth ${fogDepth.toFixed(1)} [${pose.name}]`,
    );
    if (i === 0) continue;
    const de = Math.abs(sil.e - line[i - 1]!.sil.e);
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
  `stacks-meadow-check: ${poses.length} settled/swing poses + ` +
    `${flingPoses.length} fast-fling poses, ${edgeSamples.length} edge samples, ` +
    `${checks} assertions (${horizonColumns} horizon columns, ` +
    `${belowColumns} below-horizon columns), ${failures.length} failure(s)`,
);
// A zero here means a whole branch went dead — the ridge left every frame
// or the silhouette scan stopped seeing terrain — which is itself a failure.
if (horizonColumns === 0 || belowColumns === 0) {
  failures.push(
    `coverage: horizon columns ${horizonColumns}, below-horizon columns ${belowColumns} — a check branch is no longer exercised`,
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
