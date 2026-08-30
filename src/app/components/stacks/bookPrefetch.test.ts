import { describe, expect, it } from "vitest";

import { requestBookPrefetch, subscribeBookPrefetch } from "./bookPrefetch";

describe("book prefetch channel", () => {
  it("drains early requests and forwards live intent to the mounted provider", () => {
    requestBookPrefetch("queued-book");
    const received: string[] = [];
    const unsubscribe = subscribeBookPrefetch((bookId) =>
      received.push(bookId),
    );

    requestBookPrefetch("hovered-book");
    expect(received).toEqual(["queued-book", "hovered-book"]);

    unsubscribe();
  });
});
