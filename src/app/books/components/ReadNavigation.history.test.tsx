// @vitest-environment jsdom
import { BookPage } from "../[bookId]/BookPage";
import {
  BookPreviewProvider,
  useModalActions,
} from "../contexts/BookPreviewContext";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { BookWithNotes } from "~/lib/books/types";
import { FontProvider } from "~/lib/font-provider";

import { Modal } from "./Modal";
import type { ModalPresentation } from "./ModalHost";
import {
  BOOK_MODAL_HISTORY_STATE,
  inlineBookHistoryEntry,
} from "./modalHistory";

vi.mock("next/link", () => ({
  default: ({
    href,
    replace,
    onClick,
    children,
    ...props
  }: React.ComponentProps<"a"> & { replace?: boolean; prefetch?: boolean }) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        window.history[replace ? "replaceState" : "pushState"]({}, "", href);
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("~/lib/analytics", () => ({ capture: vi.fn(), captureOnce: vi.fn() }));
vi.mock("~/trpc/react", () => ({
  api: {
    books: {
      getById: {
        useQuery: ({ bookId }: { bookId: string }) => ({
          data: makeBook(bookId),
          isLoading: false,
          error: null,
        }),
      },
    },
  },
}));

const readings = ["first", "second", "third"].map((id) => ({
  id,
  started: null,
  finished: "2026-01-01",
  abandoned: null,
  abandonedAtMin: null,
  rating: 4,
}));
function makeBook(id: string): BookWithNotes {
  return {
    id,
    notionId: id,
    title: "A book",
    author: "An author",
    publicationYear: null,
    started: null,
    finished: "2026-01-01",
    abandoned: null,
    abandonedAtMin: null,
    rating: 4,
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
    notionUrl: "https://notion.so/book",
    notes: `Notes for ${id}`,
    linkedBooks: {},
    readNumber: readings.findIndex((r) => r.id === id) + 1,
    totalReads: 3,
    otherReadings: readings,
  };
}
function OpenBook() {
  const { openModalById } = useModalActions();
  useEffect(() => {
    openModalById("first");
  }, [openModalById]);
  return null;
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([undefined, "stacks", "document"] as const)(
  "replaces repeated modal switches and closes in one step, source: %s",
  async (source) => {
    window.history.replaceState({}, "", "/books?tags=Science");
    const entry =
      source === "document"
        ? inlineBookHistoryEntry("first", window.location)
        : {
            state: BOOK_MODAL_HISTORY_STATE,
            href: "/books/first?tags=Science",
          };
    window.history.pushState(
      { ...entry.state, retained: "value" },
      "",
      entry.href,
    );
    const initialLength = window.history.length;
    const presentation: ModalPresentation | undefined = source
      ? { source, booksHref: "https://books.chappyasel.com" }
      : undefined;
    render(
      <FontProvider>
        <BookPreviewProvider>
          <OpenBook />
          <Modal presentation={presentation} />
        </BookPreviewProvider>
      </FontProvider>,
    );
    for (const [direction, id] of [
      ["Next", "second"],
      ["Next", "third"],
      ["Previous", "second"],
      ["Previous", "first"],
      ["Next", "second"],
    ]) {
      const link = screen.getByRole("link", {
        name: new RegExp(`^${direction} read:`),
      });
      expect(link.getAttribute("data-route-transition")).toBe("preserve");
      fireEvent.click(link);
      expect(window.history.length).toBe(initialLength);
      expect(window.history.state).toEqual(
        expect.objectContaining({ retained: "value", bookModal: true }),
      );
      expect(screen.getByText(`Notes for ${id}`)).toBeTruthy();
    }
    const back = vi.spyOn(window.history, "back");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(back).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(window.location.pathname + window.location.search).toBe(
        "/books?tags=Science",
      ),
    );
  },
);

it("replaces full-page read switches so Back returns directly to the launcher", async () => {
  window.history.replaceState({}, "", "/books?tags=Science");
  window.history.pushState({}, "", "/books/first");
  const initialLength = window.history.length;
  const page = (id: string) => (
    <FontProvider>
      <BookPage bookId={id} book={makeBook(id)} bookshelfBookCount={3} />
    </FontProvider>
  );
  const view = render(page("first"));
  for (const [direction, id] of [
    ["Next", "second"],
    ["Next", "third"],
    ["Previous", "second"],
    ["Previous", "first"],
  ] as const) {
    const link = screen.getByRole("link", {
      name: new RegExp(`^${direction} read:`),
    });
    expect(link.getAttribute("data-route-transition")).toBe("preserve");
    fireEvent.click(link);
    expect(window.history.length).toBe(initialLength);
    expect(window.location.pathname).toBe(`/books/${id}`);
    view.rerender(page(id));
  }
  await act(async () => window.history.back());
  await waitFor(() =>
    expect(window.location.pathname + window.location.search).toBe(
      "/books?tags=Science",
    ),
  );
});
