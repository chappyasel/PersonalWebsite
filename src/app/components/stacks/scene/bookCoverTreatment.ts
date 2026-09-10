/** Lift dark jacket ink before scene lighting and the print curve compress it.
 * Work in linear RGB so the gain preserves color ratios. Highlights and true
 * black stay intact. This runs on the texture once, never in the render loop. */
export function liftBookCoverShadows(pixels: Uint8ClampedArray) {
  const linear = (byte: number) => {
    const value = byte / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  };
  const encoded = (value: number) =>
    255 *
    (value <= 0.0031308
      ? value * 12.92
      : 1.055 * value ** (1 / 2.4) - 0.055);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const r = linear(pixels[i]!);
    const g = linear(pixels[i + 1]!);
    const b = linear(pixels[i + 2]!);
    // Use the brightest channel so saturated ink does not clip or shift hue.
    const peak = Math.max(r, g, b);
    const t = Math.min(1, Math.max(0, (peak - 0.08) / 0.42));
    const gain = 2 - t * t * (3 - 2 * t);
    pixels[i] = encoded(r * gain);
    pixels[i + 1] = encoded(g * gain);
    pixels[i + 2] = encoded(b * gain);
  }
}
