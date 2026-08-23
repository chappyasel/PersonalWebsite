// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchResult, SearchResultGroup } from "./types";
import {
  type ServerSearchPayload,
  createSearchSessionCache,
  preserveSelectedResultId,
  useProgressiveSearch,
} from "./useProgressiveSearch";

function result(id: string, group: SearchResultGroup): SearchResult {
  return {
    id,
    kind: "content",
    group,
    label: id,
    href: `/${group}/${id}`,
    matchKind: "exact",
    score: 1_000,
  };
}

function serverPayload({
  books = [],
  weightlifting = [],
  dad = [],
}: Partial<
  Record<"books" | "weightlifting" | "dad", SearchResult[]>
> = {}): ServerSearchPayload {
  return {
    groups: {
      books: { status: "success", results: books },
      weightlifting: { status: "success", results: weightlifting },
      dad: { status: "success", results: dad },
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("useProgressiveSearch", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("waits for two characters and a 140ms debounce", async () => {
    const cache = createSearchSessionCache();
    const searchPublic = vi.fn(async () => []);
    const searchServer = vi.fn(async () => serverPayload());
    const { rerender } = renderHook(
      ({ query }) =>
        useProgressiveSearch({
          query,
          enabled: true,
          searchPublic,
          searchServer,
          cache,
        }),
      { initialProps: { query: "a" } },
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => Promise.resolve());
    expect(searchPublic).not.toHaveBeenCalled();
    expect(searchServer).not.toHaveBeenCalled();

    rerender({ query: "ab" });
    act(() => {
      vi.advanceTimersByTime(139);
    });
    expect(searchPublic).not.toHaveBeenCalled();
    expect(searchServer).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    await act(async () => Promise.resolve());
    expect(searchPublic).toHaveBeenCalledOnce();
    expect(searchServer).toHaveBeenCalledOnce();
  });

  it("aborts and ignores a superseded query", async () => {
    const cache = createSearchSessionCache();
    const firstPublic = deferred<SearchResult[]>();
    const firstServer = deferred<ServerSearchPayload>();
    const secondPublic = deferred<SearchResult[]>();
    const secondServer = deferred<ServerSearchPayload>();
    const signals: AbortSignal[] = [];
    const searchPublic = vi
      .fn<(query: string, signal: AbortSignal) => Promise<SearchResult[]>>()
      .mockImplementationOnce((_query, signal) => {
        signals.push(signal);
        return firstPublic.promise;
      })
      .mockImplementationOnce((_query, signal) => {
        signals.push(signal);
        return secondPublic.promise;
      });
    const searchServer = vi
      .fn<
        (query: string, signal: AbortSignal) => Promise<ServerSearchPayload>
      >()
      .mockImplementationOnce((_query, signal) => {
        signals.push(signal);
        return firstServer.promise;
      })
      .mockImplementationOnce((_query, signal) => {
        signals.push(signal);
        return secondServer.promise;
      });
    const { result: hook, rerender } = renderHook(
      ({ query }) =>
        useProgressiveSearch({
          query,
          enabled: true,
          searchPublic,
          searchServer,
          cache,
        }),
      { initialProps: { query: "alpha" } },
    );

    act(() => {
      vi.advanceTimersByTime(140);
    });
    rerender({ query: "beta" });
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    act(() => {
      vi.advanceTimersByTime(140);
    });

    await act(async () => {
      firstPublic.resolve([result("stale-public", "public-writing")]);
      firstServer.resolve(
        serverPayload({ books: [result("stale-book", "books")] }),
      );
      await Promise.resolve();
    });
    expect(hook.current.results.map((item) => item.id)).not.toContain(
      "stale-public",
    );
    expect(hook.current.results.map((item) => item.id)).not.toContain(
      "stale-book",
    );

    await act(async () => {
      secondPublic.resolve([result("fresh-public", "public-writing")]);
      secondServer.resolve(
        serverPayload({ books: [result("fresh-book", "books")] }),
      );
      await Promise.resolve();
    });
    expect(hook.current.results.map((item) => item.id)).toEqual([
      "fresh-book",
      "fresh-public",
    ]);
  });

  it("caches public groups but never retains Dad results", async () => {
    const cache = createSearchSessionCache();
    const searchPublic = vi.fn(async () => [
      result("public", "public-writing"),
    ]);
    const secondServer = deferred<ServerSearchPayload>();
    const searchServer = vi
      .fn<
        (query: string, signal: AbortSignal) => Promise<ServerSearchPayload>
      >()
      .mockResolvedValueOnce(
        serverPayload({
          books: [result("book", "books")],
          weightlifting: [result("lift", "weightlifting")],
          dad: [result("protected", "dad")],
        }),
      )
      .mockReturnValueOnce(secondServer.promise);
    const { result: hook, rerender } = renderHook(
      ({ enabled }) =>
        useProgressiveSearch({
          query: "search",
          enabled,
          searchPublic,
          searchServer,
          cache,
        }),
      { initialProps: { enabled: true } },
    );

    act(() => {
      vi.advanceTimersByTime(140);
    });
    await act(async () => Promise.resolve());
    expect(hook.current.results.map((item) => item.id)).toContain("protected");

    rerender({ enabled: false });
    expect(hook.current.results).toEqual([]);
    rerender({ enabled: true });
    act(() => {
      vi.advanceTimersByTime(140);
    });

    expect(searchPublic).toHaveBeenCalledOnce();
    expect(searchServer).toHaveBeenCalledTimes(2);
    expect(hook.current.results.map((item) => item.id)).toEqual([
      "book",
      "public",
      "lift",
    ]);
    expect(hook.current.groups.dad.status).toBe("loading");

    await act(async () => {
      secondServer.resolve(
        serverPayload({
          books: [result("book", "books")],
          weightlifting: [result("lift", "weightlifting")],
          dad: [],
        }),
      );
      await Promise.resolve();
    });
    expect(hook.current.results.map((item) => item.id)).not.toContain(
      "protected",
    );
  });

  it("isolates provider errors and waits to declare zero results", async () => {
    const cache = createSearchSessionCache();
    const publicSearch = deferred<SearchResult[]>();
    const serverSearch = deferred<ServerSearchPayload>();
    const searchPublic = vi.fn(() => publicSearch.promise);
    const searchServer = vi.fn(() => serverSearch.promise);
    const { result: hook } = renderHook(() =>
      useProgressiveSearch({
        query: "nothing",
        enabled: true,
        searchPublic,
        searchServer,
        cache,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(140);
    });
    expect(hook.current.isSettledZero).toBe(false);
    await act(async () => {
      publicSearch.reject(new Error("private provider detail"));
      await Promise.resolve();
    });
    expect(hook.current.groups["public-writing"].status).toBe("error");
    expect(hook.current.isSettledZero).toBe(false);

    await act(async () => {
      serverSearch.resolve(serverPayload());
      await Promise.resolve();
    });
    expect(hook.current.isSettledZero).toBe(true);
  });
});

describe("preserveSelectedResultId", () => {
  it("preserves a selected result by ID as earlier groups arrive", () => {
    const results = [
      result("book", "books"),
      result("public", "public-writing"),
    ];

    expect(preserveSelectedResultId("public", results)).toBe("public");
    expect(preserveSelectedResultId("gone", results)).toBe("book");
    expect(preserveSelectedResultId(undefined, [])).toBeUndefined();
  });
});
