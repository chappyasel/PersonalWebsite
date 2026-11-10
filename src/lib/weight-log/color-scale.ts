import type { WeekTableRow } from "./week-table";

/**
 * The workbook's conditional formatting, rebuilt for the owner's weekly table.
 * Every phase tab has had the same two Excel color scales since mid-2023:
 *
 * - Daily weigh-ins: a 2-color scale from the lowest value (#FCFCFF) to the
 *   highest (#63BE7B), over every weigh-in in the phase.
 * - Average, Target, and Original target: one shared 3-color scale over all
 *   three columns, from the lowest value (#5A8AC6) through the 50th
 *   percentile (#FCFCFF) to the highest (#F8696B). Equal pounds get equal
 *   colors in any of the three columns.
 *
 * The workbook left the signed columns (change, both gaps, and lb/wk) plain.
 * The owner asked for them colored too, so each takes the same blue, white,
 * and red with white fixed at zero: blue for a drop, red for a rise.
 *
 * Excel interpolates each RGB channel linearly between neighbouring stops,
 * takes the 50th percentile as the median, and leaves blank cells uncolored.
 * Dark mode swaps the white stop for the dark card's background so cells
 * don't glare, and keeps the blue, red, and green ends.
 */

export type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

const EXCEL_WHITE = hexToRgb("#FCFCFF");
const GREEN = hexToRgb("#63BE7B");
const BLUE = hexToRgb("#5A8AC6");
const RED = hexToRgb("#F8696B");
/** The dark card's background, Tailwind's neutral-800. */
const DARK_CARD = hexToRgb("#262626");

/**
 * Text colors a filled cell chooses between. Black and white are the only
 * pair that keeps every fill at 4.5:1 or better, since a fill can land
 * anywhere between the dark card and the brightest stop.
 */
const DARK_TEXT = hexToRgb("#000000");
const LIGHT_TEXT = hexToRgb("#FFFFFF");

/** Each channel moved `t` of the way from `a` to `b`, rounded as Excel does. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const clamped = Math.min(1, Math.max(0, t));
  return [0, 1, 2].map((channel) =>
    Math.round(a[channel]! + (b[channel]! - a[channel]!) * clamped),
  ) as unknown as Rgb;
}

/** The median, which is Excel's 50th percentile (PERCENTILE.INC at 0.5). */
export function median(values: readonly number[]): number {
  if (!values.length) throw new Error("median of no values");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Where a value sits on a scale: which pair of stops, and how far along. */
type Position = { segment: 0 | 1; t: number };

function twoStopPosition(values: readonly number[]) {
  if (!values.length) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  // A range of one distinct value takes the low color.
  return (value: number): Position => ({
    segment: 0,
    t: high === low ? 0 : (value - low) / (high - low),
  });
}

function threeStopPosition(values: readonly number[]) {
  if (!values.length) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const middle = median(values);
  // A range of one distinct value takes the middle color.
  return (value: number): Position =>
    value <= middle
      ? { segment: 0, t: middle === low ? 1 : (value - low) / (middle - low) }
      : {
          segment: 1,
          t: high === middle ? 0 : (value - middle) / (high - middle),
        };
}

/** One filled cell in both themes, with readable text on each fill. */
export interface CellColor {
  light: { background: string; text: string };
  dark: { background: string; text: string };
}

/** WCAG relative luminance of an sRGB color. */
function luminance(color: Rgb) {
  const [r, g, b] = color.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: Rgb, b: Rgb) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (high + 0.05) / (low + 0.05);
}

/** Dark or light text, whichever contrasts more with the fill. */
export function readableText(background: Rgb): Rgb {
  return contrast(background, DARK_TEXT) >= contrast(background, LIGHT_TEXT)
    ? DARK_TEXT
    : LIGHT_TEXT;
}

function cell(light: Rgb, dark: Rgb): CellColor {
  return {
    light: { background: rgbToHex(light), text: rgbToHex(readableText(light)) },
    dark: { background: rgbToHex(dark), text: rgbToHex(readableText(dark)) },
  };
}

