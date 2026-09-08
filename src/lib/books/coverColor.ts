/**
 * Cover colors for the "sort by color" shelf.
 *
 * A book's `coverColor` is one hex string chosen by `coverColor.server.ts`
 * from the whole jacket. This module is the pure half:
 *
 * - `coverColorFamily` classifies that hex into a family, which is the
 *   section header. Families are coarse HSL hue ranges with brown and the
 *   neutrals carved out, tuned for jacket scans.
 * - `orderByCoverColor` lays the books out as a rainbow. Families run red,
 *   brown, orange through pink, then black, gray, white. Inside a family the order is
 *   not a key sort: it is the shortest smooth path through OKLab from the
 *   family's entry hue to its exit hue (nearest neighbour, then 2-opt and
 *   or-opt), so lightness and chroma change gradually and the hue still
 *   progresses around the wheel. Each family starts at the book closest to the
 *   previous family's last book, which keeps the seams smooth too.
 *
 * When a family looks wrong on the shelf, adjust the family table. When the
 * path inside a family looks wrong, adjust `LIGHTNESS_WEIGHT`.
 */

export const COLOR_FAMILIES = [
  "Red",
  // Brown is dark orange, so it bridges the reds and the oranges: red, rust,
  // chocolate, tan, peach, orange. After pink it was a dark dip in the run.
  "Brown",
  "Orange",
  "Yellow",
  "Green",
  "Teal",
  "Blue",
  "Purple",
  "Pink",
  "Black",
  "Gray",
  "White",
] as const;

export type ColorFamily = (typeof COLOR_FAMILIES)[number];

/** Section label for books with no cover or no extracted color. */
export const UNKNOWN_COLOR_LABEL = "Other";

export type Rgb = { r: number; g: number; b: number };
export type Hsl = { h: number; s: number; l: number };
export type Oklab = { L: number; a: number; b: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function parseHex(hex: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(clamp(channel, 0, 255))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
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

export function hexToHsl(hex: string): Hsl | null {
  const rgb = parseHex(hex);
  return rgb ? rgbToHsl(rgb) : null;
}

// ---------------------------------------------------------------------------
// OKLab (Björn Ottosson, 2020). Euclidean distance here tracks perceived
// color difference, which is what "smooth" means on the shelf.

function srgbToLinear(channel: number) {
  const n = channel / 255;
  return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number) {
  const c =
    value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(clamp(c, 0, 1) * 255);
}

/** Round so a last-bit difference in `Math.cbrt` between Node and a browser
 * can never flip a path decision and break hydration. */
function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

export function rgbToOklab({ r, g, b }: Rgb): Oklab {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: round4(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s),
    a: round4(1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s),
    b: round4(0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s),
  };
}

function oklabToLinear({ L, a, b }: Oklab) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

export function oklabToRgb(lab: Oklab): Rgb {
  const { r, g, b } = oklabToLinear(lab);
  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b) };
}

export function oklabInGamut(lab: Oklab): boolean {
  const { r, g, b } = oklabToLinear(lab);
  const ok = (v: number) => v >= -0.0005 && v <= 1.0005;
  return ok(r) && ok(g) && ok(b);
}

export function hexToOklab(hex: string): Oklab | null {
  const rgb = parseHex(hex);
  return rgb ? rgbToOklab(rgb) : null;
}

/** How much a lightness step counts against a hue or chroma step of the same
 * OKLab size. 1 is plain perceptual distance; lower it to make the path
 * chase hue harder and tolerate brightness jumps. */
const LIGHTNESS_WEIGHT = 1;

