// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BaseBook } from "./books/types";
import { FontProvider, useFont } from "./font-provider";
import { BookDetailContent } from "~/app/books/components/BookDetailContent";
import { BooksLayoutWrapper } from "~/app/books/components/BooksLayoutWrapper";

vi.mock("~/lib/analytics", () => ({ capture: vi.fn(), captureOnce: vi.fn() }));

const book: BaseBook = {
  id: "reading-font",
  notionId: "reading-font",
  title: "Reading font",
  author: "Author",
  publicationYear: null,
  started: null,
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
  audibleUrl: null,
  notionUrl: "https://notion.so/reading-font",
};

function FontChoices() {
  const { setFont } = useFont();
  return (
    <>
      <button onClick={() => setFont("system")}>Use System</button>
      <button onClick={() => setFont("literata")}>Use Literata</button>
    </>
  );
}

let stylesheet: HTMLStyleElement;
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
  localStorage.clear();
  document.documentElement.dataset.bookFont = "georgia";
  // Exercise the production font cascade without unrelated Tailwind directives.
  const fontRules = new Set<string>();
  postcss
    .parse(readFileSync("src/styles/globals.css", "utf8"))
    .walkDecls("--font-selected", (declaration) => {
      const rule = declaration.parent;
      if (rule?.type === "rule") fontRules.add(rule.toString());
    });
  stylesheet = document.createElement("style");
  stylesheet.textContent = [...fontRules].join("\n");
  document.head.append(stylesheet);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  stylesheet?.remove();
  localStorage.clear();
  delete document.documentElement.dataset.bookFont;
  delete document.documentElement.dataset.world;
});

const selectedFont = (element: Element) =>
  getComputedStyle(element).getPropertyValue("--font-selected").trim();

function readingViews(isModal: boolean) {
  return (
    <FontProvider>
      <p data-testid="outside-books">Main website content</p>
      <BooksLayoutWrapper>
        <span>Library</span>
      </BooksLayoutWrapper>
      {createPortal(
        <BookDetailContent
          book={book}
          isLoadingNotes={false}
          copied={false}
          onShare={vi.fn()}
          bookId={book.id}
          isModal={isModal}
        />,
        document.body,
      )}
      <FontChoices />
    </FontProvider>
  );
}

describe("book reading font scope", () => {
  it.each([false, true])(
    "updates the library and portaled details without changing the host page, modal=%s",
    (isModal) => {
      document.documentElement.dataset.world = "illustrated";
      render(readingViews(isModal));
      const scopes = document.querySelectorAll("[data-book-font-scope]");
      expect(scopes).toHaveLength(2);
      const outside = screen.getByTestId("outside-books");
      const outsideBefore = getComputedStyle(outside).fontFamily;

      fireEvent.click(screen.getByText("Use System"));
      for (const scope of scopes) {
        expect(selectedFont(scope)).toContain("ui-sans-serif");
      }
      expect(selectedFont(document.documentElement)).toBe('"Georgia Pro"');
      expect(selectedFont(outside)).not.toContain("ui-sans-serif");
      expect(getComputedStyle(outside).fontFamily).toBe(outsideBefore);
      expect(localStorage.getItem("font-preference")).toBe("system");

      fireEvent.click(screen.getByText("Use Literata"));
      for (const scope of scopes) {
        expect(selectedFont(scope)).toBe("var(--font-literata)");
      }
      expect(selectedFont(document.documentElement)).toBe('"Georgia Pro"');
      expect(getComputedStyle(outside).fontFamily).toBe(outsideBefore);
    },
  );

  it("restores an existing font preference only in Books containers", () => {
    localStorage.setItem("font-preference", "literata");
    render(readingViews(true));
    for (const scope of document.querySelectorAll("[data-book-font-scope]")) {
      expect(selectedFont(scope)).toBe("var(--font-literata)");
    }
    expect(selectedFont(document.documentElement)).toBe('"Georgia Pro"');
  });
});
