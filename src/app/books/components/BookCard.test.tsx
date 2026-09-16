// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { bookCardVisualEffects } from "~/lib/books/cardVisualEffects";
import type { Book } from "~/lib/books/types";

import { BookCard } from "./BookCard";
import cardStyles from "./BookCard.module.css";

const { openModal } = vi.hoisted(() => ({ openModal: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  bookCardVisualEffects.setBackdropBlur(true);
});

vi.mock("../contexts/BookPreviewContext", () => ({
  useModalActions: () => ({ openModal }),
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
  coverColor: null,
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

describe("BookCard copy control", () => {
  it("highlights and copies within the control's transformed bounds", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    try {
      const { container } = render(
        <BookCard book={CURRENT_BOOK_WITHOUT_NOTES} />,
      );
      const card = container.querySelector("button")!;
      const copy = container.querySelector<HTMLElement>(`.${cardStyles.copy}`)!;
      vi.spyOn(card, "getBoundingClientRect").mockReturnValue(
        new DOMRect(100, 100, 170, 255),
      );
      // The projected control no longer occupies the card's nominal corner.
      vi.spyOn(copy, "getBoundingClientRect").mockReturnValue(
        new DOMRect(180, 100, 32, 32),
      );
      // The outer corner remains active outside the smaller visible circle.
      fireEvent.mouseMove(card, { clientX: 181, clientY: 101 });
      expect(copy.dataset.copyHovered).toBe("true");
      fireEvent.click(card, { clientX: 181, clientY: 101, detail: 1 });
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("/books/children-of-time"),
      );
      expect(openModal).not.toHaveBeenCalled();
      expect(copy.dataset.copyComplete).toBe("true");

      fireEvent.mouseMove(card, { clientX: 145, clientY: 240 });
      expect(copy.dataset.copyHovered).toBe("false");
      fireEvent.mouseMove(card, { clientX: 196, clientY: 116 });
      fireEvent.mouseLeave(card);
      expect(copy.dataset.copyHovered).toBe("false");
    } finally {
      if (originalClipboard)
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});

describe("BookCard cover overlay", () => {
  it("follows the detail page's length, reading dates, and rating order with fact icons", () => {
    const { container } = render(
      <BookCard
        book={{
          ...CURRENT_BOOK_WITHOUT_NOTES,
          finished: "2026-09-01",
          rating: 4,
        }}
      />,
    );
    const overlay = container.querySelector(`.${cardStyles.text}`)!;
    const facts = [
      ...overlay.querySelectorAll<HTMLElement>("[data-book-fact]"),
    ];
    expect(facts.map((fact) => fact.dataset.bookFact)).toEqual([
      "length",
      "read",
    ]);
    for (const fact of facts) {
      expect(fact.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
    const rating = overlay.querySelector('[aria-label="4 out of 5 stars"]')!;
    expect(
      facts[1]!.compareDocumentPosition(rating) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("adapts text to the jacket and keeps Author • Year", () => {
    const { container } = render(
      <BookCard
        book={{
          ...CURRENT_BOOK_WITHOUT_NOTES,
          coverColor: "#f5f0e1",
          rating: 4,
        }}
        isKeyboardFocused
      />,
    );
    const card = container.querySelector("button")!;
    expect(card.dataset.coverTone).toBe("light");
    expect(card.dataset.keyboardFocused).toBe("true");
    expect(card.style.getPropertyValue("--book-foreground")).toBe("#24231f");
    expect(
      container.querySelector(`.${cardStyles.text}`)?.textContent,
    ).toContain("Adrian Tchaikovsky•2015");
    expect(container.querySelectorAll(".text-yellow-400")).toHaveLength(4);
  });

  it.each(["#f5f0e1", "#122544"])(
    "keeps the same gold stars over cover %s",
    (coverColor) => {
      const { container } = render(
        <BookCard
          book={{ ...CURRENT_BOOK_WITHOUT_NOTES, coverColor, rating: 4 }}
        />,
      );
      expect(container.querySelectorAll(".text-yellow-400")).toHaveLength(4);
      expect(
        container.querySelector(".text-yellow-400")?.getAttribute("style"),
      ).toBeNull();
    },
  );

  it("uses softened charcoal for earned stars on a matching gold jacket", () => {
    const { container } = render(
      <BookCard
        book={{
          ...CURRENT_BOOK_WITHOUT_NOTES,
          coverColor: "#facc15",
          rating: 4,
        }}
      />,
    );
    const earnedStars =
      container.querySelectorAll<SVGElement>(".text-yellow-400");
    expect(earnedStars).toHaveLength(4);
    for (const star of earnedStars) {
      expect(star.style.color).toBe("rgba(36, 35, 31, 0.72)");
    }
    expect(
      container
        .querySelector(`.${cardStyles.emptyStar}`)
        ?.getAttribute("style"),
    ).toBeNull();
  });

  it.each(["S", "M", "L"] as const)(
    "clips the %s glass to the cover while keeping text outside the flattened plane",
    (size) => {
      const { container } = render(
        <BookCard
          book={{
            ...CURRENT_BOOK_WITHOUT_NOTES,
            coverUrl: "https://example.com/cover.jpg",
          }}
          size={size}
          isKeyboardFocused
        />,
      );
      const cover = container.querySelector("img")!;
      const overlay = container.querySelector(`.${cardStyles.overlay}`)!;
      const roundedClip = cover.closest(
        ".rounded-lg, .rounded-xl, .rounded-2xl",
      )!;
      expect(roundedClip.classList.contains("overflow-hidden")).toBe(true);
      expect(roundedClip.contains(overlay)).toBe(true);
      expect(overlay.parentElement).toBe(cover.parentElement);
      const text = container.querySelector(`.${cardStyles.text}`)!;
      expect(roundedClip.contains(text)).toBe(false);
      expect(text.closest(`.${cardStyles.floatingText}`)?.parentElement).toBe(
        roundedClip.parentElement,
      );
    },
  );

  it("removes blur layers live while retaining the readable tint and text", () => {
    const { container } = render(
      <BookCard book={CURRENT_BOOK_WITHOUT_NOTES} isKeyboardFocused />,
    );
    expect(container.querySelectorAll(`.${cardStyles.glass}`)).toHaveLength(3);
    act(() => bookCardVisualEffects.setBackdropBlur(false));
    expect(container.querySelectorAll(`.${cardStyles.glass}`)).toHaveLength(0);
    expect(container.querySelector(`.${cardStyles.wash}`)).not.toBeNull();
    expect(
      container.querySelector(`.${cardStyles.text}`)?.textContent,
    ).toContain("Children of Time");
    act(() => bookCardVisualEffects.setBackdropBlur(true));
    expect(container.querySelectorAll(`.${cardStyles.glass}`)).toHaveLength(3);
  });

  it("resizes the clipped material when the floating text changes height", () => {
    let notifyResize: () => void = vi.fn();
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notifyResize = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    try {
      const { container, unmount } = render(
        <BookCard book={CURRENT_BOOK_WITHOUT_NOTES} />,
      );
      const body = container.querySelector<HTMLElement>(
        `.${cardStyles.floatingText} > .${cardStyles.body}`,
      )!;
      const card = container.querySelector("button")!;
      expect(observe).toHaveBeenCalledWith(body);
      for (const height of [140, 180]) {
        Object.defineProperty(body, "offsetHeight", {
          configurable: true,
          value: height,
        });
        act(() => notifyResize());
        expect(card.style.getPropertyValue("--book-overlay-height")).toBe(
          `${height}px`,
        );
      }
      unmount();
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps XS covers free of overlays", () => {
    const { container } = render(
      <BookCard book={CURRENT_BOOK_WITHOUT_NOTES} size="XS" />,
    );
    expect(container.querySelector(`.${cardStyles.overlay}`)).toBeNull();
  });
});