export function oklabDistance(p: Oklab, q: Oklab): number {
  const dL = (p.L - q.L) * LIGHTNESS_WEIGHT;
  const da = p.a - q.a;
  const db = p.b - q.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

// ---------------------------------------------------------------------------
// Families

/** Saturation below this reads as ink or paper rather than a colored jacket. */
const NEUTRAL_SATURATION = 0.12;
/** Lightness below this is black no matter what tint the scan carries. */
const BLACK_LIGHTNESS = 0.12;
/** Lightness above this is white: any tint is imperceptible on the shelf. */
const WHITE_LIGHTNESS = 0.9;
/** Reds wrap the wheel; hues from here up count as red, not pink. */
const RED_WRAP_HUE = 338;

function chromaticFamily({ h, s, l }: Hsl): ColorFamily {
  // Brown is dark or muted orange. Saddle brown is dark at full saturation,
  // tan and beige are light but muted, sienna is both a little dark and a
  // little muted. Burnt orange (dark but fully saturated) and a mid-lightness
  // jacket orange like The Martian's stay orange.
  if (h >= 10 && h < 50 && (l < 0.36 || s < 0.5 || (l < 0.42 && s < 0.6)))
    return "Brown";
  // Crimson and wine sit near 345°; keep them red rather than pink
  if (h < 12 || h >= RED_WRAP_HUE) return "Red";
  if (h < 42) return "Orange";
  if (h < 68) return "Yellow";
  if (h < 165) return "Green";
  if (h < 195) return "Teal";
  if (h < 255) return "Blue";
  if (h < 300) return "Purple";
  return "Pink";
}

export function colorFamilyFromHsl(hsl: Hsl): ColorFamily {
  const { s, l } = hsl;
  if (l < BLACK_LIGHTNESS) return "Black";
  if (l >= WHITE_LIGHTNESS) return "White";
  if (l >= 0.85 && s < 0.3) return "White";
  if (s < NEUTRAL_SATURATION) {
    if (l < 0.25) return "Black";
    if (l < 0.8) return "Gray";
    return "White";
  }
  return chromaticFamily(hsl);
}

export function coverColorFamily(hex: string | null): ColorFamily | null {
  if (!hex) return null;
  const hsl = hexToHsl(hex);
  return hsl ? colorFamilyFromHsl(hsl) : null;
}

/** Section label for the shelf header. */
export function coverColorLabel(hex: string | null): string {
  return coverColorFamily(hex) ?? UNKNOWN_COLOR_LABEL;
}

const NEUTRAL_FAMILIES: ReadonlySet<ColorFamily> = new Set([
  "Black",
  "Gray",
  "White",
]);

/** Order two section labels the way the shelf runs. Unknown is always last. */
export function compareColorLabels(
  a: string,
  b: string,
  order: "asc" | "desc",
): number {
  if (a === UNKNOWN_COLOR_LABEL) return 1;
  if (b === UNKNOWN_COLOR_LABEL) return -1;
  const diff =
    (COLOR_FAMILIES as readonly string[]).indexOf(a) -
    (COLOR_FAMILIES as readonly string[]).indexOf(b);
  return order === "desc" ? -diff : diff;
}

// ---------------------------------------------------------------------------
// Smooth path inside a family

type Point = { lab: Oklab; hue: number; family: ColorFamily };

/**
 * Open path from `start` to `end` visiting every index once, short in OKLab.
 * Nearest neighbour seeds it; 2-opt (reverse a run) and or-opt (move a run of
 * up to three) then polish it. Endpoints never move. Sizes here are a family
 * of at most a hundred or so books, so the quadratic passes are cheap.
 */
export function smoothPath(
  points: Oklab[],
  start: number,
  end: number,
): number[] {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  if (start === end) {
    // Degenerate anchors (one book, or one color repeated): pick the farthest
    // point as the exit so the path still sweeps.
    let farthest = start;
    let best = -1;
    for (let i = 0; i < n; i++) {
      const d = oklabDistance(points[start]!, points[i]!);
      if (i !== start && d > best) {
        best = d;
        farthest = i;
      }
    }
    end = farthest;
  }
  const dist = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = oklabDistance(points[i]!, points[j]!);
      dist[i * n + j] = d;
      dist[j * n + i] = d;
    }
  }
  const D = (i: number, j: number) => dist[i * n + j]!;

  // Nearest neighbour from the start; the end is held back and appended.
  const remaining = new Set<number>();
  for (let i = 0; i < n; i++) if (i !== start && i !== end) remaining.add(i);
  const path = [start];
  let current = start;
  while (remaining.size > 0) {
    let next = -1;
    let best = Infinity;
    for (const candidate of remaining) {
      const d = D(current, candidate);
      // Ties resolve to the lower index so the result is deterministic
      if (d < best || (d === best && candidate < next)) {
        best = d;
        next = candidate;
      }
    }
    remaining.delete(next);
    path.push(next);
    current = next;
  }
  path.push(end);

  const EPSILON = 1e-9;
  let improved = true;
  let passes = 0;
  while (improved && passes++ < 200) {
    improved = false;
    // 2-opt: reverse path[i..j] when it shortens the two seams
    for (let i = 1; i < n - 2; i++) {
      for (let j = i + 1; j < n - 1; j++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        const c = path[j]!;
        const d = path[j + 1]!;
        const gain = D(a, b) + D(c, d) - D(a, c) - D(b, d);
        if (gain > EPSILON) {
          let lo = i;
          let hi = j;
          while (lo < hi) {
            const tmp = path[lo]!;
            path[lo] = path[hi]!;
            path[hi] = tmp;
            lo++;
            hi--;
          }
          improved = true;
        }
      }
    }
    // or-opt: lift a run of 1..3 interior nodes and drop it between two others
    for (let len = 1; len <= 3; len++) {
      for (let i = 1; i + len - 1 < n - 1; i++) {
        const before = path[i - 1]!;
        const first = path[i]!;
        const last = path[i + len - 1]!;
        const after = path[i + len]!;
        const removeGain = D(before, first) + D(last, after) - D(before, after);
        let bestGain = EPSILON;
        let bestAt = -1;
        let bestReversed = false;
        for (let k = 0; k < n - 1; k++) {
          if (k >= i - 1 && k < i + len) continue;
          const p = path[k]!;
          const q = path[k + 1]!;
          const base = D(p, q);
          const forward = D(p, first) + D(last, q) - base;
          const reversed = D(p, last) + D(first, q) - base;
          if (removeGain - forward > bestGain) {
            bestGain = removeGain - forward;
            bestAt = k;
            bestReversed = false;
          }
          if (removeGain - reversed > bestGain) {
            bestGain = removeGain - reversed;
            bestAt = k;
            bestReversed = true;
          }
        }
        if (bestAt >= 0) {
          const run = path.splice(i, len);
          if (bestReversed) run.reverse();
          const insertAt = bestAt < i ? bestAt + 1 : bestAt + 1 - len;
          path.splice(insertAt, 0, ...run);
          improved = true;
        }
      }
    }
  }
  return path;
}

