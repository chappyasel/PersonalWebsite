/**
 * Generate the daylight hero's cloud layer FROM the dome shader's own math.
 *
 * Usage: npx tsx scripts/generate/sky-clouds.ts
 * Writes: public/images/daylight-clouds.png
 *
 * Same method as the skyline strip: the thin-daylight-cloud field from
 * SceneEnvironment.tsx (macro sheet + vertically compressed erosion +
 * filaments + the camera-continuous coverage layer) is evaluated over the
 * traverse window at a fixed instant and baked to an RGBA image. The tuning
 * constants are imported from the scene's own SKY_LIGHTING config, so a
 * cloud retune on the main site re-tunes this layer on the next run. Clouds
 * are light-theme only, exactly as the shader gates them (`day`).
 *
 * The alpha math is exact against the hero's own CSS sky: for each pixel the
 * shader's composite col*(1-c) + c*body + rim is refactored into a single
 * (color, alpha) pair over the known backdrop gradient, so layering the PNG
 * on the CSS sky reproduces the shader's mix.
 *
 * The tile is horizontally seamless: over the last WRAP_PX columns the field
 * is cross-blended (premultiplied) with the same field sampled one window
 * width to the left, so column WIDTH would equal column 0 exactly. That lets
 * the page drift the layer on an endless loop — two copies side by side,
 * translated by one tile — at the dome's own drift rate.
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import sharp from "sharp";

import { SKY_LIGHTING } from "../../src/app/components/stacks/scene/skyLighting";

const __filename = fileURLToPath(import.meta.url);
const OUT = join(dirname(__filename), "../../public/images/daylight-clouds.png");

// Traverse window, matching the skyline strip; aspect-true projection.
const A0 = -2.28;
const A1 = -1.025;
const WIDTH = 1600;
const PPR = WIDTH / (A1 - A0);
// The deck fades out by e = 0.235 (cloudDeckFadeOut); a little headroom.
const E_TOP = 0.26;
const HEIGHT = Math.round(E_TOP * PPR);

// A fixed instant of the drift — deterministic, chosen for a slice with a
// few broken forms across the window rather than an empty or overcast one
// (T scan: 2500 gives ~17% deck coverage with real gaps).
const T = 2500;

const AT = SKY_LIGHTING.atmosphere;

// ---- GLSL helpers, ported exactly.
const fract = (x: number) => x - Math.floor(x);
function hash2(x: number, y: number): number {
  let px = fract(x * 0.1031);
  let py = fract(y * 0.1031);
  let pz = fract(x * 0.1031);
  const d = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += d;
  py += d;
  pz += d;
  return fract((px + py) * pz);
}
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a0 = hash2(ix, iy);
  const b0 = hash2(ix + 1, iy);
  const c0 = hash2(ix, iy + 1);
  const d0 = hash2(ix + 1, iy + 1);
  return a0 + (b0 - a0) * fx + (c0 + (d0 - c0) * fx - (a0 + (b0 - a0) * fx)) * fy;
}
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

type RGB = [number, number, number];
const mix3 = (a: RGB, b: RGB, t: number): RGB => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
];

// The hero's own sky, as the backdrop the clouds are composited against:
// the authored gradient (#126bb0 -> #4f8ab3 at 62% -> #6a9aba) over a
// representative desktop hero height, image bottom-aligned to the horizon.
const SKY_TOP: RGB = [0x12 / 255, 0x6b / 255, 0xb0 / 255];
const SKY_MID: RGB = [0x4f / 255, 0x8a / 255, 0xb3 / 255];
const SKY_LOW: RGB = [0x6a / 255, 0x9a / 255, 0xba / 255];
const EMBER: RGB = [0xf5 / 255, 0xc7 / 255, 0x8d / 255];
const HERO_REF_H = (470 / 1440) * WIDTH; // hero height at the reference width

function backdrop(yFromBottom: number): RGB {
  const g = clamp01(1 - yFromBottom / HERO_REF_H); // 0 hero top … 1 bottom
  return g <= 0.62
    ? mix3(SKY_TOP, SKY_MID, g / 0.62)
    : mix3(SKY_MID, SKY_LOW, (g - 0.62) / 0.38);
}

// ---- The shader's cloud field (SKY_CLOUD_DETAIL + coverage layer), uPan 0.
function cloudField(a: number, e: number): number {
  const cpx = a * 2.3 + T * AT.cloudDrift;
  const cpy = e * 12.8;
  const macro =
    0.68 * vnoise(cpx * 0.72, cpy * 1.05) +
    0.32 *
      vnoise(
        cpx * 1.42 + cpy * 0.48 - T * AT.cloudMorph,
        cpy * 1.85 + T * 0.28 * AT.cloudMorph,
      );
  const erosion =
    0.62 *
      vnoise(
        cpx * 3.2 + 19 - T * AT.cloudMorph,
        cpy * 5.0 + 19 + T * 0.35 * AT.cloudMorph,
      ) +
    0.38 *
      vnoise(
        cpx * 5.8 + 7 + T * 0.22 * AT.cloudMorph,
        cpy * 8.4 + 7 - T * AT.cloudMorph,
      );
  const filament = smoothstep(
    0.54,
    0.78,
    vnoise(cpx * 2.15 + cpy * 1.7 + 31, cpy * 4.6 + 31),
  );
  const cf = macro + (erosion - 0.54) * 0.17 + filament * 0.055;

  const seed = AT.cloudCoverageSeed;
  const drift = T * AT.cloudCoverageDrift;
  const coverage =
    0.62 *
      vnoise(
        a * AT.cloudCoverageAzimuth[0] + seed - drift,
        e * AT.cloudCoverageElevation[0] + seed * 0.37,
      ) +
    0.38 *
      vnoise(
        a * AT.cloudCoverageAzimuth[1] - seed * 0.61 + drift * 0.5,
        e * AT.cloudCoverageElevation[1] + 11 + seed * 0.19 - drift * 0.7,
      );
  return Math.max(cf, coverage * AT.cloudCoverageScale);
}

// One pixel of the layer at azimuth a, screen row py: the shader's composite
// refactored into a straight-alpha (B, A) pair over the CSS backdrop.
function samplePixel(
  a: number,
  e: number,
  deck: number,
  py: number,
): { B: RGB; A: number } | null {
  const cf = cloudField(a, e);
  const cloud =
    smoothstep(AT.cloudDensityGate[0], AT.cloudDensityGate[1], cf) * deck;
  const core = smoothstep(0.64, 0.82, cf);
  const rim = smoothstep(0.5, 0.6, cf) - smoothstep(0.69, 0.8, cf);
  const qa = (a + 1.15) / 0.42;
  const azFall = Math.exp(-qa * qa);

  const col = backdrop(HEIGHT - (py + 0.5));
  let cloudLight = mix3(col, [0.95, 0.97, 1.0], AT.cloudBodyLightMix);
  cloudLight = mix3(cloudLight, [1.0, 0.96, 0.88], azFall * 0.07);
  const underside = mix3(
    [0, 0, 0],
    col,
    mix(AT.cloudBodyShade[0], AT.cloudBodyShade[1], azFall),
  );
  let body = mix3(cloudLight, underside, core * 0.3);
  const luma = 0.299 * body[0] + 0.587 * body[1] + 0.114 * body[2];
  body = mix3(body, [luma * 0.96, luma, luma * 1.04], AT.cloudBodyDesaturation);

  const ca = cloud * AT.cloudBodyOpacity;
  const rimW = rim * deck * (AT.cloudRimBase + AT.cloudRimSun * azFall);
  const rimC = mix3([1.0, 0.93, 0.82], EMBER, clamp01(azFall * 0.85));

  // Refactor col*(1-ca) + ca*body + rimC*rimW into (B, A) over col.
  const A = Math.min(1, ca + rimW);
  if (A <= 0.004) return null;
  const B: RGB = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    B[c] = clamp01((ca * body[c]! + rimC[c]! * rimW + (A - ca) * col[c]!) / A);
  }
  return { B, A };
}

// Wrap-blend zone: the last WRAP_PX columns ease into what column 0 shows.
const WRAP_PX = 260;
const WINDOW = A1 - A0;

async function main() {
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let py = 0; py < HEIGHT; py++) {
    const e = E_TOP - (py + 0.5) / PPR;
    const deck =
      smoothstep(AT.cloudDeckFadeIn[0], AT.cloudDeckFadeIn[1], e) *
      (1 - smoothstep(AT.cloudDeckFadeOut[0], AT.cloudDeckFadeOut[1], e));
    for (let pxi = 0; pxi < WIDTH; pxi++) {
      const o = (py * WIDTH + pxi) * 4;
      if (deck <= 0.001) continue;
      const a = A0 + (pxi + 0.5) / PPR;
      let s = samplePixel(a, e, deck, py);
      const wrapT = (pxi + 1 - (WIDTH - WRAP_PX)) / WRAP_PX;
      if (wrapT > 0) {
        // Blend premultiplied toward the field one window west, which is
        // exactly what the tile's first columns sample — at pxi = WIDTH the
        // mix would be 100% column 0.
        const w = samplePixel(a - WINDOW, e, deck, py);
        const t = smoothstep(0, 1, wrapT);
        const A = mix(s?.A ?? 0, w?.A ?? 0, t);
        if (A <= 0.004) continue;
        const B: RGB = [0, 0, 0];
        for (let c = 0; c < 3; c++) {
          const p0 = (s?.B[c] ?? 0) * (s?.A ?? 0);
          const p1 = (w?.B[c] ?? 0) * (w?.A ?? 0);
          B[c] = clamp01(mix(p0, p1, t) / A);
        }
        s = { B, A };
      }
      if (!s) continue;
      rgba[o] = Math.round(s.B[0] * 255);
      rgba[o + 1] = Math.round(s.B[1] * 255);
      rgba[o + 2] = Math.round(s.B[2] * 255);
      rgba[o + 3] = Math.round(s.A * 255);
    }
  }

  await sharp(rgba, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(OUT);
  console.log(`Wrote ${OUT} (${WIDTH}x${HEIGHT})`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
