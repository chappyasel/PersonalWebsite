import { type BookingPage, READ_DAYS, addDays } from "~/lib/booking/page";
import {
  type BookResult,
  type BookingFields,
  readBookingAnswer,
} from "~/lib/booking/request";
import { MINUTE, fits } from "~/lib/booking/slots";
import { zonedDate, zonedTime } from "~/lib/booking/zones";

/**
 * Canned open time for running /meet without a Daybreak deployment, with
 * `DAYBREAK_BOOKING_URL=fixture` in development. Production never serves it
 * (bookingConfig turns it off there).
 *
 * It serves three one-length links, `meet` (30 minutes), `15`, and `60`,
 * and no other. Weekdays open 9 to 6 in San Francisco less a few busy stretches that
 * change by date, weekends stay closed, and the first three weekdays
 * suggest the slot right after their lunch Meeting. Booking answers like
 * the deployment: an "about" line with "taken" answers 409, one with
 * "limit" answers 429, and anything else books.
 */

const ZONE = "America/Los_Angeles";
/** As far ahead as the Owner's links book, 60 days. */
const DAYS_AHEAD = 60;
const NOTICE = 4 * 60 * MINUTE;

/** One link per length, as the Owner sends them: /meet, /meet/15, /meet/60. */
const LINKS: Record<string, BookingPage["link"]> = Object.fromEntries(
  (
    [
      ["meet", 30],
      ["15", 15],
      ["60", 60],
    ] as const
  ).map(([slug, length]) => [
    slug,
    {
      slug,
      title: "Meet with Chappy",
      host: "Chappy",
      lengths: [length],
      defaultLength: length,
      call: { kind: "meet" },
    },
  ]),
);

/** Busy stretches by date, as clock minutes, so the week looks lived in. */
function busyOn(date: string): [number, number][] {
  const seed = [...date].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const lunch: [number, number] = [12 * 60, 13 * 60];
  const morning: [number, number] =
    seed % 3 === 0 ? [10 * 60, 11 * 60 + 30] : [9 * 60 + 30, 10 * 60];
  const afternoon: [number, number] =
    seed % 2 === 0 ? [15 * 60, 16 * 60] : [14 * 60 + 30, 15 * 60 + 15];
  return [morning, lunch, afternoon];
}

function openOn(date: string, now: number) {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y!, m! - 1, d)).getUTCDay();
  if (weekday === 0 || weekday === 6) return [];
  const open: { start: number; end: number }[] = [];
  let cursor = 9 * 60;
  for (const [start, end] of [...busyOn(date), [18 * 60, 18 * 60]]) {
    if (start! > cursor) {
      open.push({
        start: zonedTime(date, cursor, ZONE),
        end: zonedTime(date, start!, ZONE),
      });
    }
    cursor = Math.max(cursor, end!);
  }
  const earliest = Math.ceil((now + NOTICE) / (15 * MINUTE)) * 15 * MINUTE;
  return open
    .map((s) => ({ start: Math.max(s.start, earliest), end: s.end }))
    .filter((s) => s.end - s.start >= 15 * MINUTE);
}

/** The link's week from `from`, or null for a slug the fixture doesn't know. */
export function fixturePage(
  slug: string,
  from: string | undefined,
  now: number,
): BookingPage | null {
  const link = LINKS[slug];
  if (!link) return null;
  const firstDay = zonedDate(now + NOTICE, ZONE);
  const lastDay = addDays(zonedDate(now, ZONE), DAYS_AHEAD - 1);
  const start = !from || from < firstDay ? firstDay : from;
  const days = [];
  for (let i = 0; i < READ_DAYS; i++) {
    const day = addDays(start, i);
    if (day > lastDay) break;
    days.push({ day, open: openOn(day, now) });
  }
  const suggested = days
    .flatMap(({ day, open }) => {
      const afterLunch = zonedTime(day, 13 * 60, ZONE);
      return open.some((s) => s.start === afterLunch) ? [afterLunch] : [];
    })
    .slice(0, 3);
  return { link, timeZone: ZONE, firstDay, lastDay, days, suggested };
}

export function fixtureBook(
  slug: string,
  fields: BookingFields,
  now: number,
): BookResult {
  const link = LINKS[slug];
  if (!link) return readBookingAnswer(404, { error: { code: "not_found" } });
  const about = fields.about?.toLowerCase() ?? "";
  if (about.includes("taken")) {
    return readBookingAnswer(409, { error: { code: "taken" } });
  }
  if (about.includes("limit")) {
    return readBookingAnswer(429, { error: { code: "too_many" } });
  }
  if (
    !fields.name.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())
  ) {
    return readBookingAnswer(400, {
      error: {
        code: "invalid",
        message: "That email address doesn't look right",
      },
    });
  }
  const date = zonedDate(fields.start, ZONE);
  if (
    !link.lengths.includes(fields.length) ||
    !fits(openOn(date, now), fields.start, fields.length)
  ) {
    return readBookingAnswer(409, { error: { code: "taken" } });
  }
  return readBookingAnswer(200, {
    booked: {
      start: fields.start,
      end: fields.start + fields.length * MINUTE,
      // Daybreak's style: the about line goes in the invite's description.
      title: `${fields.name.trim().split(/\s+/)[0]} 🤝 ${link.host}`,
    },
  });
}
