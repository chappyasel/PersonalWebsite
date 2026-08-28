import { describe, expect, it } from "vitest";

import {
  BOOK_MODAL_HISTORY_STATE,
  bookIdFromPathname,
  isBookModalHistoryState,
} from "./modalHistory";

describe("book modal history", () => {
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
});
