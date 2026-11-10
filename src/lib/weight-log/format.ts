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

/** A weekly rate to two decimals, as the plan stores it, with its sign. */
export function rate(value: number | null) {
  if (value === null) return "—";
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return "0.00";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(2)}`;
}

/**
 * A week's Monday as the weekly table's Week column writes it: "Nov 9", with
 * the year only when it isn't today's.
 */
export function weekLabel(week: string, today: string) {
  return new Date(`${week}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: week.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
  });
}
