import { describe, expect, it } from "vitest";

import { findRateLimitError, retryAfterMs } from "./rateLimiter";

const notion429 = {
  code: "rate_limited",
  status: 429,
  headers: new Headers(),
  additional_data: { retry_after: "23" },
};

describe("Notion rate-limit backoff", () => {
  it("reads the wait from the error body, which is where Notion puts it", () => {
    expect(retryAfterMs(notion429)).toBe(23_250);
  });

  it("falls back to the Retry-After header", () => {
    expect(
      retryAfterMs({ status: 429, headers: new Headers({ "retry-after": "5" }) }),
    ).toBe(5_250);
  });

  it("gives up on the wait when neither source is usable", () => {
    expect(retryAfterMs({ status: 429, headers: new Headers() })).toBeUndefined();
    expect(retryAfterMs({ status: 429 })).toBeUndefined();
  });

  it("sees a 429 through a wrapper that rethrew with cause", () => {
    const wrapped = new Error("Failed to fetch book details", {
      cause: notion429,
    });
    expect(findRateLimitError(wrapped)).toBe(notion429);
  });

  it("does not mistake other failures for rate limits", () => {
    expect(findRateLimitError(new Error("boom"))).toBeUndefined();
    expect(findRateLimitError({ status: 404, code: "object_not_found" })).toBeUndefined();
  });
});
