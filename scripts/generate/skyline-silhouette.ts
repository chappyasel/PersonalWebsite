/**
 * Generate the daylight skyline strip FROM the dome shader's own math.
 *
 * Usage: npx tsx scripts/generate/skyline-silhouette.ts
 * Writes: src/components/daylight/skylineGeometry.ts
 *
 * Every formula and constant below is ported verbatim from the SF traverse in
 * src/app/components/stacks/scene/SceneEnvironment.tsx (the dome shader), so
 * the 2D strip is the same silhouette the 3D site renders — the hash-stepped
 * residential carpet, the hump ridges, Sutro's legs/waist/prongs, the Golden
 * Gate through the ridge notch (occluded by the same masks the shader uses),
 * Transamerica with its wings, Salesforce's eased taper, Jasper's recessed
 * crown, and the Bay Bridge's parabola cable. If the dome changes, re-run
 * this script; never hand-edit the generated file.
 *
 * The strip preserves the dome's angular aspect: x and y share one
 * px-per-radian scale, so nothing is stretched or squashed relative to the
 * main site.
 */
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const OUT = join(
  dirname(__filename),
  "../../src/components/daylight/skylineGeometry.ts",
);

// ---- Azimuth window and projection. The SF traverse opens just west of
// Sutro Tower (owner call: nothing to its left but the ridge running off the
// edge) and closes at the Bay Bridge's east end.
const A0 = -2.24;
const A1 = -1.025;
const WIDTH = 1440;
const PPR = WIDTH / (A1 - A0); // one scale for both axes: aspect-true
const E_TOP = 0.13; // clears Sutro's 0.118 tip
const HEIGHT = +(E_TOP * PPR).toFixed(1);

const X = (a: number) => +((a - A0) * PPR).toFixed(2);
const Y = (e: number) => +((E_TOP - e) * PPR).toFixed(2);
const px = (rad: number) => +(rad * PPR).toFixed(2);

