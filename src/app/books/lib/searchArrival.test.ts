// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { markSearchArrival } from "./searchArrival";

class FakeHighlight {
  ranges: Range[];
  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
}

describe("markSearchArrival", () => {
  const registry = new Map<string, FakeHighlight>();

  beforeEach(() => {
    vi.useFakeTimers();
    registry.clear();
    vi.stubGlobal("CSS", { highlights: registry });
    vi.stubGlobal("Highlight", FakeHighlight);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.head.innerHTML = "";
  });

  function notes() {
    const root = document.createElement("div");
    root.innerHTML = "<p>Trust is built slowly; trust breaks fast.</p>";
    return root;
  }

  it("marks the words, holds, then fades them out step by step", () => {
    markSearchArrival(notes(), "trust");

    expect([...registry.keys()]).toEqual(["book-search-arrival"]);
    expect(
      registry.get("book-search-arrival")!.ranges.map((range) => String(range)),
    ).toEqual(["Trust", "trust"]);
    expect(
      document.querySelector("style[data-book-search-arrival]")?.textContent,
    ).toContain("::highlight(book-search-arrival)");

    vi.advanceTimersByTime(3500);
    expect([...registry.keys()]).toEqual(["book-search-arrival-fade-1"]);
    vi.advanceTimersByTime(3 * 150);
    expect([...registry.keys()]).toEqual(["book-search-arrival-fade-4"]);
    vi.advanceTimersByTime(150);
    expect(registry.size).toBe(0);
  });

  it("clears the marks when the page cleans up early", () => {
    const cleanup = markSearchArrival(notes(), "trust");
    cleanup();
    vi.advanceTimersByTime(10_000);
    expect(registry.size).toBe(0);
  });

  it("does nothing without a query or a match", () => {
    markSearchArrival(notes(), null);
    markSearchArrival(notes(), "dopamine");
    expect(registry.size).toBe(0);
    expect(
      document.querySelector("style[data-book-search-arrival]"),
    ).toBeNull();
  });
});