function foldedHue(family: ColorFamily, h: number) {
  // Red wraps around 360; fold the high end back so 350° sorts before 5°.
  return family === "Red" && h >= RED_WRAP_HUE ? h - 360 : h;
}

function pointFor(hex: string): Point | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const hsl = rgbToHsl(rgb);
  const family = colorFamilyFromHsl(hsl);
  return { lab: rgbToOklab(rgb), hue: foldedHue(family, hsl.h), family };
}

/**
 * Lay books out as a rainbow: family by family, and inside each family along
 * a smooth OKLab path from its entry hue to its exit hue. Books without a
 * color trail the run in either direction. Input order only matters for
 * those trailing books and for exact-duplicate colors.
 */
export function orderByCoverColor<T extends { coverColor: string | null }>(
  items: readonly T[],
  order: "asc" | "desc",
): T[] {
  const byFamily = new Map<ColorFamily, Array<{ item: T; point: Point }>>();
  const unknown: T[] = [];
  for (const item of items) {
    const point = item.coverColor ? pointFor(item.coverColor) : null;
    if (!point) {
      unknown.push(item);
      continue;
    }
    const bucket = byFamily.get(point.family) ?? [];
    bucket.push({ item, point });
    byFamily.set(point.family, bucket);
  }

  const run: T[] = [];
  let previousEnd: Oklab | null = null;
  for (const family of COLOR_FAMILIES) {
    const bucket = byFamily.get(family);
    if (!bucket || bucket.length === 0) continue;
    const labs = bucket.map((entry) => entry.point.lab);
    let start = 0;
    let end = 0;
    if (NEUTRAL_FAMILIES.has(family)) {
      // Black through white is one lightness ramp: darkest in, lightest out
      bucket.forEach((entry, i) => {
        if (entry.point.lab.L < bucket[start]!.point.lab.L) start = i;
        if (entry.point.lab.L > bucket[end]!.point.lab.L) end = i;
      });
    } else {
      // Exit at the family's far hue edge so the wheel keeps turning. Enter
      // next to wherever the previous family left off; the first family
      // enters at its near hue edge instead. Anchors come from the vivid
      // half of the family: a dull outlier's hue is unreliable and would end
      // the run on a muddy cover.
      const chromas = bucket.map((entry) =>
        Math.hypot(entry.point.lab.a, entry.point.lab.b),
      );
      const median = [...chromas].sort((a, b) => a - b)[
        Math.floor(chromas.length / 2)
      ]!;
      let anchors = bucket
        .map((_, i) => i)
        .filter((i) => chromas[i]! >= median * 0.5);
      if (anchors.length < 2) anchors = bucket.map((_, i) => i);
      end = anchors[0]!;
      for (const i of anchors) {
        if (bucket[i]!.point.hue > bucket[end]!.point.hue) end = i;
      }
      const entries = anchors.filter((i) => i !== end);
      start = entries[0] ?? end;
      if (previousEnd) {
        let best = Infinity;
        for (const i of entries) {
          const d = oklabDistance(previousEnd, bucket[i]!.point.lab);
          if (d < best) {
            best = d;
            start = i;
          }
        }
      } else {
        for (const i of entries) {
          if (bucket[i]!.point.hue < bucket[start]!.point.hue) start = i;
        }
      }
      if (start === end && bucket.length > 1) start = end === 0 ? 1 : 0;
    }
    const path = smoothPath(labs, start, end);
    for (const index of path) run.push(bucket[index]!.item);
    previousEnd = labs[path[path.length - 1]!]!;
  }

  if (order === "desc") run.reverse();
  return run.concat(unknown);
}