// ---- GLSL helpers, ported exactly.
const fract = (x: number) => x - Math.floor(x);
function hash1(n: number): number {
  n = fract(n * 0.1031);
  n *= n + 33.33;
  n *= n + n;
  return fract(n);
}
function hash2(x: number, y: number): number {
  let px_ = fract(x * 0.1031);
  let py = fract(y * 0.1031);
  let pz = fract(x * 0.1031);
  const d = px_ * (py + 33.33) + py * (pz + 33.33) + pz * (px_ + 33.33);
  px_ += d;
  py += d;
  pz += d;
  return fract((px_ + py) * pz);
}
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function hump(a: number, c: number, w: number): number {
  const q = (a - c) / w;
  const m = Math.max(1 - q * q, 0);
  return m * m;
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// ---- Shader constants (SceneEnvironment.tsx defines).
const TR_TOP = 0.082;
const TR_HW = 0.0102;
const TR_WING_B = 0.0372;
const TR_WING_T = 0.0617;
const SF_TOP = 0.1;
const SF_HW = 0.01;
const SF_TAPER = 0.44;
const JASPER_AZ = -1.19;
const JASPER_TOP = 0.0515;
const JASPER_HW = 0.0068;

// ---- Profiles, ported exactly.
// Twin Peaks / Mt Davidson + Telegraph Hill
function hillH(a: number): number {
  return Math.max(
    0.05 * hump(a, -2.16, 0.3),
    0.038 * hump(a, -1.98, 0.24),
    0.022 * hump(a, -1.9, 0.07),
  );
}
// Residential carpet roofline: fixed per-cell hash, downtown widens the range
function dtown(a: number): number {
  return smoothstep(0.42, 0.1, Math.abs(a + 1.35));
}
function roof(a: number): number {
  const colId = Math.floor(a * 64);
  return 0.012 + hash1(colId) * (0.016 + 0.042 * dtown(a));
}
// What occludes the Golden Gate: the shader multiplies ggb by
// (1 - hillMask) * (1 - city).
function occlusion(a: number): number {
  const h = hillH(a);
  return Math.max(h >= 0.002 ? h : 0, roof(a));
}

type Shape = { tone?: "ggb" } & (
  | { kind: "fill"; d: string; opacity?: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; opacity?: number }
  | { kind: "stroke"; d: string; width: number; opacity?: number }
);

const shapes: Shape[] = [];
const OP_HILL = 0.55;
const OP_CARPET = 0.8;
const OP_GGB = 0.85;

const rectAE = (
  a0: number,
  a1: number,
  eLo: number,
  eHi: number,
  opacity?: number,
): Shape => ({
  kind: "rect",
  x: X(a0),
  y: Y(eHi),
  w: +(px(a1 - a0)).toFixed(2),
  h: +(px(eHi - eLo)).toFixed(2),
  opacity,
});

function polyToBaseline(pts: [number, number][], opacity?: number): Shape {
  // pts are (a, e) along the top profile, left to right; fill runs to the
  // strip's bottom edge.
  const path =
    `M${X(pts[0]![0])} ${HEIGHT} ` +
    pts.map(([a, e]) => `L${X(a)} ${Y(e)}`).join(" ") +
    ` L${X(pts[pts.length - 1]![0])} ${HEIGHT} Z`;
  return { kind: "fill", d: path, opacity };
}

// ============ Golden Gate Bridge, northwest at a = -2.04 ============
// Drawn first in source order but pre-clipped against the same ridge/carpet
// occlusion the shader applies, so layering cannot leak it through the hills.
// Every shape in this block is tagged tone "ggb": the dome paints the bridge
// International Orange (daylightRendering.ts goldenGatePaintLinear, mixed
// 0.64 into the city color in daylight), and the strip keys that paint off
// the tag.
const ggbFrom = shapes.length;
{
  const AZ = -2.04;
  const SPREAD = 0.055;
  const aOf = (gx: number) => AZ + gx * SPREAD;
  const deckY = (gx: number) => 0.038 + 0.0022 * (1 - gx * gx);
  const cableY = (gx: number) => deckY(gx) + 0.0308 * gx * gx - 0.00325 * gx;
  const towerTop = (gx: number) => (gx < 0 ? 0.072 : 0.0655);

  // Towers: two plumb legs, two portal beams, a flat cap. Legs sit at
  // |dTw - 0.00245| <= 0.00074 with dTw measured from each tower centre.
  for (const t of [-1, 1]) {
    const aT = aOf(t);
    const top = towerTop(t);
    const dY = deckY(t);
    const cut = occlusion(aT);
    const legLo = Math.max(0.0245, cut);
    const inner = 0.00245 - 0.00074;
    const outer = 0.00245 + 0.00074;
    shapes.push(
      rectAE(aT - outer, aT - inner, legLo, top, OP_GGB),
      rectAE(aT + inner, aT + outer, legLo, top, OP_GGB),
    );
    const lowerBeam = mix(dY, top, 0.34);
    const upperBeam = mix(dY, top, 0.68);
    shapes.push(
      rectAE(aT - 0.00345, aT + 0.00345, lowerBeam - 0.00095, lowerBeam + 0.00095, OP_GGB),
      rectAE(aT - 0.00345, aT + 0.00345, upperBeam - 0.00085, upperBeam + 0.00085, OP_GGB),
      rectAE(aT - 0.00375, aT + 0.00375, top - 0.00105, top + 0.00105, OP_GGB),
    );
  }

  // Curves clipped to the visible notch: sample, keep runs above occlusion,
  // emit each run as a stroked polyline.
  function clippedCurve(
    gx0: number,
    gx1: number,
    f: (gx: number) => number,
    width: number,
  ) {
    const runs: [number, number][][] = [];
    let run: [number, number][] = [];
    const steps = 160;
    for (let i = 0; i <= steps; i++) {
      const gx = gx0 + ((gx1 - gx0) * i) / steps;
      const a = aOf(gx);
      const e = f(gx);
      if (e > occlusion(a)) {
        run.push([a, e]);
      } else if (run.length > 1) {
        runs.push(run);
        run = [];
      } else {
        run = [];
      }
    }
    if (run.length > 1) runs.push(run);
    for (const r of runs) {
      const d =
        `M${X(r[0]![0])} ${Y(r[0]![1])} ` +
        r
          .slice(1)
          .map(([a, e]) => `L${X(a)} ${Y(e)}`)
          .join(" ");
      shapes.push({ kind: "stroke", d, width: px(width), opacity: OP_GGB });
    }
  }

  clippedCurve(-1, 1, cableY, 0.00144); // main cable
  clippedCurve(-1.55, -1, (gx) => mix(towerTop(-1), deckY(gx) + 0.0018, (Math.abs(gx) - 1) / 0.55), 0.00144);
  clippedCurve(1, 1.55, (gx) => mix(towerTop(1), deckY(gx) + 0.0018, (Math.abs(gx) - 1) / 0.55), 0.00144);
  clippedCurve(-1.55, 1.55, deckY, 0.0023); // roadway
  clippedCurve(-1.53, 1.53, (gx) => deckY(gx) - 0.0028, 0.00144); // truss chord

  // Suspender ropes: main span at fract(gx * 9), outer spans at 14 per unit.
  for (let k = -9; k <= 8; k++) {
    const gx = (k + 0.5) / 9;
    if (Math.abs(gx) > 0.98) continue;
    const a = aOf(gx);
    const lo = Math.max(deckY(gx), occlusion(a));
    const hi = cableY(gx);
    if (hi - lo > 0.0015)
      shapes.push(rectAE(a - 0.00033, a + 0.00033, lo, hi, OP_GGB));
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k <= 7; k++) {
      const off = 1 + (k + 0.5) / 14;
      if (off > 1.52) continue;
      const gx = side * off;
      const a = aOf(gx);
      const lo = Math.max(deckY(gx), occlusion(a));
      const hi = mix(towerTop(side), deckY(gx) + 0.0018, (off - 1) / 0.55);
      if (hi - lo > 0.0015)
        shapes.push(rectAE(a - 0.00033, a + 0.00033, lo, hi, OP_GGB));
    }
  }
}
for (let i = ggbFrom; i < shapes.length; i++) shapes[i]!.tone = "ggb";

