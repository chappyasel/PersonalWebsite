import { describe, expect, it } from "vitest";

import { getBooksPath } from "./paths";

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
});
