import { type BookingDay, daysBetween } from "./page";
import { minutesIntoDate, zonedDate, zonedTime } from "./zones";

/**
 * The week strip's vertical axis: the host's wall clock on each Day, so 9
 * AM lines up across the week even on a daylight saving Day.
 */

/** The wall-clock minute `ms` reads on `day`'s clock in `timeZone`; past midnight runs over 1440. */
export function minuteOnDay(ms: number, day: string, timeZone: string): number {
  return (
    minutesIntoDate(ms, timeZone) +
    daysBetween(day, zonedDate(ms, timeZone)) * 1440
  );
}

/** The moment `day`'s wall clock reads `minute`. */
export function momentOnDay(
  day: string,
  minute: number,
  timeZone: string,
): number {
  return zonedTime(day, minute, timeZone);
}

/**
 * The minutes the strip shows: from the earliest open time across `days`
 * to the latest, widened to whole hours, and 9 to 6 when nothing is open.
 */
export function axisBounds(
  days: BookingDay[],
  timeZone: string,
): { start: number; end: number } {
  let start = Infinity;
  let end = -Infinity;
  for (const { day, open } of days) {
    for (const stretch of open) {
      start = Math.min(start, minuteOnDay(stretch.start, day, timeZone));
      end = Math.max(end, minuteOnDay(stretch.end, day, timeZone));
    }
  }
  if (!Number.isFinite(start)) return { start: 9 * 60, end: 18 * 60 };
  return {
    start: Math.floor(start / 60) * 60,
    end: Math.max(Math.ceil(end / 60) * 60, Math.floor(start / 60) * 60 + 60),
  };
}

/** The whole hours on the axis, as minutes, for its lines and labels. */
export function axisHours(bounds: { start: number; end: number }): number[] {
  const hours: number[] = [];
  for (let minute = bounds.start; minute <= bounds.end; minute += 60) {
    hours.push(minute);
  }
  return hours;
}
