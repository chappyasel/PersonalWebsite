import { describe, expect, it } from "vitest";

import {
  BOOK_MODAL_HISTORY_STATE,
  bookIdFromPathname,
  inlineBookHistoryEntry,
  inlineBookIdFromHistory,
  isBookModalHistoryState,
} from "./modalHistory";

describe("book modal history", () => {
  it.each(["manual.chappyasel.com", "routine.chappyasel.com"])(
    "keeps an inline book on the document route on %s",
    (hostname) => {
      const entry = inlineBookHistoryEntry("the-culture-code", {
        hostname,
        pathname: "/",
        search: "?section=work",
      });
      expect(entry.href).toBe("/?section=work#book-the-culture-code");
      expect(inlineBookIdFromHistory("/", entry.state)).toBe(
        "the-culture-code",
      );
      expect(inlineBookIdFromHistory("/another-page", entry.state)).toBeNull();
      expect(inlineBookIdFromHistory("/", null)).toBeNull();
    },
  );

  it("gives inline books a refreshable book path on the main host", () => {
    const entry = inlineBookHistoryEntry("the-culture-code", {
      hostname: "www.chappyasel.com",
      pathname: "/manual",
      search: "",
    });
    expect(entry.href).toBe("/books/the-culture-code");
    expect(inlineBookIdFromHistory(entry.href, entry.state)).toBe(
      "the-culture-code",
    );
  });
  it("reads book ids from both presentations' paths", () => {
    expect(bookIdFromPathname("/books/80-000-hours", true)).toBe(
      "80-000-hours",
    );
    expect(bookIdFromPathname("/80-000-hours", false)).toBe("80-000-hours");
    expect(bookIdFromPathname("/books/the%20pathless%20path", true)).toBe(
      "the pathless path",
    );
  });

  it("names no book for the scene, the grid, or nested paths", () => {
    expect(bookIdFromPathname("/", true)).toBeNull();
    expect(bookIdFromPathname("/", false)).toBeNull();
    // Over stacks only the /books prefix names a book.
    expect(bookIdFromPathname("/80-000-hours", true)).toBeNull();
    expect(bookIdFromPathname("/books/a/b", true)).toBeNull();
    expect(bookIdFromPathname("/books/80-000-hours", false)).toBeNull();
  });

  it("recognizes only history entries the modal stamped", () => {
    expect(isBookModalHistoryState(BOOK_MODAL_HISTORY_STATE)).toBe(true);
    // Next's history sync may fold its own keys into the entry.
    expect(isBookModalHistoryState({ bookModal: true, __NA: true })).toBe(true);
    expect(isBookModalHistoryState(null)).toBe(false);
    expect(isBookModalHistoryState(undefined)).toBe(false);
    expect(isBookModalHistoryState({ __NA: true })).toBe(false);
  });

  it("keeps document and library modal hosts from reopening each other's entries", () => {
    const documentEntry = {
      ...BOOK_MODAL_HISTORY_STATE,
      inlineBookModal: true,
    };
    expect(isBookModalHistoryState(documentEntry, "document")).toBe(true);
    expect(isBookModalHistoryState(documentEntry, "stacks")).toBe(false);
    expect(isBookModalHistoryState(documentEntry)).toBe(false);
    expect(isBookModalHistoryState(BOOK_MODAL_HISTORY_STATE, "document")).toBe(
      false,
    );
  });
});