// ============ Twin Peaks / Mt Davidson / Telegraph Hill ridge ============
{
  const pts: [number, number][] = [];
  for (let a = A0; a <= -1.7; a += 0.0015) {
    const h = hillH(a);
    if (h < 0.002 && pts.length === 0) continue;
    if (h < 0.002 && pts.length > 0) {
      pts.push([a, 0]);
      break;
    }
    pts.push([a, h]);
  }
  shapes.push(polyToBaseline(pts, OP_HILL));
}

// ============ Residential carpet, hash-stepped, downtown bulge ============
{
  const pts: [number, number][] = [];
  const k0 = Math.floor(A0 * 64);
  const k1 = Math.floor(A1 * 64);
  for (let k = k0; k <= k1; k++) {
    const aS = Math.max(k / 64, A0);
    const aE = Math.min((k + 1) / 64, A1);
    if (aE <= aS) continue;
    pts.push([aS, roof(aS + 1e-6)], [aE, roof(aE - 1e-6)]);
  }
  shapes.push(polyToBaseline(pts, OP_CARPET));
}

// ============ Sutro Tower on its hill (tip e = 0.118) ============
// The shader runs the legs down to e = 0.010 and hides the cut inside its
// opaque hill; our hill is a translucent haze, so the legs instead PLANT at
// the ridge line — same silhouette the dome shows, without the floating cut.
// The whole tower carries the ridge's own haze (it stands at that distance).
{
  const AZ = -2.2;
  const OP_SUTRO = 0.8;
  const spread = (eh: number) => mix(0.011, 0.0035, clamp01(eh / 0.05));
  for (const s of [-1, 1]) {
    // Leg band |{|dSut|} - spread| <= 0.0016, clipped at the local ridge
    const ehRidge = hillH(AZ + s * 0.009) - 0.03;
    const ehs = [ehRidge, 0.05, 0.055];
    const outer = ehs.map((eh) => [AZ + s * (spread(eh) + 0.0016), eh + 0.03]);
    const inner = ehs
      .slice()
      .reverse()
      .map((eh) => [AZ + s * (spread(eh) - 0.0016), eh + 0.03]);
    const d =
      `M${X(outer[0]![0]!)} ${Y(outer[0]![1]!)} ` +
      [...outer.slice(1), ...inner]
        .map(([a, e]) => `L${X(a!)} ${Y(e!)}`)
        .join(" ") +
      " Z";
    shapes.push({ kind: "fill", d, opacity: OP_SUTRO });
  }
  // Waist bar, then the three prongs (all to the 0.118 tip, as authored)
  shapes.push(rectAE(AZ - 0.009, AZ + 0.009, 0.0804, 0.0836, OP_SUTRO));
  shapes.push(rectAE(AZ - 0.0014, AZ + 0.0014, 0.06, 0.118, OP_SUTRO));
  shapes.push(rectAE(AZ - 0.0088, AZ - 0.0062, 0.06, 0.118, OP_SUTRO));
  shapes.push(rectAE(AZ + 0.0062, AZ + 0.0088, 0.06, 0.118, OP_SUTRO));
}

