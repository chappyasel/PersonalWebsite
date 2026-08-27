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
  const label = rounded === 1 && unit.endsWith("s") ? unit.slice(0, -1) : unit;
  return `${shortenValue(rounded)} ${label}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
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

const MONTHS_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * The workout-preview date, with the app's 60-day recency switch
 * (WorkoutTableViewCell): recent → .longWeekday "Thursday, August 13th",
 * older → .shortWeekdayYear "Thu, Aug 13th '26". `ts` is UTC
 * "YYYY-MM-DDTHH:MM".
 */
export function workoutDateLabel(ts: string, now: Date = new Date()): string {
  const date = new Date(`${ts}:00Z`);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const suffixed = `${d}${ordinalSuffix(d)}`;
  // Whole-calendar-day difference (UTC), matching the app's Date.days(since:)
  const days =
    Math.floor(now.getTime() / 86400_000) -
    Math.floor(date.getTime() / 86400_000);
  if (days < 60)
    return `${WEEKDAYS_FULL[date.getUTCDay()]}, ${MONTHS_FULL[m]} ${suffixed}`;
  return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[m]} ${suffixed} '${String(y).slice(2)}`;
}

/** Up to 3 decimals, trailing zeros trimmed — the app's sub-1000 rule */
function trimmed(value: number): number {
  return Number(value.toFixed(3));
}

/**
 * StringFormatter.format(duration:): "5:02" under an hour, "1:05:30" over.
 * Fractional seconds survive to 3 decimals ("0:59.5"), as in the app.
 */
export function formatClockDuration(seconds: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const wholeSecs = Math.floor(seconds);
  const frac = trimmed(seconds - wholeSecs);
  const fracPart = frac > 0 ? `${frac}`.slice(1) : "";
  const secPart = `${pad(wholeSecs % 60)}${fracPart}`;
  if (wholeSecs < 3600) return `${Math.floor(wholeSecs / 60)}:${secPart}`;
  return `${Math.floor(wholeSecs / 3600)}:${pad(Math.floor((wholeSecs % 3600) / 60))}:${secPart}`;
}

type WlaSet = {
  reps: number | null;
  weight: number | null;
  durationSeconds: number | null;
  distance: number | null;
  calories: number | null;
  custom: string | null;
};

/**
 * BTSet.description — the set-chip text, exact per style. Weights keep
 * their decimals ("5x187.5"); reps_weight has no spaces or unit.
 */
export function wlaSetDescription(set: WlaSet, style: string): string {
  const w = set.weight ?? 0;
  switch (style) {
    case "reps_weight":
      return `${set.reps ?? 0}x${w}`;
    case "reps":
      return `${set.reps ?? 0} ${set.reps === 1 ? "rep" : "reps"}`;
    case "duration_secs":
      return `${trimmed(set.durationSeconds ?? 0)} ${set.durationSeconds === 1 ? "sec" : "secs"}`;
    case "duration_secs_weight":
      return `${trimmed(set.durationSeconds ?? 0)}s (${w})`;
    case "dist_weight":
      // distance stored in miles; the app displays small distances in feet
      return `${trimmed((set.distance ?? 0) * 5280)}ft (${w})`;
    case "duration":
      return formatClockDuration(set.durationSeconds ?? 0);
    case "duration_dist":
      return `${formatClockDuration(set.durationSeconds ?? 0)}, ${set.distance ?? 0} mi`;
    case "duration_dist_cals":
      return `${formatClockDuration(set.durationSeconds ?? 0)}, ${set.distance ?? 0} mi (${trimmed(set.calories ?? 0)} ${set.calories === 1 ? "cal" : "cals"})`;
    case "duration_cals":
      return `${formatClockDuration(set.durationSeconds ?? 0)} (${trimmed(set.calories ?? 0)} ${set.calories === 1 ? "cal" : "cals"})`;
    case "custom":
    case "custom_multi":
      return set.custom ?? "-";
    default:
      return set.custom ?? "-";
  }
}

/**
 * Split a shortened value into the big part and the small multiplier
 * suffix, mirroring the share card's attributed strings where "k lbs"
 * renders smaller than "23.4".
 */
export function splitShortened(value: number): {
  main: string;
  suffix: string;
} {
  const shortened = shortenValue(value);
  const last = shortened.slice(-1);
  if (last >= "0" && last <= "9") return { main: shortened, suffix: "" };
  return { main: shortened.slice(0, -1), suffix: last };
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
export function toBackgroundColor(hex: string): {
  light: string;
  dark: string;
} {
  const c = hexToHsl(hex);
  return {
    light: hslCss({
      ...c,
      s: Math.max(40, c.s - 40),
      l: Math.min(90, c.l + 45),
    }),
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
