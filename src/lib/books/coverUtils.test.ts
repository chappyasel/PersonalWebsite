import { describe, expect, it } from "vitest";

import { enhanceCoverUrl, stripCoverCurl } from "./coverUtils";

describe("stripCoverCurl", () => {
  it("drops only the page-curl parameter from a Google Books cover", () => {
    const stored = stripCoverCurl(
      "https://books.google.com/books/content?id=example&printsec=frontcover&img=1&zoom=5&edge=curl&source=gbs_api",
    );
    const parsed = new URL(stored!);

    expect(parsed.searchParams.has("edge")).toBe(false);
    // Everything else, zoom included, stays as the fetcher chose it.
    expect(parsed.searchParams.get("zoom")).toBe("5");
    expect(parsed.searchParams.get("source")).toBe("gbs_api");
  });

  it("leaves other hosts, clean Google URLs, malformed values, and null alone", () => {
    const amazon = "https://m.media-amazon.com/images/I/61KBgtIGGML.jpg";
    const clean =
      "https://books.google.com/books/content?id=example&zoom=1&source=gbs_api";
    expect(stripCoverCurl(amazon)).toBe(amazon);
    expect(stripCoverCurl(clean)).toBe(clean);
    expect(stripCoverCurl("books.google.com/no-scheme")).toBe(
      "books.google.com/no-scheme",
    );
    expect(stripCoverCurl(null)).toBeNull();
  });
});

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
