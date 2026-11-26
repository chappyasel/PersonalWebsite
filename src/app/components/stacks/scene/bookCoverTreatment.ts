/** Lift dark jacket ink before scene lighting and the print curve compress it.
 * Work in linear RGB so the gain preserves color ratios. Highlights and true
 * black stay intact. This runs on the texture once, never in the render loop.
 *
 * It does run inside React's render, once per cover, and the Books shelf
 * mounts beside About at boot. Six `pow` calls a pixel cost about a second of
 * a 4x-throttled CPU across the shelf, which held About's commit back with it
 * (docs/plans/room-boot-speed.md). The tables below give the same bytes: the
 * decode has only 256 inputs, and the encode is a search for the first linear
 * value whose clamped byte reaches each step. */
export function liftBookCoverShadows(pixels: Uint8ClampedArray) {
  const { decode, steps } = coverShadowTables();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const r = decode[pixels[i]!]!;
    const g = decode[pixels[i + 1]!]!;
    const b = decode[pixels[i + 2]!]!;
    // Use the brightest channel so saturated ink does not clip or shift hue.
    const peak = Math.max(r, g, b);
    const t = Math.min(1, Math.max(0, (peak - 0.08) / 0.42));
    const gain = 2 - t * t * (3 - 2 * t);
    pixels[i] = encodedByte(steps, r * gain);
    pixels[i + 1] = encodedByte(steps, g * gain);
    pixels[i + 2] = encodedByte(steps, b * gain);
  }
}

export function srgbToLinear(byte: number) {
  const value = byte / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** The byte a Uint8ClampedArray stores for a linear value. */
export function linearToSrgbByte(value: number) {
  const out = new Uint8ClampedArray(1);
  out[0] =
    255 *
    (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);
  return out[0];
}

let tables: { decode: Float64Array; steps: Float64Array } | null = null;

function coverShadowTables() {
  if (tables) return tables;
  const decode = new Float64Array(256);
  for (let byte = 0; byte < 256; byte++) decode[byte] = srgbToLinear(byte);
  // steps[k] is the smallest linear value that encodes to byte k or above.
  const steps = new Float64Array(256);
  for (let k = 1; k < 256; k++) {
    let lo = 0;
    let hi = 1;
    for (;;) {
      const mid = (lo + hi) / 2;
      if (mid <= lo || mid >= hi) break;
      if (linearToSrgbByte(mid) >= k) hi = mid;
      else lo = mid;
    }
    steps[k] = hi;
  }
  tables = { decode, steps };
  return tables;
}

function encodedByte(steps: Float64Array, value: number) {
  // Bytes reached: the count of steps at or below the value.
  let lo = 0;
  let hi = 255;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (steps[mid]! <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