// ============ Transamerica Pyramid with wings (a = -1.62) ============
{
  const AZ = -1.62;
  // hw(e) = TR_HW * (1 - e/TR_TOP), floored at 0.0008 (the spire)
  const eKnee = TR_TOP * (1 - 0.0008 / TR_HW);
  const pts: [number, number][] = [
    [AZ - TR_HW, 0],
    [AZ - 0.0008, eKnee],
    [AZ - 0.0008, TR_TOP],
    [AZ + 0.0008, TR_TOP],
    [AZ + 0.0008, eKnee],
    [AZ + TR_HW, 0],
  ];
  const d =
    `M${X(pts[0]![0])} ${HEIGHT} ` +
    pts.map(([a, e]) => `L${X(a)} ${Y(e)}`).join(" ") +
    ` L${X(pts[pts.length - 1]![0])} ${HEIGHT} Z`;
  shapes.push({ kind: "fill", d });
  // Wings: plumb shafts at the pyramid's 29th-floor half-width
  const wingHW = TR_HW * (1 - TR_WING_B / TR_TOP);
  shapes.push(rectAE(AZ - wingHW, AZ + wingHW, TR_WING_B, TR_WING_T));
}

// ============ Salesforce Tower, eased taper to the flat crown ============
{
  const AZ = -1.28;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= 20; i++) {
    const st = i / 20;
    const hw = SF_HW * (1 - SF_TAPER * st * (0.32 + 0.68 * st));
    left.push([AZ - hw, st * SF_TOP]);
    right.unshift([AZ + hw, st * SF_TOP]);
  }
  const pts = [...left, ...right];
  const d =
    `M${X(pts[0]![0])} ${HEIGHT} ` +
    pts.map(([a, e]) => `L${X(a)} ${Y(e)}`).join(" ") +
    ` L${X(pts[pts.length - 1]![0])} ${HEIGHT} Z`;
  shapes.push({ kind: "fill", d });
}

// ============ Jasper, 45 Lansing: quiet slab, recessed crown ============
{
  shapes.push(rectAE(JASPER_AZ - JASPER_HW, JASPER_AZ + JASPER_HW, 0, JASPER_TOP - 0.0025));
  shapes.push(
    rectAE(
      JASPER_AZ - JASPER_HW * 0.82,
      JASPER_AZ + JASPER_HW * 0.82,
      0,
      JASPER_TOP,
    ),
  );
}

