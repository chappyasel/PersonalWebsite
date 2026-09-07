import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { BaseBook } from "~/lib/books/types";

import { BookDetailContent, underHeader } from "./BookDetailContent";

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
  it("reserves the internal scroll container for modal presentation", () => {
    expect(renderCurrentBook(false)).toContain(
      "relative min-h-[100dvh] overflow-x-clip",
    );
    expect(renderCurrentBook(true)).toContain(
      "relative h-full overflow-y-auto overflow-x-hidden",
    );
  });

  it("uses the compact cover and spacing on standalone mobile pages", () => {
    expect(detailSource).toContain(": [isModal ? 220 : 200, 42]");
    expect(detailSource).toContain(": [isModal ? 24 : 16, isModal ? 16 : 12]");
  });

  it("keeps the notes moving at scroll speed while the header folds", () => {
    // The header holds its folded height in the flow and overflows onto a
    // spacer at rest, so its collapse never displaces the notes. Narrow
    // page: 16 + 200 + 16 at rest, 12 + 42 + 10 folded. Narrow modal:
    // 24 + 220 + 16 at rest, 16 + 42 + 16 folded.
    const page = renderCurrentBook(false);
    const modal = renderCurrentBook(true);
    expect(page).toMatch(/sticky top-0 z-20[^>]*height:64px/);
    expect(page).toMatch(/data-book-header-spacer[^>]*height:168px/);
    expect(modal).toMatch(/sticky top-0 z-20[^>]*height:74px/);
    expect(modal).toMatch(/data-book-header-spacer[^>]*height:186px/);
    // The fold runs over exactly that spacer's height.
    expect(detailSource).toContain("scrollTop / geometry.shrink");
    // While the spring lags a fast fling, the overflowing part of the wide
    // header is backed so its floating title column covers the notes
    // instead of drawing over them. The narrow layout overflows only the
    // opaque cover, over its own in-flow title, so it gets no backing (one
    // painted a hard band across that title on every fling).
    expect(detailSource).toMatch(
      /\{isLargeScreen && \([\s\S]*?data-book-header-backing[\s\S]*?height: headerOverflow/,
    );
    expect(page).not.toContain("data-book-header-backing");
    expect(modal).not.toContain("data-book-header-backing");
  });

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
    expect(markup).toContain("grid-cols-[1rem_4.25rem_minmax(0,1fr)]");
    expect(markup).toContain("text-xs");
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
    expect(detailSource.indexOf("opacity: factsOpacity")).toBeLessThan(
      detailSource.indexOf("opacity: ratingOpacity"),
    );
  });

  it("dissolves each mobile metadata row only as it slides under the header", () => {
    // The rows sit in flow below the cover and scroll at finger speed, so a
    // fade on the fold's clock left them invisible while still on screen:
    // the fold is 186px, the block ~250px. Each row reads its own position.
    expect(detailSource).not.toContain("fullMetadataOpacity");
    for (const segment of ["identity", "facts", "rating", "tags", "actions"]) {
      const name = `mobile${segment[0]!.toUpperCase()}${segment.slice(1)}`;
      expect(detailSource).toMatch(
        new RegExp(
          `const ${name}Opacity = useTransform\\(\\s*${name}Under,\\s*\\[0, (?:1|0\\.6)\\],\\s*\\[1, 0\\]`,
        ),
      );
      expect(detailSource).toMatch(
        new RegExp(
          `ref=\\{bindMobileSegment\\("${segment}"\\)\\}\\s*data-mobile-book-segment="${segment}"`,
        ),
      );
    }
    expect(detailSource).not.toMatch(
      /const mobile\w+Opacity = useTransform\(\s*smoothProgress/,
    );
    expect(detailSource).toMatch(
      /data-mobile-book-segment="identity"[\s\S]*?style=\{\{\s*opacity: mobileIdentityOpacity,\s*visibility: mobileIdentityVisibility,?\s*\}\}/,
    );
    expect(detailSource).toMatch(
      /data-mobile-book-segment="facts"[\s\S]*?style=\{\{\s*opacity: mobileFactsOpacity,\s*visibility: mobileFactsVisibility,?\s*\}\}/,
    );
    expect(detailSource).toMatch(
      /data-mobile-book-segment="rating"[\s\S]*?style=\{\{\s*opacity: mobileRatingOpacity,\s*visibility: mobileRatingVisibility,?\s*\}\}/,
    );
    expect(detailSource).toMatch(
      /data-mobile-book-segment="tags"[\s\S]*?style=\{\{\s*opacity: mobileTagsOpacity,\s*visibility: mobileTagsVisibility,?\s*\}\}/,
    );
    expect(detailSource).toMatch(
      /data-mobile-book-segment="actions"[\s\S]*?style=\{\{\s*opacity: mobileActionsOpacity,\s*visibility: mobileActionsVisibility,?\s*\}\}/,
    );
  });

  it("lets the header overshoot on a hard stop in either direction", () => {
    const match =
      /const HEADER_SPRING = \{[^}]*stiffness: (\d+), damping: (\d+)/.exec(
        detailSource,
      );
    expect(match).not.toBeNull();
    const stiffness = Number(match![1]);
    const damping = Number(match![2]);
    // Underdamped, but not bouncy: one small overshoot, then rest.
    expect(damping).toBeLessThan(2 * Math.sqrt(stiffness));
    expect(damping).toBeGreaterThan(Math.sqrt(stiffness));
    // The silhouette sizes are unclamped so that overshoot is visible.
    for (const size of ["coverHeight", "headerPadding", "titleFontSize"]) {
      expect(detailSource).toMatch(
        new RegExp(`const ${size} = useTransform\\([\\s\\S]*?overshoot,\\n`),
      );
    }
    expect(detailSource).not.toContain("useSpring(");
  });

  it("mounts a fresh title column when the breakpoint flips", () => {
    // Both columns are motion.divs in the same slot. Without distinct keys
    // React reuses the node and Framer's imperative styles from the compact
    // column (visibility hidden, opacity 0) survive onto the wide one.
    expect(detailSource).toMatch(
      /key="wide"[\s\S]*?className="relative min-w-0 flex-1 overflow-visible pr-12"/,
    );
    expect(detailSource).toMatch(
      /key="compact"[\s\S]*?className="flex min-w-0 flex-1 flex-col gap-0 pr-24"/,
    );
  });

  it("keeps scroll anchoring off the book scroller", () => {
    // The header is in flow above the notes, so as it shrinks the browser
    // would scroll the container back to hold the notes still, and fight the
    // spring into a rubber band. Both presentations opt out.
    expect(renderCurrentBook(false)).toContain("[overflow-anchor:none]");
    expect(renderCurrentBook(true)).toContain("[overflow-anchor:none]");
  });

  it("takes faded metadata out of the hit test", () => {
    // Opacity alone left the action row clickable under the folded header.
    expect(detailSource).toMatch(
      /function useHiddenWhenClear[\s\S]*?value > 0 \? "visible" : "hidden"/,
    );
    expect(detailSource.match(/visibility: \w+Visibility/g)).toHaveLength(10);
    for (const segment of ["facts", "rating", "tags", "actions"]) {
      expect(detailSource).toMatch(
        new RegExp(
          `opacity: ${segment}Opacity,\\s*visibility: ${segment}Visibility`,
        ),
      );
    }
  });

  it("hands the mobile identity to the sticky header as the resting title goes under", () => {
    // Sequential, so the title never reads twice: the resting one is gone
    // by 0.6 under; the compact one runs 0.5 to 0.8.
    expect(detailSource).toMatch(
      /const compactHeaderOpacity = useTransform\(\s*mobileIdentityUnder,\s*\[0\.5, 0\.8\]/,
    );
    expect(detailSource).toMatch(
      /const mobileIdentityOpacity = useTransform\(\s*mobileIdentityUnder,\s*\[0, 0\.6\],\s*\[1, 0\]/,
    );
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
    expect(markup).toContain("sm:min-w-[4.25rem]");
    expect(markup).toContain(">Copied</span>");
    expect(detailSource).toContain('<CheckIcon size={14} weight="bold" />');
  });

  it("keeps all mobile actions on one compact row", () => {
    const markup = renderToStaticMarkup(
      <BookDetailContent
        book={{
          ...CURRENT_BOOK_WITHOUT_NOTES,
          audibleUrl: "https://www.audible.com/example",
        }}
        isLoadingNotes={false}
        onShare={vi.fn()}
        copied={false}
        bookId={CURRENT_BOOK_WITHOUT_NOTES.id}
      />,
    );

    expect(markup).toContain("flex-nowrap");
    expect(markup).toContain('<span class="sm:hidden">Audible</span>');
    expect(markup).toContain(
      '<span class="hidden sm:inline">Listen on Audible</span>',
    );
    expect(markup).toContain("px-2");
    expect(markup).toContain("sm:px-3");
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

  it("folds a details block behind the site's shared disclosure caret", () => {
    const withNotes = {
      ...CURRENT_BOOK_WITHOUT_NOTES,
      hasNotes: true,
      notes:
        "<details><summary>Spoilers</summary>\n\nHidden line\n\n</details>",
    };
    const markup = renderToStaticMarkup(
      <BookDetailContent
        book={withNotes}
        fullBook={withNotes}
        isLoadingNotes={false}
        onShare={vi.fn()}
        copied={false}
        bookId={withNotes.id}
        isModal
      />,
    );

    expect(markup).toContain("Spoilers");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("group/book-note-summary");
    expect(markup).toContain("group-hover/book-note-summary:text-foreground");
    expect(markup).toContain('width="14"');
    expect(markup).toMatch(/inert=""[^>]*>[^<]*<p>Hidden line<\/p>/);
  });

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

describe("underHeader", () => {
  const edge = 90;
  it("is clear while the row's top is still below the header's edge", () => {
    expect(underHeader(edge, { top: 190, height: 86 })).toBe(0);
    expect(underHeader(edge, { top: 90, height: 86 })).toBe(0);
  });
  it("grows with the share of the row that has gone under", () => {
    expect(underHeader(edge, { top: 47, height: 86 })).toBeCloseTo(0.5, 5);
    expect(underHeader(edge, { top: 4, height: 86 })).toBe(1);
    expect(underHeader(edge, { top: -300, height: 86 })).toBe(1);
  });
  it("treats an empty row as under once its top passes the edge", () => {
    expect(underHeader(edge, { top: 100, height: 0 })).toBe(0);
    expect(underHeader(edge, { top: 80, height: 0 })).toBe(1);
  });
});
