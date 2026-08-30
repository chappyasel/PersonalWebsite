import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Book } from "~/lib/books/types";

import { BookCard } from "./BookCard";

vi.mock("../contexts/BookPreviewContext", () => ({
  useModalActions: () => ({ openModal: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("~/lib/analytics", () => ({ capture: vi.fn() }));
vi.mock("~/components/ui/intersection-motion", () => ({
  useIntersectionMotion: vi.fn(),
}));
vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({ books: { getById: { prefetch: vi.fn() } } }),
  },
}));

const CURRENT_BOOK_WITHOUT_NOTES: Book = {
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
  readNumber: 1,
  totalReads: 1,
  otherReadings: [],
};

describe("BookCard badges", () => {
  it("shows both Reading and No Notes for a current book without notes", () => {
    const markup = renderToStaticMarkup(
      <BookCard book={CURRENT_BOOK_WITHOUT_NOTES} size="M" />,
    );

    expect(markup).toContain(">Reading<");
    expect(markup).toContain('data-book-badge="no-notes"');
    expect(markup).toContain(">No Notes<");
  });
});

describe("BookCard entrance motion", () => {
  it("runs the viewport entrance animation only once per mount", () => {
    const markup = renderToStaticMarkup(
      <BookCard book={CURRENT_BOOK_WITHOUT_NOTES} size="M" />,
    );

    expect(markup).toContain("intersect-once");
  });
});
