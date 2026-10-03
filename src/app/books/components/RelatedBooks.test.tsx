// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BaseBook } from "~/lib/books/types";
import { FontProvider } from "~/lib/font-provider";
import type { RelatedBook } from "~/server/queries/relatedBooks";

import { InlineBookOpener } from "~/components/books/InlineBookPreviewProvider";

import { BookDetailContent } from "./BookDetailContent";
import { RelatedBooks } from "./RelatedBooks";
import * as documentNavigation from "~/app/components/route-transition-prototype/documentNavigation";

const { getRelated } = vi.hoisted(() => ({
  getRelated: vi.fn<
    (input: { bookId: string }) => { data: RelatedBook[] | undefined }
  >(() => ({ data: undefined })),
}));

vi.mock("~/trpc/react", () => ({
  api: { books: { getRelated: { useQuery: getRelated } } },
}));
vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("~/lib/analytics", () => ({ capture: vi.fn(), captureOnce: vi.fn() }));

const CHATTER: RelatedBook = {
  id: "chatter",
  title: "Chatter",
  author: "Ethan Kross",
  publicationYear: 2021,
  coverUrl: null,
  coverColor: "#e4572e",
};
const THE_WAR_OF_ART: RelatedBook = {
  id: "the-war-of-art",
  title: "The War of Art",
  author: "Steven Pressfield",
  publicationYear: null,
  coverUrl: null,
  coverColor: null,
};

let smallScreen = false;
beforeEach(() => {
  smallScreen = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: smallScreen && query.includes("width < 640px"),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function renderRelated(
  books: RelatedBook[] | undefined,
  props: Partial<ComponentProps<typeof RelatedBooks>> = {},
  open = vi.fn(),
) {
  getRelated.mockReturnValue({ data: books });
  render(
    <InlineBookOpener open={open}>
      <RelatedBooks bookId="talking-to-strangers" {...props} />
    </InlineBookOpener>,
  );
  return open;
}

describe("RelatedBooks", () => {
  it("asks for this book's list", () => {
    renderRelated([CHATTER]);
    expect(getRelated).toHaveBeenCalledWith({
      bookId: "talking-to-strangers",
    });
  });

  it.each([
    ["loading", undefined],
    ["empty", []],
  ])("draws nothing while the list is %s", (_, books) => {
    renderRelated(books);
    expect(document.querySelector("[data-related-books]")).toBeNull();
    expect(screen.queryByText("Related books")).toBeNull();
  });

  it("lists each book as a row with its title, author, and year", () => {
    renderRelated([CHATTER, THE_WAR_OF_ART]);

    const section = screen.getByRole("region", { name: "Related books" });
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/books/chatter",
      "/books/the-war-of-art",
    ]);
    expect(links[0]!.textContent).toBe("ChatterEthan Kross•2021");
    // No year, no separator.
    expect(links[1]!.textContent).toBe("The War of ArtSteven Pressfield");
    // The jacket color stands in for the cover until it loads.
    expect(
      links[0]!.querySelector<HTMLElement>(".aspect-\\[2\\/3\\]")!.style
        .backgroundColor,
    ).toBe("rgb(228, 87, 46)");
    // Titles, authors and years only: no scores, no reasons.
    expect(section.textContent).not.toMatch(/%|\d\.\d|because/i);
  });

  it("links to the Books site when the book is open off it", () => {
    renderRelated([CHATTER], {
      booksHref: "https://books.chappyasel.com",
    });
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "https://books.chappyasel.com/chatter",
    );
  });

  it("opens a book through the surface hosting it, as notes links do", () => {
    const open = renderRelated([CHATTER]);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("link"), click);
    expect(open).toHaveBeenCalledWith("chatter", expect.any(Object));
    expect(click.defaultPrevented).toBe(true);
  });

  it("loads the book's own page on a small screen", () => {
    smallScreen = true;
    const navigate = vi
      .spyOn(documentNavigation, "navigateFullDocument")
      .mockImplementation(() => undefined);
    const open = renderRelated([CHATTER]);
    fireEvent.click(screen.getByRole("link"));
    expect(navigate).toHaveBeenCalledWith("/books/chatter", expect.any(Object));
    expect(navigate.mock.calls[0]?.[1]?.source).toBeInstanceOf(
      HTMLAnchorElement,
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("leaves a modified click to the browser", () => {
    const open = renderRelated([CHATTER]);
    let leftToBrowser = false;
    // Runs after React's handler; stops jsdom attempting the navigation.
    const settle = (event: MouseEvent) => {
      leftToBrowser = !event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", settle);
    fireEvent.click(screen.getByRole("link"), { metaKey: true });
    document.removeEventListener("click", settle);
    expect(open).not.toHaveBeenCalled();
    expect(leftToBrowser).toBe(true);
  });
});

describe("BookDetailContent related books slot", () => {
  const BOOK: BaseBook = {
    id: "talking-to-strangers",
    notionId: "notion-talking-to-strangers",
    title: "Talking to Strangers",
    author: "Malcolm Gladwell",
    publicationYear: 2019,
    started: "2024-01-01",
    finished: "2024-02-01",
    abandoned: null,
    abandonedAtMin: null,
    rating: 2,
    audioLengthMin: 520,
    pageCount: 400,
    tags: [],
    hasNotes: true,
    hasSummary: true,
    isAutomated: false,
    isFeatured: false,
    coverUrl: null,
    audibleUrl: null,
    notionUrl: "https://www.notion.so/talking-to-strangers",
  };
  const slot = <aside data-slot>related</aside>;

  function renderDetail(
    props: Partial<ComponentProps<typeof BookDetailContent>>,
  ) {
    return renderToStaticMarkup(
      <FontProvider>
        <BookDetailContent
          book={BOOK}
          isLoadingNotes={false}
          onShare={vi.fn()}
          copied={false}
          bookId={BOOK.id}
          relatedBooks={slot}
          {...props}
        />
      </FontProvider>,
    );
  }

  it("draws the list after the notes", () => {
    const markup = renderDetail({
      fullBook: { ...BOOK, notes: "# Summary\n\nDefault to truth." },
    });
    expect(markup.indexOf("<aside data-slot")).toBeGreaterThan(
      markup.indexOf("Default to truth."),
    );
  });

  it("waits for the notes", () => {
    expect(renderDetail({ isLoadingNotes: true })).not.toContain("data-slot");
  });

  it("has no list for a book without notes", () => {
    expect(renderDetail({ book: { ...BOOK, hasNotes: false } })).not.toContain(
      "data-slot",
    );
  });
});
