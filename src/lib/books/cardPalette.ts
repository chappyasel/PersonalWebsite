import { type Hsl, type Rgb, parseHex, rgbToHex, rgbToHsl } from "./coverColor";

function luminance(color: Rgb) {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * linear(color.r) +
    0.7152 * linear(color.g) +
    0.0722 * linear(color.b)
  );
}

function atLightness({ h, s }: Hsl, lightness: number): Rgb {
  const amplitude = s * Math.min(lightness, 1 - lightness);
  const channel = (offset: number) => {
    const k = (offset + h / 30) % 12;
    return (
      255 * (lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
    );
  };
  return { r: channel(0), g: channel(8), b: channel(4) };
}

/** Bound the wash brightness so text stays readable even when the artwork
 * beneath it differs from the jacket's sampled color. No image decoding. */
export function bookCardPalette(coverColor: string | null) {
  const color = parseHex(coverColor ?? "") ?? { r: 41, g: 37, b: 36 };
  const light = luminance(color) > 0.28;
  // Adjust lightness independently. Mixing with a gray-blue ground made
  // orange jackets muddy brown and desaturated the pink jackets.
  const originalHsl = rgbToHsl(color);
  let lightness = originalHsl.l;
  let wash = color;
  // Prefer dark ink on vivid, bright covers, and keep deeper covers saturated.
  for (let step = 0; step < 24; step += 1) {
    const brightness = luminance(wash);
    if (light ? brightness >= 0.44 : brightness <= 0.075) break;
    lightness = light ? lightness + (1 - lightness) * 0.08 : lightness * 0.92;
    wash = atLightness(originalHsl, lightness);
  }

  // Include warm golds such as Get Together (#e8ac40). Cream, white, deeper
  // orange, and dark covers keep the standard rating yellow.
  const washHsl = rgbToHsl(wash);
  const washBrightness = luminance(wash);
  const starsBlendIntoWash =
    washHsl.h >= 34 &&
    washHsl.h <= 54 &&
    washHsl.s >= 0.65 &&
    washBrightness >= 0.4 &&
    washBrightness <= 0.8;

  return {
    tone: light ? "light" : "dark",
    wash: rgbToHex(wash),
    washRgb: `${Math.round(wash.r)} ${Math.round(wash.g)} ${Math.round(wash.b)}`,
    washOpacity: light ? 0.82 : 0.88,
    foreground: light ? "#24231f" : "#faf8f3",
    secondary: light ? "#2d2923" : "#f1ede8",
    starOverride: starsBlendIntoWash ? "rgb(36 35 31 / 0.72)" : undefined,
  } as const;
}
