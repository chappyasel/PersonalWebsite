import { describe, expect, it } from "vitest";

import { proxiedBookCover } from "./bookCoverTexture";

describe("Stacks book-cover proxy", () => {
  it("requests the same clean Google Books artwork used by the library", () => {
    const source =
      "https://books.google.com/books/content?id=example&printsec=frontcover&img=1&zoom=2&edge=curl&source=gbs_api";
    const proxyUrl = new URL(
      proxiedBookCover(source, 256),
      "https://example.com",
    );
    const nestedUrl = new URL(proxyUrl.searchParams.get("url")!);

    expect(nestedUrl.searchParams.get("zoom")).toBe("1");
    expect(nestedUrl.searchParams.get("fife")).toBe("w800");
    expect(nestedUrl.searchParams.has("edge")).toBe(false);
  });
});