// ============ Bay Bridge west span (a = -1.09) ============
{
  const AZ = -1.09;
  const SPREAD = 0.055;
  const aOf = (bx: number) => AZ + bx * SPREAD;
  // Two towers drawn to legibility as the shader draws them
  for (const t of [-1, 1]) {
    shapes.push(rectAE(aOf(t) - 0.05 * SPREAD, aOf(t) + 0.05 * SPREAD, 0.002, 0.03));
  }
  // Deck
  shapes.push(rectAE(aOf(-1.06), aOf(1.06), 0.0075 - 0.0018, 0.0075 + 0.0018));
  // Parabola cable dipping to the deck at midspan — exact as a quadratic
  // Bezier (control y = 2*f(mid) - (y0+y1)/2).
  const y0 = 0.009 + 0.021;
  const yc = 2 * 0.009 - y0;
  shapes.push({
    kind: "stroke",
    d: `M${X(aOf(-1))} ${Y(y0)} Q${X(aOf(0))} ${Y(yc)} ${X(aOf(1))} ${Y(y0)}`,
    width: px(0.0024),
  });
}

// ============ The night layer, ported from the shader's own rules ============
//
// Every value here is deterministic: the shader's fixed per-cell window hash
// crossing its dark-theme threshold (uTime never re-deals a window), the Bay
// Lights' authored dot positions and phase warp, the Golden Gate's deck lamps
// and aviation beacons, Salesforce's Day-for-Night crown band, and the moon
// at its authored azimuth. Windows whose hash sits inside the slow-turnover
// band (the shader's ±0.006 drifting term) are tagged "window-slow" with the
// hash as phase, so CSS can turn them over on their own clocks.
type NightShape =
  | {
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      tone: "window" | "window-slow" | "crown";
      phase?: number;
    }
  | {
      kind: "dot";
      x: number;
      y: number;
      r: number;
      tone: "baylight" | "beacon";
      phase?: number;
    }
  | { kind: "stroke"; d: string; width: number; tone: "lamps" };

const night: NightShape[] = [];
const THRESH = 0.05; // windowLit's dark/rest threshold at uDawn = 0
const SLOW = 0.006; // the slow per-window drift amplitude

function pushWindow(
  aC: number,
  eC: number,
  w: number,
  h: number,
  hash: number,
  thresh: number,
) {
  if (hash >= thresh + SLOW) return;
  const slow = hash > thresh - SLOW;
  night.push({
    kind: "rect",
    x: X(aC - w / 2),
    y: Y(eC + h / 2),
    w: +px(w).toFixed(2),
    h: +px(h).toFixed(2),
    tone: slow ? "window-slow" : "window",
    ...(slow ? { phase: +hash.toFixed(4) } : {}),
  });
}

// ---- Residential carpet: wc = (a*420, e*300), box 0.44 x 0.56 of the cell,
// clear of the named towers' footprints (they light their own facades).
{
  const named: Array<[number, number]> = [
    [-1.62, TR_HW],
    [-1.28, SF_HW],
    [JASPER_AZ, JASPER_HW],
  ];
  for (let ci = Math.floor(A0 * 420); ci <= Math.floor(A1 * 420); ci++) {
    const aC = (ci + 0.5) / 420;
    if (aC < A0 || aC > A1) continue;
    if (named.some(([az, hw]) => Math.abs(aC - az) < hw + 0.001)) continue;
    const roofE = roof(aC);
    for (let cj = 0; cj <= Math.ceil(roofE * 300); cj++) {
      const eC = (cj + 0.45) / 300;
      const eLo = eC - 0.28 / 300;
      const eHi = eC + 0.28 / 300;
      if (eLo < 0.004 || eHi > roofE - 0.005) continue;
      pushWindow(aC, eC, 0.44 / 420, 0.56 / 300, hash2(ci, cj), THRESH);
    }
  }
}

// ---- Transamerica: narrow vertical bands in true azimuth columns, cut off
// by the sloping faces; the spire and wings stay dark.
{
  const AZ = -1.62;
  for (let xi = -5; xi <= 4; xi++) {
    const dC = (xi + 0.5) / 470;
    const wHalf = 0.3 / 470;
    for (let yj = 0; yj <= Math.ceil(TR_WING_T * 260); yj++) {
      const eC = (yj + 0.45) / 260;
      const eHi = eC + 0.34 / 260;
      if (eC - 0.34 / 260 < 0.002 || eHi > TR_WING_T) continue;
      const hwT = TR_HW * (1 - eHi / TR_TOP);
      if (Math.abs(dC) + wHalf > hwT) continue;
      pushWindow(AZ + dC, eC, 0.6 / 470, 0.68 / 260, hash2(xi, yj), THRESH * 2);
    }
  }
}

