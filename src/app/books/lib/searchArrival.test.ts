// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withoutSearchHighlight } from "~/lib/books/searchHighlight";

import { markSearchArrival, takeSearchArrivalQuery } from "./searchArrival";

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
  const marked = () =>
    [...registry.values()].flatMap((highlight) =>
      highlight.ranges.map((range) => String(range)),
    );

  it("marks the words, holds, then fades them out step by step", () => {
    markSearchArrival(notes(), "trust");

    expect([...registry.keys()]).toEqual(["book-search-arrival-25"]);
    expect(marked()).toEqual(["Trust", "trust"]);
    expect(
      document.querySelector("style[data-book-search-arrival]")?.textContent,
    ).toContain("::highlight(book-search-arrival-25)");

    vi.advanceTimersByTime(3499);
    expect([...registry.keys()]).toEqual(["book-search-arrival-25"]);
    vi.advanceTimersByTime(1);
    expect([...registry.keys()]).toEqual(["book-search-arrival-22"]);
    vi.advanceTimersByTime(7 * 75);
    expect([...registry.keys()]).toEqual(["book-search-arrival-2"]);
    vi.advanceTimersByTime(75);
    expect(registry.size).toBe(0);
  });

  it("re-reads the notes, so replaced text is still marked", () => {
    const root = document.body.appendChild(notes());
    markSearchArrival(root, "trust");
    // A re-render swaps the text nodes the first marks pointed at.
    root.innerHTML = "<h2>Trust</h2><p>Earned trust</p>";
    vi.advanceTimersByTime(150);
    expect(marked()).toEqual(["Trust", "trust"]);
    for (const range of registry.get("book-search-arrival-25")!.ranges)
      expect(range.startContainer.isConnected).toBe(true);
    root.remove();
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

  it("leaves the notes unmarked where the Highlight API is missing", () => {
    vi.stubGlobal("Highlight", undefined);
    expect(() => markSearchArrival(notes(), "trust")()).not.toThrow();
    vi.stubGlobal("CSS", {});
    expect(() => markSearchArrival(notes(), "trust")()).not.toThrow();
    expect(
      document.querySelector("style[data-book-search-arrival]"),
    ).toBeNull();
  });
});

describe("takeSearchArrivalQuery", () => {
  it("hands Next's patched replaceState a plain state, so the router syncs", () => {
    window.history.replaceState(
      { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: 1 }, modal: true },
      "",
      "/books/behave?q=trust&hl=trust",
    );
    const replace = vi.spyOn(window.history, "replaceState");

    takeSearchArrivalQuery();

    // Next skips its router sync for a state carrying __NA or _N.
    expect(replace).toHaveBeenCalledWith(
      { modal: true },
      "",
      "/books/behave?q=trust",
    );
    replace.mockRestore();
  });

  it("returns ?hl= once and removes only it, keeping the entry's state", () => {
    const state = { book: "modal" };
    window.history.replaceState(
      state,
      "",
      "/books/behave?q=trust&hl=trust#3-x",
    );

    expect(takeSearchArrivalQuery()).toBe("trust");
    expect(window.location.search).toBe("?q=trust");
    expect(window.location.hash).toBe("#3-x");
    expect(window.history.state).toEqual(state);
    expect(takeSearchArrivalQuery()).toBeNull();
  });
});

describe("withoutSearchHighlight", () => {
  it("drops only the arrival mark", () => {
    expect(withoutSearchHighlight("q=trust&hl=trust&tags=Sociology")).toBe(
      "q=trust&tags=Sociology",
    );
  });
});
