/**
 * Reading one moment in two time zones: the host's Home time zone, which the
 * booking API names, and the booker's own, from the browser. Every slot on
 * /meet shows both, so nobody does arithmetic.
 *
 * Formatters are cached per zone, since a week strip formats a few hundred
 * times a render and building an Intl.DateTimeFormat is the slow part.
 */

const MINUTE = 60_000;

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
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** The wall clock in `timeZone` at `ms`. */
export function zonedParts(ms: number, timeZone: string): ZonedParts {
  const parts: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(ms)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour! % 24,
    minute: parts.minute!,
    second: parts.second!,
  };
}

/** How far `timeZone`'s clock runs ahead of UTC at `ms`, in minutes. */
export function offsetMinutes(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MINUTE);
}

/** "2026-11-10" for the calendar date `ms` falls on in `timeZone`. */
export function zonedDate(ms: number, timeZone: string): string {
  const { year, month, day } = zonedParts(ms, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Minutes past midnight on `timeZone`'s clock at `ms`. */
export function minutesIntoDate(ms: number, timeZone: string): number {
  const { hour, minute } = zonedParts(ms, timeZone);
  return hour * 60 + minute;
}

/**
 * The moment `timeZone`'s clock reads `minutes` past midnight on `date`
 * (YYYY-MM-DD). On a spring-forward night a missing clock time lands just
 * after the gap, as calendars do.
 */
export function zonedTime(
  date: string,
  minutes: number,
  timeZone: string,
): number {
  const [y, m, d] = date.split("-").map(Number);
  const wall = Date.UTC(y!, m! - 1, d) + minutes * MINUTE;
  // Two passes settle the offset on either side of a transition.
  let guess = wall - offsetMinutes(wall, timeZone) * MINUTE;
  guess = wall - offsetMinutes(guess, timeZone) * MINUTE;
  return guess;
}

/** Whether both zones read the same clock at `ms`, whatever they're called. */
export function sameClock(ms: number, a: string, b: string): boolean {
  return offsetMinutes(ms, a) === offsetMinutes(ms, b);
}

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

function weekdayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d)).getUTCDay()]!;
}

/** "Tue" for "2026-11-10". */
export function weekdayLabel(date: string): string {
  return weekdayOf(date);
}

/** "Nov 10th" for "2026-11-10", the site's date style. */
export function dateLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[m! - 1]} ${d}${ordinalSuffix(d!)}`;
}

/** "Tue, Nov 10th" for "2026-11-10". */
export function dayLabel(date: string): string {
  return `${weekdayOf(date)}, ${dateLabel(date)}`;
}

/** "Nov 9th-15th" or "Nov 30th-Dec 6th", for a run of dates. */
export function rangeLabel(first: string, last: string): string {
  const [, m1] = first.split("-").map(Number);
  const [, m2, d2] = last.split("-").map(Number);
  if (first === last) return dateLabel(first);
  return m1 === m2
    ? `${dateLabel(first)}-${d2}${ordinalSuffix(d2!)}`
    : `${dateLabel(first)}-${dateLabel(last)}`;
}

/** "2:00 PM" or "11:30 AM" on `timeZone`'s clock. */
export function clockLabel(ms: number, timeZone: string): string {
  const { hour, minute } = zonedParts(ms, timeZone);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** "1:45-2:15 PM", or "11:30 AM-12:30 PM" across noon, for a narrow block. */
export function compactRangeLabel(
  start: number,
  end: number,
  timeZone: string,
): string {
  const [from, fromHalf] = clockLabel(start, timeZone).split(" ");
  const [to, toHalf] = clockLabel(end, timeZone).split(" ");
  return fromHalf === toHalf
    ? `${from}-${to} ${toHalf}`
    : `${from} ${fromHalf}-${to} ${toHalf}`;
}

/** "9a", "12p", or "5:30a" off the hour: the schedule's hour labels. */
export function hourLabel(ms: number, timeZone: string): string {
  const { hour, minute } = zonedParts(ms, timeZone);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const half = hour < 12 ? "a" : "p";
  return minute === 0
    ? `${twelve}${half}`
    : `${twelve}:${String(minute).padStart(2, "0")}${half}`;
}

/** "4:12" for the now pill: the clock without AM or PM. */
export function bareClockLabel(ms: number, timeZone: string): string {
  return clockLabel(ms, timeZone).split(" ")[0]!;
}

/**
 * A zone's everyday name: "PT", "ET", or Intl's "GMT+5:30" where no short
 * name exists. Bookers know their zone by this, not its IANA name.
 */
export function zoneLabel(ms: number, timeZone: string): string {
  try {
    const name = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortGeneric",
    })
      .formatToParts(ms)
      .find((part) => part.type === "timeZoneName")?.value;
    // "PT" and "ET" read well; "United Kingdom Time" and "GMT+1" don't.
    if (name && !/\s/.test(name) && !name.startsWith("GMT")) return name;
  } catch {
    // An engine without shortGeneric falls through to the offset.
  }
  const offset = offsetMinutes(ms, timeZone);
  if (offset === 0) return "GMT";
  const sign = offset > 0 ? "+" : "-";
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  return `GMT${sign}${hours}${minutes === 0 ? "" : `:${String(minutes).padStart(2, "0")}`}`;
}

/** "San Francisco" style city from an IANA name, for the host's line. */
export function zoneCity(timeZone: string): string {
  if (timeZone === "America/Los_Angeles") return "San Francisco";
  const city = timeZone.split("/").at(-1) ?? timeZone;
  return city.replace(/_/g, " ");
}

export type SlotSide = {
  /** The calendar date on this side's clock. */
  date: string;
  /** "Tue, Nov 10th". */
  day: string;
  /** "2:00 PM". */
  start: string;
  /** "2:30 PM". */
  end: string;
  /** "PT". */
  zone: string;
};

export type SlotText = {
  booker: SlotSide;
  host: SlotSide;
  /** Both clocks read the same, so one side is enough. */
  sameClock: boolean;
  /** The two sides fall on different dates. */
  dateDiffers: boolean;
};

function side(start: number, end: number, timeZone: string): SlotSide {
  const date = zonedDate(start, timeZone);
  return {
    date,
    day: dayLabel(date),
    start: clockLabel(start, timeZone),
    end: clockLabel(end, timeZone),
    zone: zoneLabel(start, timeZone),
  };
}

/** One slot read on both clocks. */
export function slotText(
  start: number,
  end: number,
  hostZone: string,
  bookerZone: string,
): SlotText {
  const booker = side(start, end, bookerZone);
  const host = side(start, end, hostZone);
  return {
    booker,
    host,
    sameClock: sameClock(start, hostZone, bookerZone),
    dateDiffers: booker.date !== host.date,
  };
}

/**
 * The slot as one sentence for screen readers and the confirmation:
 * "Tue, Nov 10th, 2:00 PM to 2:30 PM your time (11:00 AM PT for Chappy)".
 */
export function slotSentence(text: SlotText, host: string): string {
  const mine = `${text.booker.day}, ${text.booker.start} to ${text.booker.end} your time`;
  if (text.sameClock) return mine;
  const theirs = text.dateDiffers
    ? `${text.host.day}, ${text.host.start} ${text.host.zone}`
    : `${text.host.start} ${text.host.zone}`;
  return `${mine} (${theirs} for ${host})`;
}

/** The browser's own zone, or null where Intl can't say. */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
