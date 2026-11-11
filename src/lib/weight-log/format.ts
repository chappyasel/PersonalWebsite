import { roundTenth } from "./sheet";

/**
 * How the Weight Log writes pounds and weeks. The editor's weekly table, the
 * Log Weight card, and the notification line all use these, so they never
 * disagree by a tenth on a mean such as 150.35.
 */

/** Pounds to one decimal place, or a dash for none. */
export function pounds(value: number | null) {
  return value === null ? "—" : value.toFixed(1);
}

/** A difference to one decimal, with its sign. Zero has none. */
export function signed(value: number | null) {
  if (value === null) return "—";
  const rounded = roundTenth(value);
  if (rounded === 0) return "0.0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}`;
}

/**
 * A weekly rate to one decimal, with its sign, as the owner reads every
 * column. Halves round away from zero, so a cut's −0.25 reads as −0.3 just
 * as a bulk's +0.25 reads as +0.3. The plan still stores six decimals, and
 * the edit field shows two.
 */
export function rate(value: number | null) {
  if (value === null) return "—";
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  if (rounded === 0) return "0.0";
  return `${value > 0 ? "+" : "−"}${rounded.toFixed(1)}`;
}

/**
 * A week's Monday as the weekly table's Week column writes it: "Nov 9", with
 * the year only when it isn't today's. `{ year: false }` never writes it,
 * as on the Log Weight card, where the next year is plain from the order.
 */
export function weekLabel(
  week: string,
  today: string,
  { year = true }: { year?: boolean } = {},
) {
  return new Date(`${week}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year:
      year && week.slice(0, 4) !== today.slice(0, 4) ? "numeric" : undefined,
  });
}
