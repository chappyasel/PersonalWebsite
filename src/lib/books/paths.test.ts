import { describe, expect, it } from "vitest";

import { getBooksPath, getBooksTagQuery } from "./paths";

describe("book paths", () => {
  it.each([
    [
      "the main host",
      "http://localhost:3000/books/the-founder-s-mentality",
      "/books/",
    ],
    [
      "the Books subdomain",
      "http://books.localhost:3000/the-founder-s-mentality?search=founder",
      "/",
    ],
  ])("returns to the library on %s", (_host, detailUrl, expectedPath) => {
    expect(new URL(getBooksPath(), detailUrl).pathname).toBe(expectedPath);
  });

  it("narrows the shelf to one tag while keeping its other query", () => {
    expect(getBooksTagQuery("Leadership")).toBe("tags=Leadership");
    expect(
      getBooksTagQuery("Leadership", "?size=L&tags=Innovation,AI&search=x"),
    ).toBe("size=L&tags=Leadership&search=x");
    expect(getBooksTagQuery("Stats & data", "sort=rating")).toBe(
      "sort=rating&tags=Stats+%26+data",
    );
  });

  it("resolves a tag link to the library on both hosts", () => {
    const path = getBooksPath(getBooksTagQuery("Pure Science"));
    expect(path).toBe("./?tags=Pure+Science");
    for (const [detailUrl, expected] of [
      [
        "http://localhost:3000/books/the-founder-s-mentality",
        "/books/?tags=Pure+Science",
      ],
      [
        "http://books.localhost:3000/the-founder-s-mentality?search=founder",
        "/?tags=Pure+Science",
      ],
    ] as const) {
      const url = new URL(path, detailUrl);
      expect(url.pathname + url.search).toBe(expected);
      expect(new URLSearchParams(url.search).get("tags")).toBe("Pure Science");
    }
  });
});
