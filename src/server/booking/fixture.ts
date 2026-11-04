import { type BookingPage, WEEK, addDays } from "~/lib/booking/page";
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
 * Weekdays open 9 to 6 in San Francisco less a few busy stretches that
 * change by date, weekends stay closed, and the first three weekdays
 * suggest the slot right after their lunch Meeting. Booking answers like
 * the deployment: an "about" line with "taken" answers 409, one with
 * "limit" answers 429, and anything else books.
 */

const ZONE = "America/Los_Angeles";
const DAYS_AHEAD = 21;
const NOTICE = 4 * 60 * MINUTE;

const LINK: BookingPage["link"] = {
  slug: "meet",
  title: "Meet with Chappy",
  host: "Chappy",
  lengths: [15, 30, 45, 60],
  defaultLength: 30,
  call: { kind: "meet" },
};

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

export function fixturePage(
  from: string | undefined,
  now: number,
): BookingPage {
  const firstDay = zonedDate(now + NOTICE, ZONE);
  const lastDay = addDays(zonedDate(now, ZONE), DAYS_AHEAD - 1);
  const start = !from || from < firstDay ? firstDay : from;
  const days = [];
  for (let i = 0; i < WEEK; i++) {
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
  return { link: LINK, timeZone: ZONE, firstDay, lastDay, days, suggested };
}

export function fixtureBook(fields: BookingFields, now: number): BookResult {
  const about = fields.about.toLowerCase();
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
    !LINK.lengths.includes(fields.length) ||
    !fits(openOn(date, now), fields.start, fields.length)
  ) {
    return readBookingAnswer(409, { error: { code: "taken" } });
  }
  return readBookingAnswer(200, {
    booked: {
      start: fields.start,
      end: fields.start + fields.length * MINUTE,
      title: `${fields.name.trim().split(/\s+/)[0]} <> ${LINK.host}: ${fields.about.trim()}`,
    },
  });
}