/**
 * A dark wash of a jacket color for the ground behind a fallback board: the
 * hue kept, chroma eased, lightness pinned low so paper-white type reads on
 * it whatever the jacket was. Light and dark jackets land close together on
 * purpose, so a pale yellow book and a navy one get the same kind of card.
 */
export function coverBackdropColor(hex: string | null): string | null {
  const lab = hex ? hexToOklab(hex) : null;
  if (!lab) return null;
  const L = 0.24 + Math.max(0, lab.L - 0.2) * 0.15;
  for (let scale = 0.75; scale >= 0; scale -= 0.05) {
    const candidate: Oklab = { L, a: lab.a * scale, b: lab.b * scale };
    if (oklabInGamut(candidate)) return rgbToHex(oklabToRgb(candidate));
  }
  return rgbToHex(oklabToRgb({ L, a: 0, b: 0 }));
}

/** Total OKLab distance walked along a sequence; a smoothness score for tests
 * and tuning (lower is smoother). */
export function pathLength(hexes: readonly string[]): number {
  let total = 0;
  for (let i = 1; i < hexes.length; i++) {
    const p = hexToOklab(hexes[i - 1]!);
    const q = hexToOklab(hexes[i]!);
    if (p && q) total += oklabDistance(p, q);
  }
  return total;
}
