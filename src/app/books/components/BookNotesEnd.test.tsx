// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BookBacklink } from "~/server/queries/bookBacklinks";
import type { RelatedBook } from "~/server/queries/relatedBooks";

import { InlineBookOpener } from "~/components/books/InlineBookPreviewProvider";

import { BookNotesEnd } from "./BookNotesEnd";

const { getBacklinks, getRelated } = vi.hoisted(() => ({
  getBacklinks: vi.fn<
    (input: { bookId: string }) => { data: BookBacklink[] | undefined }
  >(() => ({ data: undefined })),
  getRelated: vi.fn<
    (input: { bookId: string }) => { data: RelatedBook[] | undefined }
  >(() => ({ data: undefined })),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({ books: { getById: { prefetch: vi.fn() } } }),
    books: {
      getBacklinks: { useQuery: getBacklinks },
      getRelated: { useQuery: getRelated },
    },
  },
}));
vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));

const SUPERMINDS: BookBacklink = {
  id: "superminds",
  title: "Superminds",
  author: "Thomas W. Malone",
  publicationYear: 2018,
  coverUrl: null,
  coverColor: null,
  anchor: "10-smarter-ecosystems",
  linkText: "Bowling Alone",
  excerpt: [
    { text: "Bowling Alone", match: true },
    { text: " · Markets are controlling more time", match: false },
  ],
};
const related = (id: string): RelatedBook => ({
  id,
  title: id,
  author: "Author",
  publicationYear: null,
  coverUrl: null,
  coverColor: null,
  rating: null,
  started: null,
  finished: null,
});

beforeEach(() => {
  window.history.replaceState(null, "", "/books/bowling-alone");
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function renderEnd(
  backlinks: BookBacklink[] | undefined,
  relatedBooks: RelatedBook[] | undefined,
  open = vi.fn(),
) {
  getBacklinks.mockReturnValue({ data: backlinks });
  getRelated.mockReturnValue({ data: relatedBooks });
  render(
    <InlineBookOpener open={open}>
      <BookNotesEnd bookId="bowling-alone" />
    </InlineBookOpener>,
  );
  return open;
}

describe("BookNotesEnd", () => {
  it.each([
    ["loading", undefined, undefined],
    ["empty", [], []],
  ])("draws nothing while both lists are %s", (_, backlinks, relatedBooks) => {
    renderEnd(backlinks, relatedBooks);
    expect(document.querySelector("[data-book-notes-end]")).toBeNull();
  });

  it("sets both lists off from the notes with one break, links first", () => {
    renderEnd([SUPERMINDS], [related("get-together")]);
    const end = document.querySelector("[data-book-notes-end]")!;
    const breaks = end.querySelectorAll("[data-notes-end-break]");
    expect(breaks).toHaveLength(1);
    expect(breaks[0]!.getAttribute("aria-hidden")).toBe("true");
    // Three pills over two.
    expect(
      [...breaks[0]!.children].map((course) => course.children.length),
    ).toEqual([3, 2]);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["Referenced In", "Related Books"]);
  });

  it("draws the break for either list alone", () => {
    renderEnd([], [related("get-together")]);
    expect(document.querySelector("[data-notes-end-break]")).not.toBeNull();
    expect(screen.queryByText("Referenced In")).toBeNull();
    cleanup();
    renderEnd([SUPERMINDS], []);
    expect(document.querySelector("[data-notes-end-break]")).not.toBeNull();
    expect(screen.queryByText("Related Books")).toBeNull();
  });

  it("lists a book that links this one once, under Referenced In", () => {
    renderEnd([SUPERMINDS], [related("superminds"), related("get-together")]);
    const relatedList = screen.getByRole("region", { name: "Related Books" });
    expect(
      within(relatedList)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/books/get-together"]);
  });

  it("drops Related Books when every book in it links this one", () => {
    renderEnd([SUPERMINDS], [related("superminds")]);
    expect(screen.queryByText("Referenced In")).not.toBeNull();
    expect(screen.queryByText("Related Books")).toBeNull();
  });

  it("shows the line that links this book, and opens there", () => {
    const open = renderEnd([SUPERMINDS], []);
    const row = within(
      screen.getByRole("region", { name: "Referenced In" }),
    ).getByRole("link");
    expect(row.textContent).toBe(
      "SupermindsThomas W. Malone•2018Bowling Alone · Markets are controlling more time",
    );
    expect(row.getAttribute("href")).toBe(
      "/books/superminds?hl=Bowling+Alone#10-smarter-ecosystems",
    );
    fireEvent.click(row);
    expect(open).toHaveBeenCalledWith("superminds", expect.any(Object), {
      highlight: "Bowling Alone",
      anchor: "10-smarter-ecosystems",
    });
  });
});
