import { describe, expect, it } from "vitest";

import {
  blockStart,
  callPhrase,
  isPrivateSlug,
  lengthLabel,
  lengthParts,
  lengthWords,
  windowStart,
} from "./page";
import {
  MESSAGES,
  REQUEST_ID,
  attemptFor,
  attemptKey,
  linkedinAddress,
  makeRequestId,
  readBookingAnswer,
  recoveryFor,
} from "./request";

describe("request IDs", () => {
  it("are 26 characters of Google's base32hex, as Daybreak takes", () => {
    for (let i = 0; i < 50; i++) {
      const id = makeRequestId();
      expect(id).toHaveLength(26);
      expect(id).toMatch(REQUEST_ID);
    }
  });

  it("map each byte to one of 32 characters, so none is favored", () => {
    const bytes = (b: Uint8Array) => b.map((_, i) => i * 10);
    expect(makeRequestId(bytes)).toBe("0aku8is6gq4eo2cm0aku8is6gq");
    expect(makeRequestId((b) => b.fill(255))).toBe("v".repeat(26));
  });

  it("stay the same on a retry of the same attempt and change otherwise", () => {
    let n = 0;
    const make = () => `id${++n}`;
    const fields = {
      start: 1,
      length: 30,
      name: "Ana",
      email: "ana@example.com",
      about: "Hi",
    };
    const first = attemptFor(null, attemptKey(fields), make);
    const retry = attemptFor(
      first,
      attemptKey({ ...fields, name: " Ana ", email: "ANA@example.com" }),
      make,
    );
    expect(retry.requestId).toBe(first.requestId);
    const moved = attemptFor(first, attemptKey({ ...fields, start: 2 }), make);
    expect(moved.requestId).not.toBe(first.requestId);
    const relabeled = attemptFor(
      first,
      attemptKey({ ...fields, linkedin: "linkedin.com/in/ana" }),
      make,
    );
    expect(relabeled.requestId).not.toBe(first.requestId);
  });
});

describe("Daybreak's answers", () => {
  it("reads a booking", () => {
    expect(
      readBookingAnswer(200, {
        booked: { start: 1, end: 2, title: "Ana 🤝 Chappy" },
      }),
    ).toEqual({
      ok: true,
      booked: { start: 1, end: 2, title: "Ana 🤝 Chappy" },
    });
  });

  it("shows a 400's own message, which says which field", () => {
    expect(
      readBookingAnswer(400, {
        error: {
          code: "invalid",
          message: "That email address doesn't look right",
        },
      }),
    ).toEqual({
      ok: false,
      code: "invalid",
      message: "That email address doesn't look right",
    });
    expect(readBookingAnswer(400, null)).toMatchObject({ code: "invalid" });
  });

  it("puts its own words on every other refusal", () => {
    const secret = { error: { code: "taken", message: "internal detail" } };
    expect(readBookingAnswer(409, secret)).toEqual({
      ok: false,
      code: "taken",
      message: MESSAGES.taken,
    });
    expect(readBookingAnswer(429, secret)).toMatchObject({
      code: "too_many",
      message: MESSAGES.tooMany,
    });
    expect(readBookingAnswer(503, secret)).toMatchObject({
      code: "closed",
      message: MESSAGES.closed,
    });
    expect(readBookingAnswer(404, secret)).toMatchObject({ code: "not_found" });
    expect(readBookingAnswer(500, secret)).toMatchObject({
      code: "unavailable",
    });
    // A 200 without a booking is no booking.
    expect(readBookingAnswer(200, { what: 1 })).toMatchObject({
      code: "unavailable",
    });
  });

  it("tells the page what to do next", () => {
    expect(recoveryFor("taken")).toBe("repick");
    expect(recoveryFor("invalid")).toBe("fix");
    expect(recoveryFor("challenge")).toBe("fix");
    expect(recoveryFor("unavailable")).toBe("retry");
    expect(recoveryFor("too_many")).toBe("stop");
    expect(recoveryFor("closed")).toBe("stop");
    expect(recoveryFor("not_found")).toBe("stop");
  });
});

describe("page helpers", () => {
  it("labels lengths", () => {
    expect(lengthParts(15)).toEqual([{ value: 15, unit: "m" }]);
    expect(lengthParts(60)).toEqual([{ value: 1, unit: "h" }]);
    expect(lengthParts(90)).toEqual([
      { value: 1, unit: "h" },
      { value: 30, unit: "m" },
    ]);
    expect(lengthLabel(30)).toBe("30m");
    expect(lengthLabel(90)).toBe("1h 30m");
    expect(lengthWords(30)).toBe("30 minutes");
    expect(lengthWords(60)).toBe("1 hour");
    expect(lengthWords(150)).toBe("2 hours 30 minutes");
  });

  it("names the call after a verb", () => {
    expect(callPhrase({ kind: "meet" })).toBe("on Google Meet");
    expect(callPhrase({ kind: "link" })).toBe("on a video call");
    expect(callPhrase({ kind: "place", location: "Home" })).toBe("in person");
  });

  it("treats a slug of 16 characters or more as private", () => {
    expect(isPrivateSlug("meet")).toBe(false);
    expect(isPrivateSlug("60")).toBe(false);
    expect(isPrivateSlug("a".repeat(15))).toBe(false);
    expect(isPrivateSlug("a".repeat(16))).toBe(true);
  });

  it("steps weeks and a phone's Days inside the bookable Days", () => {
    expect(windowStart("2026-11-10", "2026-11-30", 0)).toBe("2026-11-10");
    expect(windowStart("2026-11-10", "2026-11-30", 14)).toBe("2026-11-24");
    expect(windowStart("2026-11-10", "2026-11-30", 3)).toBe("2026-11-13");
    expect(windowStart("2026-11-10", "2026-11-30", 20)).toBe("2026-11-30");
    expect(windowStart("2026-11-10", "2026-11-30", 21)).toBeNull();
    expect(windowStart("2026-11-10", "2026-11-30", -1)).toBeNull();
  });

  it("reads in 28-Day blocks from the first bookable Day", () => {
    expect(blockStart("2026-11-10", 0)).toBe("2026-11-10");
    expect(blockStart("2026-11-10", 27)).toBe("2026-11-10");
    expect(blockStart("2026-11-10", 28)).toBe("2026-12-08");
  });
});

describe("the LinkedIn field", () => {
  it("makes a profile path or a handle a linkedin.com address", () => {
    expect(linkedinAddress("/in/ada")).toBe("linkedin.com/in/ada");
    expect(linkedinAddress(" in/ada-l ")).toBe("linkedin.com/in/ada-l");
    expect(linkedinAddress("ada")).toBe("linkedin.com/in/ada");
    expect(linkedinAddress("@ada")).toBe("linkedin.com/in/ada");
  });

  it("leaves an address, or nothing, as typed", () => {
    expect(linkedinAddress("https://www.linkedin.com/in/ada")).toBe(
      "https://www.linkedin.com/in/ada",
    );
    expect(linkedinAddress("linkedin.com/in/ada")).toBe("linkedin.com/in/ada");
    expect(linkedinAddress("  ")).toBe("");
  });
});