/** The daily weigh-in scale, white (or the dark card) to green. */
export function weighInScale(values: readonly number[]) {
  const position = twoStopPosition(values);
  if (!position) return () => null;
  return (value: number): CellColor => {
    const { t } = position(value);
    return cell(mix(EXCEL_WHITE, GREEN, t), mix(DARK_CARD, GREEN, t));
  };
}

/** The shared Average, Target, and Original target scale, blue to red. */
export function targetScale(values: readonly number[]) {
  const position = threeStopPosition(values);
  if (!position) return () => null;
  return (value: number): CellColor => {
    const { segment, t } = position(value);
    return segment === 0
      ? cell(mix(BLUE, EXCEL_WHITE, t), mix(BLUE, DARK_CARD, t))
      : cell(mix(EXCEL_WHITE, RED, t), mix(DARK_CARD, RED, t));
  };
}

/**
 * A signed column's scale: blue below zero, white at zero, and red above, as
 * Excel's 3-color scale with its midpoint set to the number 0. Both sides
 * reach full color at the column's largest distance from zero, so a drop and a
 * rise of the same size get the same strength.
 */
export function signedScale(values: readonly number[]) {
  if (!values.length) return () => null;
  const reach = Math.max(...values.map(Math.abs));
  return (value: number): CellColor => {
    const t = reach === 0 ? 0 : Math.abs(value) / reach;
    const end = value < 0 ? BLUE : RED;
    return cell(mix(EXCEL_WHITE, end, t), mix(DARK_CARD, end, t));
  };
}

/** The weekly table's signed columns, each colored on a scale of its own. */
export const SIGNED_COLUMNS = [
  "change",
  "gapToTarget",
  "poundsPerWeek",
  "gapToOriginalTarget",
] as const;
type SignedColumn = (typeof SIGNED_COLUMNS)[number];

/** The colors for one row of the weekly table. Null means no fill. */
export type WeekRowColors = {
  days: (CellColor | null)[];
  average: CellColor | null;
  target: CellColor | null;
  originalTarget: CellColor | null;
} & Record<SignedColumn, CellColor | null>;

const present = (value: number | null): value is number => value !== null;

/**
 * Colors for a phase's weekly table, every scale computed over the rows
 * given. Excluded weigh-ins get no fill and stay out of the green scale's
 * range.
 */
export function weekTableColors(
  rows: readonly Pick<
    WeekTableRow,
    | "weights"
    | "excludedDays"
    | "average"
    | "target"
    | "originalTarget"
    | SignedColumn
  >[],
): WeekRowColors[] {
  const counted = (row: (typeof rows)[number]) =>
    row.weights.map((weight, day) =>
      row.excludedDays.includes(day) ? null : weight,
    );
  const green = weighInScale(
    rows.flatMap((row) => counted(row).filter(present)),
  );
  const shared = targetScale(
    rows.flatMap((row) =>
      [row.average, row.target, row.originalTarget].filter(present),
    ),
  );
  const fill =
    (scale: (value: number) => CellColor | null) => (value: number | null) =>
      value === null ? null : scale(value);
  const signed = Object.fromEntries(
    SIGNED_COLUMNS.map((column) => [
      column,
      fill(signedScale(rows.map((row) => row[column]).filter(present))),
    ]),
  ) as Record<SignedColumn, (value: number | null) => CellColor | null>;
  return rows.map((row) => ({
    days: counted(row).map(fill(green)),
    average: fill(shared)(row.average),
    target: fill(shared)(row.target),
    originalTarget: fill(shared)(row.originalTarget),
    change: signed.change(row.change),
    gapToTarget: signed.gapToTarget(row.gapToTarget),
    poundsPerWeek: signed.poundsPerWeek(row.poundsPerWeek),
    gapToOriginalTarget: signed.gapToOriginalTarget(row.gapToOriginalTarget),
  }));
}
