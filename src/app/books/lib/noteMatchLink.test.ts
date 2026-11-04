import { describe, expect, it } from "vitest";

import { getBookPath } from "~/lib/books/paths";

import { noteMatchHref, withBookArrival } from "./noteMatchLink";

const bookPath = (bookId: string, query?: string) =>
  getBookPath(bookId, query, "/books");

describe("noteMatchHref", () => {
  it("keeps the shelf's query, names the search to mark, and adds the chapter", () => {
    expect(
      noteMatchHref(
        bookPath,
        "behave",
        "q=social+capital&tags=Sociology",
        "8-trust",
      ),
    ).toBe(
      "/books/behave?q=social+capital&tags=Sociology&hl=social+capital#8-trust",
    );
  });

  it("opens the top of the book when the match spans passages", () => {
    expect(noteMatchHref(bookPath, "behave", "q=trust", null)).toBe(
      "/books/behave?q=trust&hl=trust",
    );
  });
});

describe("withBookArrival", () => {
  it("adds the words to mark and the passage, keeping the query", () => {
    expect(
      withBookArrival("/books/behave?tags=Sociology", {
        highlight: "The Selfish Gene",
        anchor: "10-the-evolution-of-behavior",
      }),
    ).toBe(
      "/books/behave?tags=Sociology&hl=The+Selfish+Gene#10-the-evolution-of-behavior",
    );
  });

  it("works on a Books site address", () => {
    expect(
      withBookArrival("https://books.chappyasel.com/behave", {
        highlight: "Behave",
        anchor: null,
      }),
    ).toBe("https://books.chappyasel.com/behave?hl=Behave");
  });

  it("leaves an address without an arrival alone", () => {
    expect(withBookArrival("/books/behave#notes")).toBe("/books/behave#notes");
  });
});
