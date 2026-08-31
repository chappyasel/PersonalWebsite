import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { BaseBook } from "~/lib/books/types";

import { BookDetailContent } from "./BookDetailContent";

const detailSource = readFileSync(
  new URL("./BookDetailContent.tsx", import.meta.url),
  "utf8",
);

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

function renderCurrentBook(isModal: boolean, copied = false) {
  return renderToStaticMarkup(
    <BookDetailContent
      book={CURRENT_BOOK_WITHOUT_NOTES}
      isLoadingNotes={false}
      onShare={vi.fn()}
      copied={copied}
      bookId={CURRENT_BOOK_WITHOUT_NOTES.id}
      isModal={isModal}
    />,
  );
}

describe("BookDetailContent note availability", () => {
  it("keeps the standalone breadcrumb in the same visual order as the external one", () => {
    const markup = renderToStaticMarkup(
      <BookDetailContent
        book={CURRENT_BOOK_WITHOUT_NOTES}
        isLoadingNotes={false}
        onShare={vi.fn()}
        copied={false}
        bookId={CURRENT_BOOK_WITHOUT_NOTES.id}
        bookshelfBookCount={322}
      />,
    );

    expect(markup).toMatch(
      /aria-label="Breadcrumb"[\s\S]*?<a[^>]*><svg[\s\S]*?Chappy&#x27;s Book Notes[\s\S]*?·[\s\S]*?322 books[\s\S]*?<svg/,
    );
    expect(markup).not.toContain('class="text-border">/</li>');
    expect(markup).toContain("text-muted-foreground/70");
  });

  it("uses an up-right arrow for both breadcrumb destinations", () => {
    expect(detailSource).not.toContain("ArrowLeftIcon");
    expect(detailSource.match(/<ArrowUpRightIcon/g)).toHaveLength(2);
  });

  it("uses the wider content rail for the header, metadata, and notes", () => {
    const markup = renderCurrentBook(true);

    expect(markup.match(/max-w-4xl/g)).toHaveLength(3);
    expect(markup).not.toContain("max-w-3xl");
  });

  it("separates quiet fact labels from readable values in both layouts", () => {
    const markup = renderCurrentBook(false);
    const ratedMarkup = renderToStaticMarkup(
      <BookDetailContent
        book={{ ...CURRENT_BOOK_WITHOUT_NOTES, rating: 4 }}
        isLoadingNotes={false}
        onShare={vi.fn()}
        copied={false}
        bookId={CURRENT_BOOK_WITHOUT_NOTES.id}
      />,
    );

    expect(detailSource.match(/<BookFacts book=\{book\} \/>/g)).toHaveLength(2);
    expect(markup).toContain("data-book-facts");
    expect(markup).toContain('data-book-fact="published"');
    expect(markup).toMatch(
      /data-book-fact="length"[\s\S]*?aria-hidden="true" class="text-muted-foreground\/40">·<\/span>/,
    );
    expect(markup).toMatch(
      /<dt[^>]*>Published<\/dt>[\s\S]*?<dd[^>]*>2015<\/dd>/,
    );
    expect(markup).not.toContain("Published:");
    expect(markup).toContain('aria-label="Book actions"');
    expect(markup).toContain("grid-cols-[1.125rem_5rem_minmax(0,1fr)]");
    expect(markup).toContain("w-fit min-w-0 max-w-full justify-self-start");
    expect(markup).not.toContain("md:grid-cols-3");
    expect(ratedMarkup.indexOf("data-book-facts")).toBeLessThan(
      ratedMarkup.indexOf("out of 5 stars"),
    );
  });

  it("collapses desktop metadata from the bottom upward", () => {
    expect(detailSource).toMatch(
      /const factsOpacity = useTransform\([\s\S]*?\[0\.34, 0\.54\]/,
    );
    expect(detailSource).toMatch(
      /const ratingOpacity = useTransform\([\s\S]*?\[0\.22, 0\.4\]/,
    );
    expect(
      detailSource.indexOf("style={{ opacity: factsOpacity }}"),
    ).toBeLessThan(detailSource.indexOf("style={{ opacity: ratingOpacity }}"));
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

  it("confirms a copied link with the Books green check treatment", () => {
    const markup = renderCurrentBook(false, true);

    expect(markup).toContain('aria-label="Link copied"');
    expect(markup).toContain("bg-emerald-500/10");
    expect(markup).toContain("min-w-[4.25rem]");
    expect(markup).toContain(">Copied</span>");
    expect(detailSource).toContain('<CheckIcon size={14} weight="bold" />');
  });

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
