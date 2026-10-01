// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Book } from "~/lib/books/types";

import { BookNoteMatches } from "./BookNoteMatches";

const { openModal } = vi.hoisted(() => ({ openModal: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/books");
});

vi.mock("../contexts/BookPreviewContext", () => ({
  useModalActions: () => ({ openModal }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("q=dopamine"),
}));
vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({ books: { getById: { prefetch: vi.fn() } } }),
  },
}));

const BEHAVE: Book = {
  id: "behave",
  notionId: "notion-behave",
  title: "Behave",
  author: "Robert M. Sapolsky",
  publicationYear: 2017,
  started: "2021-01-01",
  finished: "2021-02-01",
  abandoned: null,
  abandonedAtMin: null,
  rating: 5,
  audioLengthMin: 1600,
  pageCount: 790,
  tags: [],
  hasNotes: true,
  hasSummary: true,
  isAutomated: false,
  isFeatured: false,
  coverUrl: null,
  audibleUrl: null,
  notionUrl: "https://www.notion.so/behave",
  readNumber: 1,
  totalReads: 1,
  otherReadings: [],
  coverColor: null,
};

const ROW = {
  book: BEHAVE,
  excerpt: [
    { text: "…pleasure is in anticipation · ", match: false },
    { text: "Dopamine", match: true },
    { text: " system", match: false },
  ],
};

function renderMatches(
  props: Partial<Parameters<typeof BookNoteMatches>[0]> = {},
) {
  return render(
    <BookNoteMatches
      rows={[ROW]}
      isSearching={false}
      focusedBookId={null}
      showFocusIndicator={false}
      onHover={vi.fn()}
      {...props}
    />,
  );
}

describe("BookNoteMatches", () => {
  it("lists each book with its passage and marks the matched word", () => {
    const { container } = renderMatches();

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Mentioned in notes(1)",
    );
    const row = screen.getByRole("button", {
      name: "View details for Behave by Robert M. Sapolsky",
    });
    expect(row.getAttribute("data-book-id")).toBe("behave");
    expect(row.querySelector("h3")?.textContent).toBe("Behave");
    expect(row.querySelector("h3 + p")?.textContent).toBe(
      "Robert M. Sapolsky•2017",
    );
    expect(row.textContent).toContain(
      "…pleasure is in anticipation · Dopamine system",
    );
    expect(
      Array.from(
        container.querySelectorAll("mark"),
        (mark) => mark.textContent,
      ),
    ).toEqual(["Dopamine"]);
  });

  it("says it is searching before the first answer arrives", () => {
    renderMatches({ rows: [], isSearching: true });

    expect(screen.getByRole("status").textContent).toBe("Searching notes");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("opens the book the way a cover does and keeps the search in the URL", () => {
    renderMatches();

    fireEvent.click(screen.getByRole("button"));

    expect(openModal).toHaveBeenCalledWith(BEHAVE, "S");
    expect(window.location.pathname).toBe("/books/behave");
    expect(window.location.search).toBe("?q=dopamine");
  });

  it("shows the keyboard focus the grid hands it", () => {
    renderMatches({ focusedBookId: "behave", showFocusIndicator: true });

    expect(
      screen.getByRole("button").getAttribute("data-keyboard-focused"),
    ).toBe("true");
  });
});
