import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getBootReadingBooks,
  publishBootReadingBooks,
  resetBootReadingBooks,
  subscribeBootReadingBooks,
} from "./bootReadingBooks";

afterEach(resetBootReadingBooks);

describe("boot reading-book handoff", () => {
  it("publishes exact book identities and sampled edge colors", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeBootReadingBooks(listener);
    const clear = publishBootReadingBooks({
      books: [
        { id: "current-one", coverSrc: "/covers/current-one.webp" },
        { id: "current-two", coverSrc: "/covers/current-two.webp" },
      ],
      colors: {
        "current-one": { edge: "#a84f35", source: "edge" },
        "current-two": { edge: "#3f7355", source: "edge" },
      },
    });

    expect(getBootReadingBooks()).toEqual({
      books: [
        { id: "current-one", coverSrc: "/covers/current-one.webp" },
        { id: "current-two", coverSrc: "/covers/current-two.webp" },
      ],
      colors: {
        "current-one": { edge: "#a84f35", source: "edge" },
        "current-two": { edge: "#3f7355", source: "edge" },
      },
    });
    expect(listener).toHaveBeenCalledOnce();

    clear();
    expect(getBootReadingBooks()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("does not let an obsolete bridge cleanup erase newer data", () => {
    const clearFirst = publishBootReadingBooks({
      books: [{ id: "first" }],
      colors: {},
    });
    publishBootReadingBooks({ books: [{ id: "newest" }], colors: {} });

    clearFirst();
    expect(getBootReadingBooks()?.books).toEqual([{ id: "newest" }]);
  });
});