// ---- Salesforce: the grid is normalised to the shaft's own width, so the
// columns converge with the eased taper; held clear of the crown band.
{
  const AZ = -1.28;
  const hwSf = (e: number) => {
    const st = Math.min(Math.max(e / SF_TOP, 0), 1);
    return SF_HW * (1 - SF_TAPER * st * (0.32 + 0.68 * st));
  };
  for (let yj = 1; yj <= Math.floor(0.08 * 336); yj++) {
    const eC = (yj + 0.45) / 336;
    if (eC + 0.32 / 336 > 0.08 || eC - 0.32 / 336 < 0.004) continue;
    const hw = hwSf(eC);
    for (let xi = -4; xi <= 3; xi++) {
      const dC = (((xi + 0.5) / 3.6) * hw) / 1;
      const w = (0.6 / 3.6) * hw;
      if (Math.abs(dC) + w / 2 > hw) continue;
      pushWindow(AZ + dC, eC, w, 0.64 / 336, hash2(xi, yj), THRESH * 1.2);
    }
  }
  // Day for Night: the lit band across the top of the crown (crownT 0.85+),
  // washed and slowly shimmering in CSS.
  const bandLo = 0.085;
  const bandHi = SF_TOP - 0.0005;
  const hwBand = hwSf((bandLo + bandHi) / 2);
  night.push({
    kind: "rect",
    x: X(AZ - hwBand),
    y: Y(bandHi),
    w: +px(hwBand * 2).toFixed(2),
    h: +px(bandHi - bandLo).toFixed(2),
    tone: "crown",
  });
}

// ---- Bay Lights: 24 dots strung on the parabola cable, each on the
// shader's own nested-sin phase warp (ported at its uTime scale).
{
  const AZ = -1.09;
  const SPREAD = 0.055;
  for (let k = 0; k < 24; k++) {
    const bx = (k + 0.5) / 12 - 1;
    const e = 0.009 + 0.021 * bx * bx;
    const phase =
      (((k * 1.7 + Math.sin(k * 0.37)) / (2 * Math.PI)) % 1 + 1) % 1;
    night.push({
      kind: "dot",
      x: X(AZ + bx * SPREAD),
      y: Y(e),
      r: +px(0.0013).toFixed(2),
      tone: "baylight",
      phase: +phase.toFixed(3),
    });
  }
}

// ---- Golden Gate at night: the deck's continuous lamp line (beaded by CSS
// dasharray the way the shader beads it with sin(gx*116)), and the four red
// aviation beacons on the tower tops flashing at the authored 0.43 Hz.
{
  const AZ = -2.04;
  const SPREAD = 0.055;
  const aOf = (gx: number) => AZ + gx * SPREAD;
  const deckY = (gx: number) => 0.038 + 0.0022 * (1 - gx * gx);
  let run: [number, number][] = [];
  const runs: [number, number][][] = [];
  for (let i = 0; i <= 160; i++) {
    const gx = -1.53 + (3.06 * i) / 160;
    const a = aOf(gx);
    const e = deckY(gx) + 0.0012;
    if (e > occlusion(a)) run.push([a, e]);
    else if (run.length > 1) {
      runs.push(run);
      run = [];
    } else run = [];
  }
  if (run.length > 1) runs.push(run);
  for (const r of runs) {
    const d =
      `M${X(r[0]![0])} ${Y(r[0]![1])} ` +
      r
        .slice(1)
        .map(([a, e]) => `L${X(a)} ${Y(e)}`)
        .join(" ");
    night.push({ kind: "stroke", d, width: px(0.0021), tone: "lamps" });
  }
  for (const [t, topE] of [
    [-1, 0.0732],
    [1, 0.0667],
  ] as const) {
    for (const off of [-0.00215, 0.00215]) {
      night.push({
        kind: "dot",
        x: X(aOf(t) + off),
        y: Y(topE),
        r: +px(0.0011).toFixed(2),
        tone: "beacon",
      });
    }
  }
}

