export type ReadingBookEdgeColor = {
  edge: string;
  source: "edge" | "fallback";
};

type Rgb = { r: number; g: number; b: number };

const FALLBACK_CLOTH = [
  "#a84f35",
  "#3f7355",
  "#315f8d",
  "#8a5b37",
  "#6d557f",
  "#9a7136",
  "#3f797a",
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseHex(hex: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function hex({ r, g, b }: Rgb) {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(clamp(channel, 0, 255))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = clamp(amount, 0, 1);
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function rgbToHsl({ r, g, b }: Rgb) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

function clothColor(edge: string, dark: boolean): string {
  const parsed = parseHex(edge);
  if (!parsed) return FALLBACK_CLOTH[0];
  const hsl = rgbToHsl(parsed);
  // A white/black jacket edge still needs to read as a cloth board beside
  // cream pages. Preserve any real hue, but give neutral edges a restrained
  // warm-gray chroma and clamp luminance away from both scene extremes.
  const neutral = hsl.s < 0.08;
  const h = neutral ? 32 : hsl.h;
  const s = clamp(hsl.s, neutral ? 0.18 : 0.26, dark ? 0.74 : 0.68);
  const l = neutral
    ? dark
      ? 0.42
      : 0.38
    : dark
      ? clamp(hsl.l, 0.36, 0.64)
      : clamp(hsl.l, 0.25, 0.58);
  return hex(hslToRgb(h, s, l));
}

function luminance(color: string) {
  const rgb = parseHex(color);
  if (!rgb) return 0;
  const channel = (value: number) => {
    const n = value / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
  );
}

export function contrastRatio(a: string, b: string) {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

export function fallbackCoverEdgeColor(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return FALLBACK_CLOTH[(hash >>> 0) % FALLBACK_CLOTH.length]!;
}

export function readingBookMaterialColors(
  edge: string,
  pageBase: string,
  dark: boolean,
) {
  let cover = clothColor(edge, dark);
  let coverRgb = parseHex(cover)!;
  const pageRgb = parseHex(pageBase) ?? { r: 238, g: 226, b: 205 };
  let pages = hex(mix(pageRgb, coverRgb, dark ? 0.09 : 0.055));
  // Extremely neutral jackets can land close to paper after theme tuning.
  // Nudge paper back toward its theme base rather than inventing a new cover
  // hue, preserving the cream book-block read from the supplied reference.
  if (contrastRatio(cover, pages) < 1.35) {
    cover = hex(mix(coverRgb, { r: 24, g: 20, b: 18 }, dark ? 0.28 : 0.2));
    coverRgb = parseHex(cover)!;
    pages = hex(mix(pageRgb, coverRgb, dark ? 0.07 : 0.045));
  }
  return { cover, pages };
}
