import type { SearchResult } from "../types";
import { describe, expect, it, vi } from "vitest";

import {
  MAX_PROVIDER_RESULTS,
  MAX_SEARCH_QUERY_LENGTH,
  type ServerSearchDependencies,
  createSearchResponse,
  parseSearchQuery,
  runServerSearch,
} from "./search";

function result(group: SearchResult["group"], index: number): SearchResult {
  return {
    id: `${group}-${index}`,
    kind: "content",
    group,
    label: `${group} result ${index}`,
    href: `https://www.chappyasel.com/${group}/${index}`,
    matchKind: "prefix",
    score: 900 - index,
  };
}

function dependencies(
  overrides: Partial<ServerSearchDependencies> = {},
): ServerSearchDependencies {
  return {
    books: vi.fn(async () => [result("books", 0)]),
    weightlifting: vi.fn(async () => [result("weightlifting", 0)]),
    ...overrides,
  };
}

describe("parseSearchQuery", () => {
  it("normalizes a bounded query", () => {
    expect(parseSearchQuery("  Café---Racer  ")).toBe("cafe racer");
  });

  it("rejects absent, short, and oversized queries", () => {
    expect(parseSearchQuery(null)).toBeNull();
    expect(parseSearchQuery("a")).toBeNull();
    expect(
      parseSearchQuery("x".repeat(MAX_SEARCH_QUERY_LENGTH + 1)),
    ).toBeNull();
  });
});

describe("runServerSearch", () => {
  it("always returns fixed provider groups and skips unauthorized Dad search", async () => {
    const dad = vi.fn(async () => [result("dad", 0)]);
    const response = await runServerSearch("bench", dependencies({ dad }), {
      dadAuthorized: false,
      timeoutMs: 50,
    });

    expect(Object.keys(response.groups)).toEqual([
      "books",
      "weightlifting",
      "dad",
    ]);
    expect(response.groups.books.status).toBe("success");
    expect(response.groups.weightlifting.status).toBe("success");
    expect(response.groups.dad).toEqual({ status: "skipped", results: [] });
    expect(dad).not.toHaveBeenCalled();
  });

  it("runs the Dad provider only after the route authorizes the request", async () => {
    const dad = vi.fn(async () => [result("dad", 0)]);
    const response = await runServerSearch("journal", dependencies({ dad }), {
      dadAuthorized: true,
      timeoutMs: 50,
    });

    expect(dad).toHaveBeenCalledOnce();
    expect(response.groups.dad.status).toBe("success");
    expect(response.groups.dad.results[0]?.group).toBe("dad");
  });

  it("caps every group at six results", async () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      result("books", index),
    );
    const response = await runServerSearch(
      "book",
      dependencies({ books: vi.fn(async () => many) }),
      { dadAuthorized: false, timeoutMs: 50 },
    );

    expect(response.groups.books.results).toHaveLength(MAX_PROVIDER_RESULTS);
  });

  it("projects provider results onto the public response allowlist", async () => {
    const unsafe = {
      ...result("books", 0),
      body: "complete private notes",
      internalPath: "/srv/content/private.md",
      excerpt: "<script>steal()</script>safe text",
    };
    const response = await runServerSearch(
      "book",
      dependencies({ books: vi.fn(async () => [unsafe]) }),
      { dadAuthorized: false, timeoutMs: 50 },
    );
    const serialized = JSON.stringify(response.groups.books.results);

    expect(serialized).not.toContain("complete private notes");
    expect(serialized).not.toContain("internalPath");
    expect(serialized).not.toContain("script");
    expect(serialized).toContain("safe text");
  });

  it("reports one provider failure without exposing its exception", async () => {
    const response = await runServerSearch(
      "book",
      dependencies({
        books: vi.fn(async () => {
          throw new Error("postgres://secret@host/private");
        }),
      }),
      { dadAuthorized: false, timeoutMs: 50 },
    );

    expect(response.groups.books).toEqual({ status: "error", results: [] });
    expect(response.groups.weightlifting.status).toBe("success");
    expect(JSON.stringify(response)).not.toContain("secret");
  });

  it("bounds a provider that ignores abort signals", async () => {
    vi.useFakeTimers();
    const responsePromise = runServerSearch(
      "book",
      dependencies({
        books: vi.fn(
          () => new Promise<readonly SearchResult[]>(() => undefined),
        ),
      }),
      { dadAuthorized: false, timeoutMs: 25 },
    );

    await vi.advanceTimersByTimeAsync(25);
    const response = await responsePromise;
    vi.useRealTimers();

    expect(response.groups.books.status).toBe("error");
    expect(response.groups.weightlifting.status).toBe("success");
  });
});

describe("createSearchResponse", () => {
  it("returns exact private cache headers on success", async () => {
    const response = await createSearchResponse(
      new Request("https://www.chappyasel.com/api/search?q=bench"),
      dependencies(),
      { dadAuthorized: false, timeoutMs: 50 },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("returns a redacted 400 response with the same cache policy", async () => {
    const response = await createSearchResponse(
      new Request("https://www.chappyasel.com/api/search?q=x"),
      dependencies(),
      { dadAuthorized: false },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_query" });
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
  });
});
