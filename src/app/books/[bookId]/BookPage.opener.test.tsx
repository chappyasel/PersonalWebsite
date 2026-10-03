// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { peekModalOrigin } from "~/lib/originFlight";

import { BookPage } from "./BookPage";

const { openModalById, prefetch } = vi.hoisted(() => ({
  openModalById: vi.fn(),
  prefetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../contexts/BookPreviewContext", () => ({
  useModalActions: () => ({ openModalById }),
}));
vi.mock("~/trpc/react", () => ({
  api: { useUtils: () => ({ books: { getById: { prefetch } } }) },
}));
vi.mock("../components/RelatedBooks", () => ({ RelatedBooks: () => null }));
// The notes and the related list reach the page's opener through context,
// as BookLink and RelatedBooks do.
vi.mock("../components/BookDetailContent", async () => {
  const { useInlineBookPreview, useInlineBookPrefetch } = await import(
    "~/components/books/InlineBookPreviewProvider"
  );
  return {
    BookDetailContent: function Notes() {
      const open = useInlineBookPreview();
      const warm = useInlineBookPrefetch();
      return (
        <>
          <button
            onClick={() => open?.("chatter", new DOMRect(328, 467, 56, 84))}
          >
            Open Chatter
          </button>
          <button onClick={() => warm?.("chatter")}>Warm Chatter</button>
        </>
      );
    },
  };
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});

function renderPage() {
  window.history.replaceState(null, "", "/books/talking-to-strangers");
  render(
    <BookPage
      bookId="talking-to-strangers"
      book={null!}
      bookshelfBookCount={322}
    />,
  );
}

it("opens a linked book over the page, flying from the link it came from", () => {
  renderPage();
  fireEvent.click(screen.getByRole("button", { name: "Open Chatter" }));
  expect(openModalById).toHaveBeenCalledWith("chatter");
  expect(peekModalOrigin()).toMatchObject({ l: 328, t: 467, w: 56, h: 84 });
  expect(window.location.pathname).toBe("/books/chatter");
});

it("fetches a linked book while it is pointed at", () => {
  renderPage();
  fireEvent.click(screen.getByRole("button", { name: "Warm Chatter" }));
  expect(prefetch).toHaveBeenCalledWith({ bookId: "chatter" });
});
