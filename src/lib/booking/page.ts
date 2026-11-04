import { z } from "zod";

/**
 * A Booking link's page as Daybreak's `GET /book/<slug>` answers it: the
 * link's words, the host's Home time zone, the Days a booking can fall on,
 * each Day's open stretches in milliseconds since epoch, and the starts
 * Daybreak thinks suit the host best at the link's default length.
 */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const span = z.object({ start: z.number(), end: z.number() });

export const bookingPageSchema = z.object({
  link: z.object({
    slug: z.string(),
    title: z.string(),
    host: z.string(),
    lengths: z.array(z.number().positive()).min(1),
    defaultLength: z.number().positive(),
    call: z.object({
      kind: z.enum(["meet", "link", "place"]),
      location: z.string().optional(),
    }),
  }),
  timeZone: z.string().min(1),
  firstDay: day,
  lastDay: day,
  days: z.array(z.object({ day, open: z.array(span) })),
  suggested: z.array(z.number()),
});

export type BookingPage = z.infer<typeof bookingPageSchema>;
export type BookingDay = BookingPage["days"][number];
export type Span = BookingDay["open"][number];

export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `date` moved by `days` calendar days. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const moved = new Date(Date.UTC(y!, m! - 1, d! + days));
  return moved.toISOString().slice(0, 10);
}

/** Whole calendar days from `a` to `b`. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** How many Days the page reads at once, a week. */
export const WEEK = 7;

/**
 * The `from` of the week `offset` weeks after the first bookable Day, or
 * null past the last one.
 */
export function weekStart(
  firstDay: string,
  lastDay: string,
  offset: number,
): string | null {
  if (offset < 0) return null;
  const from = addDays(firstDay, offset * WEEK);
  return from > lastDay ? null : from;
}

/** A length's numbers and units: 90 is 1 "h" and 30 "m", as Daybreak writes. */
export function lengthParts(
  minutes: number,
): { value: number; unit: "h" | "m" }[] {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [
    ...(hours > 0 ? [{ value: hours, unit: "h" as const }] : []),
    ...(rest > 0 || hours === 0 ? [{ value: rest, unit: "m" as const }] : []),
  ];
}

/** "15 minutes", "1 hour", or "1 hour 30 minutes", for screen readers. */
export function lengthWords(minutes: number): string {
  return lengthParts(minutes)
    .map(({ value, unit }) =>
      unit === "h"
        ? `${value} hour${value === 1 ? "" : "s"}`
        : `${value} minute${value === 1 ? "" : "s"}`,
    )
    .join(" ");
}

/** "Google Meet", "Video call", or the place, for the call line. */
export function callLabel(call: BookingPage["link"]["call"]): string {
  switch (call.kind) {
    case "meet":
      return "Google Meet";
    case "link":
      return "Video call";
    case "place":
      return call.location ?? "In person";
  }
}
