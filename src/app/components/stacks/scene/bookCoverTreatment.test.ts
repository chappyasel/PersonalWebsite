import { describe, expect, it } from "vitest";

import {
  liftBookCoverShadows,
  linearToSrgbByte,
  srgbToLinear,
} from "./bookCoverTreatment";

/** The per-pixel version the tables replaced, kept as the reference. */
function referenceLift(pixels: Uint8ClampedArray) {
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const r = srgbToLinear(pixels[i]!);
    const g = srgbToLinear(pixels[i + 1]!);
    const b = srgbToLinear(pixels[i + 2]!);
    const peak = Math.max(r, g, b);
    const t = Math.min(1, Math.max(0, (peak - 0.08) / 0.42));
    const gain = 2 - t * t * (3 - 2 * t);
    pixels[i] = linearToSrgbByte(r * gain);
    pixels[i + 1] = linearToSrgbByte(g * gain);
    pixels[i + 2] = linearToSrgbByte(b * gain);
  }
}

describe("book cover shadow lift", () => {
  it("makes the Hamming cover's olive ink readable without losing its hue", () => {
    const pixels = new Uint8ClampedArray([60, 68, 48, 255]);
    liftBookCoverShadows(pixels);
    expect(pixels[1]).toBeGreaterThan(90);
    expect(pixels[1]).toBeGreaterThan(pixels[0]!);
    expect(pixels[0]).toBeGreaterThan(pixels[2]!);
    expect(pixels[3]).toBe(255);
  });

  it("preserves pale jackets, gold highlights, black, and transparency", () => {
    const pixels = new Uint8ClampedArray([
      212, 220, 216, 255,
      252, 248, 248, 255,
      222, 170, 35, 255,
      0, 0, 0, 255,
      60, 68, 48, 0,
    ]);
    const original = pixels.slice();
    liftBookCoverShadows(pixels);
    expect(pixels).toEqual(original);
  });

  it("keeps the grayscale ramp ordered and neutral without clipping", () => {
    const pixels = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) pixels.set([i, i, i, 255], i * 4);
    liftBookCoverShadows(pixels);
    for (let i = 1; i < 255; i++) {
      const value = pixels[i * 4]!;
      expect(value).toBeGreaterThanOrEqual(pixels[(i - 1) * 4]!);
      expect(value).toBeLessThan(255);
      expect(pixels[i * 4 + 1]).toBe(value);
      expect(pixels[i * 4 + 2]).toBe(value);
    }
  });

  it("gives the same bytes as the per-pixel version", () => {
    // Every grey, then a deterministic spread of colours.
    const count = 256 + 200_000;
    const pixels = new Uint8ClampedArray(count * 4);
    for (let i = 0; i < 256; i++) pixels.set([i, i, i, 255], i * 4);
    let seed = 12345;
    const next = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed >>> 24;
    };
    for (let i = 256; i < count; i++)
      pixels.set([next(), next(), next(), 255], i * 4);
    const expected = pixels.slice();
    referenceLift(expected);
    liftBookCoverShadows(pixels);
    expect(pixels).toEqual(expected);
  });
});
