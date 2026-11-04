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
  about: string;
  linkedin?: string;
};

/** What makes two submits the same attempt: the slot and every field, trimmed. */
export function attemptKey(fields: BookingFields): string {
  return JSON.stringify([
    fields.start,
    fields.length,
    fields.name.trim(),
    fields.email.trim().toLowerCase(),
    fields.about.trim(),
    fields.linkedin?.trim() ?? "",
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
