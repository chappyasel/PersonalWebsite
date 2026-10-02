import { describe, expect, it } from "vitest";

import { getBookPath } from "~/lib/books/paths";

import { noteMatchHref } from "./noteMatchLink";

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
