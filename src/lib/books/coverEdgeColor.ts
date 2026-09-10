export type ReadingBookEdgeColor = {
  edge: string;
  /** Independent of books.cover_color, which describes the whole face. */
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
  // Jacket samples already describe the artwork. HSL saturation floors and
  // lightness caps amplified faint scan tints into green and pink boards.
  // Keep the albedo intact and let scene lighting shade the physical shell.
  const cover = hex(parseHex(edge) ?? parseHex(FALLBACK_CLOTH[0])!);
  const coverRgb = parseHex(cover)!;
  const pageRgb = parseHex(pageBase) ?? { r: 238, g: 226, b: 205 };
  const pages = hex(mix(pageRgb, coverRgb, dark ? 0.09 : 0.055));
  return { cover, pages };
}
