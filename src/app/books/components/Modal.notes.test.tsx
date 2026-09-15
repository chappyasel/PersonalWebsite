// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { BookWithNotes } from "~/lib/books/types";
import { FontProvider } from "~/lib/font-provider";

import { Modal } from "./Modal";

const mocks = vi.hoisted(() => ({ state: vi.fn(), query: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/books/disciplined-entrepreneurship-expanded-updated",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../hooks/useBookPath", () => ({
  useBookPath: () => (id: string) => `/books/${id}`,
}));
vi.mock("../contexts/BookPreviewContext", () => ({
  useModalState: mocks.state,
  useModalActions: () => ({ closeModal: vi.fn(), openModalById: vi.fn() }),
}));
vi.mock("~/trpc/react", () => ({
  api: { books: { getById: { useQuery: mocks.query } } },
}));
vi.mock("./ModalHost", () => ({
  fullBookPageHref: (id: string) => `/books/${id}`,
}));
vi.mock("~/lib/analytics", () => ({ capture: vi.fn(), captureOnce: vi.fn() }));

const oldSlug = "disciplined-entrepreneurship-expanded-updated";
const book: BookWithNotes = {
  id: "disciplined-entrepreneurship",
  notionId: "3dcc5ab0-d88d-81ad-90de-ffe1800b1816",
  title: "Disciplined Entrepreneurship",
  author: "Bill Aulet",
  publicationYear: null,
  started: "2026-09-01",
  finished: null,
  abandoned: null,
  abandonedAtMin: null,
  rating: null,
  audioLengthMin: null,
  pageCount: null,
  tags: [],
  hasNotes: true,
  hasSummary: false,
  isAutomated: false,
  isFeatured: false,
  coverUrl: null,
  coverColor: null,
  audibleUrl: null,
  notionUrl: "https://www.notion.so/3dcc5ab0d88d81ad90deffe1800b1816",
  notes: "# Notes\n\n**1: Market Segmentation**\n\n- ",
  readNumber: 1,
  totalReads: 1,
  otherReadings: [],
};

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  mocks.query.mockReturnValue({ data: book, isLoading: false, error: null });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it.each([true, false])(
  "renders returned notes for a retired slug, with cached preview: %s",
  (withPreview) => {
    mocks.state.mockReturnValue({
      isModalOpen: true,
      selectedBookId: oldSlug,
      selectedBook: withPreview
        ? { ...book, id: oldSlug, notes: undefined }
        : null,
    });
    render(
      <FontProvider>
        <Modal />
      </FontProvider>,
    );
    expect(screen.queryByText(/This book has notes. View them in/)).toBeNull();
    expect(screen.getByText("1: Market Segmentation")).toBeTruthy();
  },
);

it("replaces stale preview flags with the fetched book's notes", () => {
  mocks.state.mockReturnValue({
    isModalOpen: true,
    selectedBookId: book.id,
    selectedBook: { ...book, hasNotes: false, notes: undefined },
  });
  render(
    <FontProvider>
      <Modal />
    </FontProvider>,
  );
  expect(screen.getByText("1: Market Segmentation")).toBeTruthy();
  expect(screen.queryByText("No notes for this one")).toBeNull();
});

it("clears the previous notes while another book's query loads", () => {
  mocks.state.mockReturnValue({
    isModalOpen: true,
    selectedBookId: oldSlug,
    selectedBook: null,
  });
  const view = render(
    <FontProvider>
      <Modal />
    </FontProvider>,
  );
  expect(screen.getByText("1: Market Segmentation")).toBeTruthy();

  mocks.state.mockReturnValue({
    isModalOpen: true,
    selectedBookId: "another-book",
    selectedBook: {
      ...book,
      id: "another-book",
      title: "Another book",
      notes: undefined,
    },
  });
  mocks.query.mockReturnValue({
    data: undefined,
    isLoading: true,
    error: null,
  });
  view.rerender(
    <FontProvider>
      <Modal />
    </FontProvider>,
  );
  expect(mocks.query).toHaveBeenLastCalledWith(
    { bookId: "another-book" },
    expect.objectContaining({ enabled: true }),
  );
  expect(screen.queryByText("1: Market Segmentation")).toBeNull();
  expect(screen.queryByText(/This book has notes. View them in/)).toBeNull();
});
