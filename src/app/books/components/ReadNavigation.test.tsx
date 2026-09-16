import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BookReading } from "~/lib/books/types";

import { ReadNavigation } from "./ReadNavigation";

const readings: BookReading[] = ["first", "second", "third"].map((id) => ({
  id,
  started: null,
  finished: "2026-01-01",
  abandoned: null,
  abandonedAtMin: null,
  rating: 4,
}));

function render(bookId: string, history = readings, booksHref?: string) {
  return renderToStaticMarkup(
    <ReadNavigation bookId={bookId} readings={history} booksHref={booksHref} />,
  );
}

describe("reread navigation", () => {
  it("links the middle read to the adjacent notes using IDs even when dates match", () => {
    const markup = render("second");
    expect(markup).toContain('href="/books/first"');
    expect(markup).toContain('aria-label="Previous read: 1st read"');
    expect(markup).toContain('href="/books/third"');
    expect(markup).toContain('aria-label="Next read: 3rd read"');
  });

  it("hides missing directions without wrapping", () => {
    expect(render("first")).not.toContain("Previous read");
    expect(render("first")).toContain("Next read: 2nd read");
    expect(render("third")).toContain("Previous read: 2nd read");
    expect(render("third")).not.toContain("Next read");
    expect(render("first", readings.slice(0, 1))).toBe("");
    expect(render("unknown")).toBe("");
  });

  it("skips abandoned attempts and retains ongoing reads", () => {
    const history = [
      readings[0]!,
      { ...readings[1]!, abandoned: "2026-01-02", finished: null },
      { ...readings[2]!, finished: null },
    ];
    expect(render("first", history)).toContain('href="/books/third"');
    expect(render("first", history)).toContain("Next read: 2nd read");
    expect(render("third", history)).toContain('href="/books/first"');
  });

  it("links external modals to the dedicated Books host", () => {
    expect(
      render("second", readings, "https://books.chappyasel.com"),
    ).toContain('href="https://books.chappyasel.com/first"');
  });
});
