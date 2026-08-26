/**
 * Formatting and color rules ported from the WeightliftingApp source so the
 * exercise pages read exactly like the app.
 *
 * - shortenValue: StringFormatter.format(value:) — k/m/b shortening to 3
 *   significant digits, no thousands separators ("12.3k", "999.5").
 * - formatValueUnit: format(value:unit:) — "{shortened} {unit}" with
 *   depluralization at exactly 1 ("1 rep", "24 reps").
 * - ordinalDate: .noWeekdayYear — "Jun 14th '26".
 * - toBackgroundColor / toTextColor: UIColor+Util.swift HSL transforms that
 *   turn a category color into the segmented-control selection pastel and
 *   its matching text color.
 */

export function shortenValue(value: number): string {
  const abs = Math.abs(value);
  const short = (v: number, suffix: string) => {
    // three significant digits, trailing zeros trimmed
    const scaled = Number(v.toPrecision(3));
    return `${scaled}${suffix}`;
  };
  if (abs < 1000) return `${Number(value.toFixed(3))}`;
  if (abs < 1_000_000) return short(value / 1000, "k");
  if (abs < 1_000_000_000) return short(value / 1_000_000, "m");
  return short(value / 1_000_000_000, "b");
}

export function formatValueUnit(value: number, unit: string): string {
  const rounded = Math.round(value);
  const label =
    rounded === 1 && unit.endsWith("s") ? unit.slice(0, -1) : unit;
  return `${shortenValue(rounded)} ${label}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

/** "Jun 14th '26" from "2026-06-14" */
export function ordinalDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  const day = parseInt(d!);
  return `${MONTHS[parseInt(m!) - 1]} ${day}${ordinalSuffix(day)} '${y!.slice(2)}`;
}

/** "6/14/26" from "2026-06-14" — the graph x-axis format (M/d/yy) */
export function slashDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${parseInt(m!)}/${parseInt(d!)}/${y!.slice(2)}`;
}

// ── UIColor+Util.swift HSL transforms (S and L on a 0-100 scale) ─────

type Hsl = { h: number; s: number; l: number };

function hexToHsl(hex: string): Hsl {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslCss({ h, s, l }: Hsl): string {
  return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`;
}

/** Selection-box pastel of a category color (light and dark variants) */
export function toBackgroundColor(hex: string): { light: string; dark: string } {
  const c = hexToHsl(hex);
  return {
    light: hslCss({ ...c, s: Math.max(40, c.s - 40), l: Math.min(90, c.l + 45) }),
    dark: hslCss({ ...c, l: Math.max(15, c.l - 35) }),
  };
}

/** Selection text color paired with toBackgroundColor */
export function toTextColor(hex: string): { light: string; dark: string } {
  const c = hexToHsl(hex);
  return {
    light: hslCss({ ...c, l: Math.max(15, c.l - 5) }),
    dark: hslCss({ ...c, l: Math.min(90, c.l + 5) }),
  };
}
