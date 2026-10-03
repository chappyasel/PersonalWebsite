import { describe, expect, it } from "vitest";

import { isValidYoutubeAccessToken, youtubeAccessToken } from "./access";

describe("YouTube access tokens", () => {
  it("rejects missing and arbitrary values", () => {
    expect(isValidYoutubeAccessToken(undefined, "correct-password")).toBe(
      false,
    );
    expect(isValidYoutubeAccessToken("", "correct-password")).toBe(false);
    expect(isValidYoutubeAccessToken("authenticated", "correct-password")).toBe(
      false,
    );
  });

  it("rejects same-code-unit-length non-ASCII values without throwing", () => {
    const malformed = "é".repeat(64);

    expect(() =>
      isValidYoutubeAccessToken(malformed, "correct-password"),
    ).not.toThrow();
    expect(isValidYoutubeAccessToken(malformed, "correct-password")).toBe(
      false,
    );
  });

  it("accepts only a token signed with the current password", () => {
    const token = youtubeAccessToken("correct-password");

    expect(isValidYoutubeAccessToken(token, "correct-password")).toBe(true);
    expect(isValidYoutubeAccessToken(token, "rotated-password")).toBe(false);
  });
});
