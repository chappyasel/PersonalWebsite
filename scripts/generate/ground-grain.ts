/**
 * Generate the daylight ground's paper grain.
 *
 * Usage: npx tsx scripts/generate/ground-grain.ts
 * Writes: public/images/daylight-grain.png
 *
 * A nod to the grainient these pages grew up with: the moving WebGL wash is
 * gone, but its grain survives as a static print tooth over the day-arc
 * ground. Same method as the rest of the daylight assets — deterministic
 * generation, built on the scene's own Hoskins hash (SceneEnvironment.tsx),
 * never a stock texture.
 *
 * The tile encodes two-sided luminance modulation as alpha: pixels brighter
 * than the paper lay down white at low alpha, darker pixels lay down black,
 * so one tile works over both the light and dark grounds. Per-pixel hash
 * tiles seamlessly by construction; a soft periodic octave adds the slight
 * clumping real grain has.
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), "../../public/images");

/**
 * Rendered at 2x the 256px CSS display size: a 1x tile upscales 2-3x on
 * retina displays, which blew each speckle up into a visible blob — the
 * grain read far louder on phones than on the desktop it was tuned on.
 */
const SIZE = 512;
const RASTER_SCALE = 2; // raster px per CSS px at the 256px background-size
/**
 * Peak alpha of a single grain; average sits near a third of this. The dark
 * ground needs far less — white speckle on near-black reads several times
 * louder than black speckle on paper.
 */
const VARIANTS = [
  { file: "daylight-grain.png", amplitude: 0.03 },
  { file: "daylight-grain-dark.png", amplitude: 0.013 },
] as const;

// Hoskins hash, as the dome shader uses (hash2 in SceneEnvironment.tsx).
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

// Periodic value noise (lattice taken mod `period`) so the clumping octave
// tiles exactly.
function periodicVnoise(x: number, y: number, period: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const w = (i: number) => ((i % period) + period) % period;
  const a0 = hash2(w(ix), w(iy));
  const b0 = hash2(w(ix + 1), w(iy));
  const c0 = hash2(w(ix), w(iy + 1));
  const d0 = hash2(w(ix + 1), w(iy + 1));
  const top = a0 + (b0 - a0) * fx;
  const bot = c0 + (d0 - c0) * fx;
  return top + (bot - top) * fy;
}

async function main() {
  const CLUMP_SCALE = 8 * RASTER_SCALE; // raster px per lattice cell (8 CSS px)
  const PERIOD = SIZE / CLUMP_SCALE;
  for (const { file, amplitude } of VARIANTS) {
    const rgba = Buffer.alloc(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const grain = hash2(x + 0.5, y + 0.5) - 0.5;
        const clump =
          periodicVnoise(x / CLUMP_SCALE, y / CLUMP_SCALE, PERIOD) - 0.5;
        const d = 0.75 * grain + 0.25 * clump;
        const o = (y * SIZE + x) * 4;
        const tone = d > 0 ? 255 : 0;
        rgba[o] = tone;
        rgba[o + 1] = tone;
        rgba[o + 2] = tone;
        rgba[o + 3] = Math.round(
          Math.min(1, Math.abs(d) * 2 * amplitude) * 255,
        );
      }
    }
    const out = join(OUT_DIR, file);
    await sharp(rgba, { raw: { width: SIZE, height: SIZE, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
    console.log(`Wrote ${out} (${SIZE}x${SIZE}, amplitude ${amplitude})`);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