// ---- The moon, at its authored azimuth (-1.55), mid-arc elevation, painted
// behind the skyline so every silhouette occludes it naturally.
const MOON = {
  x: X(-1.55),
  y: Y(0.1),
  r: +px(0.0125).toFixed(2),
};

// ============ Self-contained horizon SVGs (flat home footer) ============
//
// The flat home closes on this skyline, but it must not pay the geometry
// into the homepage JS bundle (route budget: the boot path is sacred). So
// the horizon ships as two static SVG files — light and dark — with the
// night layer's animations embedded in the file itself; an <img> plays CSS
// animations, needs no hydration, and costs the bundle nothing.
function horizonSvg(theme: "light" | "dark"): string {
  const sil = theme === "light" ? "#5b7288" : "#141b2b";
  // --dl-ggb, converted to hex per theme
  const ggbHex = theme === "light" ? "#924f45" : "#6d3f36";
  const win = theme === "light" ? "#ffca8a" : "#ffbe73";
  const winOp = theme === "light" ? 0.45 : 0.8;
  const silOp = theme === "light" ? 0.55 : 1;
  const parts: string[] = [];
  if (theme === "dark") {
    parts.push(
      `<circle cx="${MOON.x}" cy="${MOON.y}" r="${(MOON.r * 3.8).toFixed(1)}" fill="url(#hh)"/>`,
      `<circle cx="${MOON.x}" cy="${MOON.y}" r="${MOON.r}" fill="url(#hd)"/>`,
    );
  }
  for (const s of shapes) {
    const fill = s.tone === "ggb" ? ggbHex : sil;
    const op = +((s.opacity ?? 1) * (s.tone === "ggb" ? 1 : silOp)).toFixed(2);
    if (s.kind === "rect")
      parts.push(
        `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${fill}" fill-opacity="${op}"/>`,
      );
    else if (s.kind === "stroke")
      parts.push(
        `<path d="${s.d}" fill="none" stroke="${fill}" stroke-width="${s.width}" stroke-opacity="${op}"/>`,
      );
    else parts.push(`<path d="${s.d}" fill="${fill}" fill-opacity="${op}"/>`);
  }
  for (const n of night) {
    if (n.kind === "rect" && n.tone !== "crown") {
      const anim =
        theme === "dark" && n.tone === "window-slow" && n.phase !== undefined
          ? ` class="ws" style="animation-delay:${(-((n.phase * 997) % 1) * 126).toFixed(1)}s"`
          : "";
      parts.push(
        `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${win}" fill-opacity="${winOp}"${anim}/>`,
      );
      continue;
    }
    if (theme !== "dark") continue;
    if (n.kind === "dot") {
      if (n.tone === "beacon")
        parts.push(
          `<circle class="bc" cx="${n.x}" cy="${n.y}" r="${n.r}" fill="#e61f1a"/>`,
        );
      else
        parts.push(
          `<circle class="bl" cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${win}" style="animation-delay:${(-(n.phase ?? 0) * 12.57).toFixed(2)}s"/>`,
        );
    } else if (n.kind === "stroke") {
      parts.push(
        `<path class="lp" d="${n.d}" fill="none" stroke="#ff9e3d" stroke-width="${n.width}" stroke-dasharray="2 1.6" opacity="0.55"/>`,
      );
    } else {
      parts.push(
        `<rect class="cr" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="#c7b39e"/>`,
      );
    }
  }
  const defs =
    theme === "dark"
      ? `<defs><radialGradient id="hd"><stop offset="0%" stop-color="#d9d8cb"/><stop offset="72%" stop-color="#c4cbd8"/><stop offset="100%" stop-color="#aeb8c9"/></radialGradient><radialGradient id="hh"><stop offset="0%" stop-color="#6b80a8" stop-opacity="0.3"/><stop offset="55%" stop-color="#6b80a8" stop-opacity="0.1"/><stop offset="100%" stop-color="#6b80a8" stop-opacity="0"/></radialGradient></defs>`
      : "";
  const style =
    theme === "dark"
      ? `<style>.bc{animation:f 2.31s steps(1) infinite}.bl{animation:b 12.6s ease-in-out infinite}.ws{animation:w 126s linear infinite}.cr{animation:c 11s ease-in-out infinite;opacity:.5}@keyframes f{0%,12.9%{opacity:1}13%,100%{opacity:.27}}@keyframes b{0%,100%{opacity:1}50%{opacity:.35}}@keyframes w{0%,38%{opacity:.8}46%,88%{opacity:0}96%,100%{opacity:.8}}@keyframes c{0%,100%{opacity:.5}50%{opacity:.36}}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>`
      : "";
  // viewBox reaches above the strip so the moon's halo never clips square.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -60 ${WIDTH} ${HEIGHT + 60}">${style}${defs}${parts.join("")}</svg>`;
}

