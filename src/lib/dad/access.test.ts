import { describe, expect, it } from "vitest";

import {
  dadAccessCookieOptions,
  dadAccessToken,
  isValidDadAccessToken,
  isValidDadPassword,
} from "./access";

describe("Dad access tokens", () => {
  it("rejects missing and arbitrary values", () => {
    expect(isValidDadAccessToken(undefined, "correct-password")).toBe(false);
    expect(isValidDadAccessToken("authenticated", "correct-password")).toBe(
      false,
    );
    expect(isValidDadAccessToken("not-a-token", "correct-password")).toBe(
      false,
    );
  });

  it("rejects same-code-unit-length non-ASCII values without throwing", () => {
    const malformed = "é".repeat(64);

    expect(() =>
      isValidDadAccessToken(malformed, "correct-password"),
    ).not.toThrow();
    expect(isValidDadAccessToken(malformed, "correct-password")).toBe(false);
  });

  it("accepts only a token signed with the current password", () => {
    const token = dadAccessToken("correct-password");

    expect(isValidDadAccessToken(token, "correct-password")).toBe(true);
    expect(isValidDadAccessToken(token, "rotated-password")).toBe(false);
  });

  it("compares submitted passwords through fixed-length digests", () => {
    expect(isValidDadPassword("correct-password", "correct-password")).toBe(
      true,
    );
    expect(isValidDadPassword("wrong-password", "correct-password")).toBe(
      false,
    );
  });

  it("uses the parent domain on canonical production hosts", () => {
    expect(dadAccessCookieOptions("chappyasel.com", true).domain).toBe(
      ".chappyasel.com",
    );
    expect(
      dadAccessCookieOptions("books.chappyasel.com:443", true).domain,
    ).toBe(".chappyasel.com");
  });

  it("keeps localhost and preview cookies host-only", () => {
    expect(
      dadAccessCookieOptions("localhost:3000", false).domain,
    ).toBeUndefined();
    expect(
      dadAccessCookieOptions("personal-website.vercel.app", true).domain,
    ).toBeUndefined();
  });
});
