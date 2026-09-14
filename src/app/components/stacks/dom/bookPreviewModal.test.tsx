// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { HomepageBookPreview } from "~/lib/books/types";
import { recordModalOrigin } from "~/lib/originFlight";

import { requestBookPrefetch } from "../bookPrefetch";
import { useStacks } from "../store";
import { BookPreviewRow } from "./PlacardLayer";

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
