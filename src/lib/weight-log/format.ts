import { roundTenth } from "./sheet";

/**
 * How the Weight Log writes pounds. The editor's weekly table, the Log
 * Weight card, and the notification line all use these, so they never
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
