/**
 * The booking request the page sends, its request ID, and what each answer
 * means for the page. Shared by the server proxy and the browser.
 */

/** Google's event ID alphabet, base32hex in lowercase, which Daybreak's request IDs use. */
export const REQUEST_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuv";
export const REQUEST_ID = /^[0-9a-v]{20,64}$/;

/**
 * A fresh request ID: 26 characters of base32hex. 256 is a multiple of 32,
 * so taking each random byte modulo 32 keeps every character equally likely.
 */
export function makeRequestId(
  random: (bytes: Uint8Array) => Uint8Array = (bytes) =>
    crypto.getRandomValues(bytes),
): string {
  return [...random(new Uint8Array(26))]
    .map((byte) => REQUEST_ID_ALPHABET[byte % 32])
    .join("");
}

export type Attempt = { key: string; requestId: string };

/**
 * The attempt a submit belongs to. Sending the same slot and fields again,
 * as after a dropped connection, reuses the request ID, so Daybreak answers
 * the first booking instead of making a second. Anything changed is a new
 * attempt with a new ID.
 */
export function attemptFor(
  previous: Attempt | null,
  key: string,
  make: () => string = makeRequestId,
): Attempt {
  return previous?.key === key ? previous : { key, requestId: make() };
}

export type BookingFields = {
  start: number;
  length: number;
  name: string;
  email: string;
  /** What it's about, optional: one line for the invite. */
  about?: string;
  linkedin?: string;
  /** The booker's phone number, so the host can call if the call link fails. */
  phone?: string;
  /** Others the booker brings, up to GUESTS_MOST, each invited too. */
  guests?: Guest[];
  /** The booker's own name for the meeting, which the title leads with. */
  meetingName?: string;
};

export type Guest = { email: string; name?: string };

/** Guests a booker may bring, besides themselves (Daybreak's GUESTS_MOST). */
export const GUESTS_MOST = 5;
/** A meeting name's most characters (Daybreak's MEETING_NAME_LENGTH). */
export const MEETING_NAME_LENGTH = 40;

/**
 * The invite's title before " 🤝 <host>", as Daybreak's `eventTitle` makes
 * it, so the form can show it as it'll read: the booker's first name; with
 * guests, the first two people with a name and a count of the rest, "Ana &
 * Ben", "Ana +1", "Ana, Ben +2"; or the booker's own meeting name.
 */
export function titleLead(
  name: string,
  guests: { name?: string }[] = [],
  meetingName?: string,
): string {
  const named = meetingName?.replace(/\s+/g, " ").trim();
  if (named) return named;
  const first = (whole: string) => whole.trim().split(/\s+/)[0] ?? "";
  const people = [
    first(name),
    ...guests.flatMap((guest) =>
      guest.name?.trim() ? [first(guest.name)] : [],
    ),
  ].slice(0, 2);
  const rest = 1 + guests.length - people.length;
  return people.length === 2 && rest === 0
    ? people.join(" & ")
    : `${people.join(", ")}${rest > 0 ? ` +${rest}` : ""}`;
}

/**
 * A LinkedIn field as Daybreak takes it, a linkedin.com address. The field
 * shows "/in/you", so "/in/ada" and "in/ada" are a profile path, and a bare
 * handle like "ada" or "@ada" is the handle. Anything else, such as a full
 * address, goes as typed for Daybreak to check.
 */
export function linkedinAddress(typed: string): string {
  const trimmed = typed.trim();
  if (!trimmed) return "";
  const path = /^\/?(in\/\S+)$/i.exec(trimmed);
  if (path) return `linkedin.com/${path[1]}`;
  if (!/[./\s]/.test(trimmed)) {
    return `linkedin.com/in/${trimmed.replace(/^@/, "")}`;
  }
  return trimmed;
}

/** What makes two submits the same attempt: the slot and every field, trimmed. */
export function attemptKey(fields: BookingFields): string {
  return JSON.stringify([
    fields.start,
    fields.length,
    fields.name.trim(),
    fields.email.trim().toLowerCase(),
    fields.about?.trim() ?? "",
    fields.linkedin?.trim() ?? "",
    fields.phone?.trim() ?? "",
    (fields.guests ?? []).map((guest) => [
      guest.email.trim().toLowerCase(),
      guest.name?.trim() ?? "",
    ]),
    fields.meetingName?.trim() ?? "",
  ]);
}

export type Booked = { start: number; end: number; title: string };

export type BookingErrorCode =
  /** Daybreak refused a field; its message says which and is safe to show. */
  | "invalid"
  /** The time was just taken. */
  | "taken"
  /** A limit on bookings. */
  | "too_many"
  /** The host can't take bookings, or this site isn't set up to. */
  | "closed"
  /** No such link. */
  | "not_found"
  /** The person check failed or expired. */
  | "challenge"
  /** Daybreak couldn't be reached or answered something unexpected. */
  | "unavailable";

export type BookResult =
  | { ok: true; booked: Booked }
  | { ok: false; code: BookingErrorCode; message: string };

/** What the page does after a failed booking. */
export type Recovery =
  /** Refresh the Days, clear the time, and ask for another. */
  | "repick"
  /** Let the booker fix a field and send again. */
  | "fix"
  /** Send the same attempt again, with the same request ID. */
  | "retry"
  /** Nothing to do from here. */
  | "stop";

export function recoveryFor(code: BookingErrorCode): Recovery {
  switch (code) {
    case "taken":
      return "repick";
    case "invalid":
    case "challenge":
      return "fix";
    case "unavailable":
      return "retry";
    case "too_many":
    case "closed":
    case "not_found":
      return "stop";
  }
}

export const MESSAGES = {
  taken: "That time was just taken. Pick another.",
  tooMany: "Too many bookings from here for now. Try again later.",
  closed: "Booking isn't open right now.",
  notFound: "This booking link isn't open.",
  challenge: "The check that you're a person didn't go through. Try it again.",
  unavailable: "Couldn't reach the calendar. Try again.",
} as const;

/**
 * Daybreak's answer to `POST /book/<slug>`, read into a BookResult. Only a
 * 400's message reaches the booker word for word; every other refusal gets
 * this page's own words.
 */
export function readBookingAnswer(status: number, body: unknown): BookResult {
  const object = typeof body === "object" && body !== null ? body : {};
  if (status >= 200 && status < 300 && "booked" in object) {
    const booked = object.booked as Partial<Booked> | null;
    if (
      typeof booked?.start === "number" &&
      typeof booked.end === "number" &&
      typeof booked.title === "string"
    ) {
      return {
        ok: true,
        booked: { start: booked.start, end: booked.end, title: booked.title },
      };
    }
  }
  const error =
    "error" in object && typeof object.error === "object" && object.error
      ? (object.error as { code?: unknown; message?: unknown })
      : {};
  switch (status) {
    case 400:
      return {
        ok: false,
        code: "invalid",
        message:
          typeof error.message === "string" && error.message.trim() !== ""
            ? error.message
            : "Something in the form doesn't look right.",
      };
    case 404:
      return { ok: false, code: "not_found", message: MESSAGES.notFound };
    case 409:
      return { ok: false, code: "taken", message: MESSAGES.taken };
    case 429:
      return { ok: false, code: "too_many", message: MESSAGES.tooMany };
    case 503:
      return { ok: false, code: "closed", message: MESSAGES.closed };
    default:
      return { ok: false, code: "unavailable", message: MESSAGES.unavailable };
  }
}
