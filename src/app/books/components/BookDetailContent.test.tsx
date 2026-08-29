import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { BaseBook } from "~/lib/books/types";

import { BookDetailContent } from "./BookDetailContent";

vi.mock("~/lib/analytics", () => ({
  capture: vi.fn(),
  captureOnce: vi.fn(),
}));

const CURRENT_BOOK_WITHOUT_NOTES: BaseBook = {
  id: "children-of-time",
  notionId: "notion-children-of-time",
  title: "Children of Time",
  author: "Adrian Tchaikovsky",
  publicationYear: 2015,
  started: "2026-08-20",
  finished: null,
  abandoned: null,
  abandonedAtMin: null,
  rating: null,
  audioLengthMin: 991,
  pageCount: 640,
  tags: ["Science Fiction"],
  hasNotes: false,
  hasSummary: false,
  isAutomated: false,
  isFeatured: false,
  coverUrl: null,
  audibleUrl: null,
  notionUrl: "https://www.notion.so/children-of-time",
};

function renderCurrentBook(isModal: boolean) {
  return renderToStaticMarkup(
    <BookDetailContent
      book={CURRENT_BOOK_WITHOUT_NOTES}
      isLoadingNotes={false}
      onShare={vi.fn()}
      copied={false}
      bookId={CURRENT_BOOK_WITHOUT_NOTES.id}
      isModal={isModal}
    />,
  );
}

describe("BookDetailContent note availability", () => {
  it("uses the wider content rail for the header, metadata, and notes", () => {
    const markup = renderCurrentBook(true);

    expect(markup.match(/max-w-4xl/g)).toHaveLength(3);
    expect(markup).not.toContain("max-w-3xl");
  });

  it.each([
    ["full page", false],
    ["modal", true],
  ])(
    "shows Copy link before View in Notion in the %s",
    (_presentation, isModal) => {
      const markup = renderCurrentBook(isModal);

      expect(markup.indexOf("Copy link")).toBeLessThan(
        markup.indexOf("View in Notion"),
      );
    },
  );

  it.each([
    ["full page", false],
    ["modal", true],
  ])(
    "shows the reading status and no-notes state in the %s",
    (_presentation, isModal) => {
      const markup = renderCurrentBook(isModal);

      expect(markup).toContain('data-book-notes-state="empty"');
      expect(markup).toContain("No notes for this one");
      expect(markup).toContain(
        "I&#x27;m reading this one without taking notes!",
      );
      expect(markup).not.toContain(">Book notes<");
      expect(markup).not.toContain("Whatever notes are here are partial.");
    },
  );

  it("keeps the partial-notes copy when a current book has notes", () => {
    const markup = renderToStaticMarkup(
      <BookDetailContent
        book={{ ...CURRENT_BOOK_WITHOUT_NOTES, hasNotes: true }}
        isLoadingNotes={false}
        onShare={vi.fn()}
        copied={false}
        bookId={CURRENT_BOOK_WITHOUT_NOTES.id}
        isModal
      />,
    );

    expect(markup).toContain("Whatever notes are here are partial.");
    expect(markup).not.toContain('data-book-notes-state="empty"');
  });

  it("describes no notes as an intentional choice on a completed book", () => {
    const markup = renderToStaticMarkup(
      <BookDetailContent
        book={{
          ...CURRENT_BOOK_WITHOUT_NOTES,
          finished: "2026-08-22",
        }}
        isLoadingNotes={false}
        onShare={vi.fn()}
        copied={false}
        bookId={CURRENT_BOOK_WITHOUT_NOTES.id}
        isModal
      />,
    );

    expect(markup).toContain("No notes for this one");
    expect(markup).toContain("I read this one without taking notes!");
    expect(markup).not.toContain("I&#x27;m reading this one");
  });
});