const PUB = join(dirname(__filename), "../../public/images");
writeFileSync(join(PUB, "horizon-light.svg"), horizonSvg("light"));
writeFileSync(join(PUB, "horizon-dark.svg"), horizonSvg("dark"));

// ---- Emit
const header = `/**
 * GENERATED by scripts/generate/skyline-silhouette.ts — do not hand-edit.
 * Regenerate with: npx tsx scripts/generate/skyline-silhouette.ts
 *
 * This is the dome shader's own SF traverse (SceneEnvironment.tsx), evaluated
 * over a ∈ [${A0}, ${A1}] and projected aspect-true at ${PPR.toFixed(1)} px/rad:
 * the hash-stepped residential carpet, the hump ridges, Sutro on its hill,
 * the Golden Gate through the ridge notch (pre-clipped by the shader's own
 * occlusion masks), Transamerica with its wings, Salesforce's eased taper,
 * Jasper, and the Bay Bridge's parabola cable. The ember belongs at
 * a = -1.15 → ${(((-1.15 - A0) / (A1 - A0)) * 100).toFixed(0)}% of the strip width.
 */

export const SKYLINE_VIEWBOX = "0 0 ${WIDTH} ${HEIGHT}";
export const SKYLINE_WIDTH = ${WIDTH};
export const SKYLINE_HEIGHT = ${HEIGHT};

/** tone "ggb" marks the Golden Gate, which carries its own paint color. */
export type SkylineShape = { tone?: "ggb" } & (
  | { kind: "fill"; d: string; opacity?: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; opacity?: number }
  | { kind: "stroke"; d: string; width: number; opacity?: number }
);

export const SKYLINE_SHAPES: SkylineShape[] = ${JSON.stringify(shapes, null, 2)};

/**
 * The night layer: the shader's fixed-hash windows (tone "window", plus
 * "window-slow" for cells inside the turnover band, phase = their hash), the
 * Salesforce Day-for-Night crown band, the Bay Lights dots (phase = the
 * shader's sequencing warp), the Golden Gate deck-lamp line, and the four
 * red aviation beacons. Colors and animation live in daylight.css.
 */
export type SkylineNightShape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; tone: "window" | "window-slow" | "crown"; phase?: number }
  | { kind: "dot"; x: number; y: number; r: number; tone: "baylight" | "beacon"; phase?: number }
  | { kind: "stroke"; d: string; width: number; tone: "lamps" };

export const SKYLINE_NIGHT: SkylineNightShape[] = ${JSON.stringify(night, null, 2)};

/** The moon's disc, behind the skyline at the shader's own azimuth. */
export const MOON = ${JSON.stringify(MOON)};
`;

writeFileSync(OUT, header);
console.log(
  `Wrote ${OUT}: ${shapes.length} shapes, viewBox 0 0 ${WIDTH} ${HEIGHT}`,
);
