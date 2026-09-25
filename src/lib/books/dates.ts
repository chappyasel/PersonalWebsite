/** Book dates are Pacific calendar days: the day Chappy typed into Notion. */
export const BOOK_DATE_TIME_ZONE = "America/Los_Angeles";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** How far `timeZone`'s wall clock runs ahead of UTC at `ms` (negative west). */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(ms);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)!.value);
  const wallClock = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return wallClock - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant a Notion date names. A date-only value ("2026-09-23") is the
 * start of that day in Pacific time, 07:00 or 08:00 UTC, so it formats as
 * that day in Pacific time and its UTC calendar date is still the day typed.
 * A value with a time keeps its own offset.
 */
export function notionDateToInstant(value: string): Date {
  const match = DATE_ONLY.exec(value);
  if (!match) return new Date(value);
  const utcMidnight = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  // Guess with the offset at UTC midnight, then take the offset in force at
  // the guess itself, in case a clock change falls between the two.
  const guess = utcMidnight - zoneOffsetMs(utcMidnight, BOOK_DATE_TIME_ZONE);
  return new Date(utcMidnight - zoneOffsetMs(guess, BOOK_DATE_TIME_ZONE));
}
