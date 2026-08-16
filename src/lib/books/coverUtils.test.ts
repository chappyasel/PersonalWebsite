import { describe, expect, it } from "vitest";

import { enhanceCoverUrl } from "./coverUtils";

describe("enhanceCoverUrl", () => {
  it("removes Google Books' page-curl treatment", () => {
    const source =
      "https://books.google.com/books/content?id=example&printsec=frontcover&img=1&zoom=2&edge=curl&source=gbs_api";
    const enhanced = new URL(enhanceCoverUrl(source)!);

    expect(enhanced.searchParams.get("zoom")).toBe("1");
    expect(enhanced.searchParams.get("fife")).toBe("w800");
    expect(enhanced.searchParams.has("edge")).toBe(false);
  });

  it("leaves malformed external cover values non-fatal", () => {
    const malformed = "books.google.com/books/content?id=example";

    expect(() => enhanceCoverUrl(malformed)).not.toThrow();
    expect(enhanceCoverUrl(malformed)).toBe(malformed);
  });

  it("does not rewrite unrelated URLs that mention Google Books", () => {
    const unrelated =
      "https://example.com/cover?redirect=https://books.google.com/example";

    expect(enhanceCoverUrl(unrelated)).toBe(unrelated);
  });
});
