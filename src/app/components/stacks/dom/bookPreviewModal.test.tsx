// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { HomepageBookPreview } from "~/lib/books/types";
import { recordModalOrigin } from "~/lib/originFlight";

import { requestBookPrefetch } from "../bookPrefetch";
import { useStacks } from "../store";
import { BookPreviewRow } from "./PlacardLayer";
import { BookCoverSizeGroup } from "./BookCoverSizeGroup";

vi.mock("../bookPrefetch", () => ({ requestBookPrefetch: vi.fn() }));
vi.mock("~/lib/originFlight", () => ({ recordModalOrigin: vi.fn() }));

const book: HomepageBookPreview = {
  id: "how-i-built-this",
  title: "How I Built This",
  author: "Guy Raz",
  coverUrl: null,
  started: "2026-09-11T19:00:00Z",
  finished: null,
  rating: 4,
  audioLengthMin: 631,
  pageCount: 347,
};

afterEach(() => {
  cleanup();
  useStacks.setState(useStacks.getInitialState());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each(["cover", "title", "author", "length", "date", "row"])(
  "opens the preview when clicking the %s and animates from the cover",
  (target) => {
    render(<BookPreviewRow book={book} />);
    const row = screen.getByRole("link");
    const cover = row.querySelector<HTMLElement>(".book-preview-cover")!;
    const rect = new DOMRect(10, 20, 64, 96);
    vi.spyOn(cover, "getBoundingClientRect").mockReturnValue(rect);
    const targets: Record<string, Element> = {
      cover,
      title: row.querySelector(".book-preview-title")!,
      author: screen.getByText(book.author),
      length: screen.getByText("10h 31m · ~347 pages"),
      date: screen.getByText("Started Sep 11th '26"),
      row,
    };

    expect(fireEvent.click(targets[target]!)).toBe(false);
    expect(useStacks.getState().pendingBookId).toBe(book.id);
    expect(requestBookPrefetch).toHaveBeenCalledWith(book.id);
    expect(recordModalOrigin).toHaveBeenCalledWith(rect);
    expect(row.querySelector("a, button")).toBeNull();
  },
);

it.each(["metaKey", "ctrlKey", "shiftKey", "altKey"])(
  "preserves the full notes link for %s clicks",
  (modifier) => {
    render(<BookPreviewRow book={book} />);
    const row = screen.getByRole("link");
    expect(fireEvent.click(row, { [modifier]: true })).toBe(true);
    expect(useStacks.getState().pendingBookId).toBeNull();
    expect(recordModalOrigin).not.toHaveBeenCalled();
    expect(row.getAttribute("href")).toContain(book.id);
    expect(row.getAttribute("target")).toBe("_blank");
  },
);

it("prefetches the book when the row receives keyboard focus", () => {
  render(<BookPreviewRow book={book} />);
  fireEvent.focus(screen.getByRole("link"));
  expect(requestBookPrefetch).toHaveBeenCalledWith(book.id);
});

it("shares the tallest visible text height across current and recent books", () => {
  let notifyResize: (() => void) | undefined;
  let pendingFrame: FrameRequestCallback | undefined;
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { notifyResize = callback; }
    observe = vi.fn();
    disconnect = disconnect;
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    pendingFrame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());

  const heights = new Map([["Current book", 78], ["Recent book", 97], ["Hidden book", 0]]);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return heights.get(this.querySelector(".book-preview-title")?.textContent ?? "") ?? 0;
  });
  const { container, unmount } = render(
    <BookCoverSizeGroup>
      <BookPreviewRow book={{ ...book, id: "current", title: "Current book", rating: null }} />
      <BookPreviewRow book={{ ...book, id: "recent", title: "Recent book", finished: "2026-09-13T19:00:00Z" }} />
      <BookPreviewRow book={{ ...book, id: "hidden", title: "Hidden book" }} />
    </BookCoverSizeGroup>,
  );
  const group = container.firstElementChild as HTMLElement;
  const sharedHeight = () => group.style.getPropertyValue("--book-preview-cover-height");
  expect(sharedHeight()).toBe("97px");

  const resize = () => {
    notifyResize?.();
    pendingFrame?.(0);
    pendingFrame = undefined;
  };
  // Missing stars must not create a smaller cover for the current book.
  heights.set("Current book", 65);
  resize();
  expect(sharedHeight()).toBe("97px");

  // Font or width changes recalculate the common height in both directions.
  heights.set("Recent book", 109);
  resize();
  expect(sharedHeight()).toBe("109px");
  heights.set("Recent book", 89);
  resize();
  expect(sharedHeight()).toBe("89px");

  heights.set("Current book", 0);
  heights.set("Recent book", 0);
  resize();
  expect(sharedHeight()).toBe("89px");
  heights.set("Hidden book", 113);
  resize();
  expect(sharedHeight()).toBe("113px");
  unmount();
  expect(disconnect).toHaveBeenCalled();
});
