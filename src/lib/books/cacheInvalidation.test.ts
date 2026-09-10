import { afterEach, describe, expect, it, vi } from "vitest";

import {
  invalidateBookCachePaths,
  refreshBookCachesAfterSync,
} from "./cacheInvalidation";

const cache = vi.hoisted(() => ({ path: vi.fn(), tag: vi.fn() }));
vi.mock("next/cache", () => ({
  revalidatePath: cache.path,
  revalidateTag: cache.tag,
}));
vi.mock("server-only", () => ({}));
vi.mock("~/server/queries/books", () => ({ BOOKS_DATA_TAG: "books-data" }));
vi.mock("~/env", () => ({ env: { CRON_SECRET: "test" } }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("book cache refresh", () => {
  it("invalidates the homepage when the protected endpoint refreshes the collection", () => {
    invalidateBookCachePaths(["book"]);
    expect(cache.path).toHaveBeenCalledWith("/");
    expect(cache.path).toHaveBeenCalledWith("/books");
  });

  it("refreshes both canonical production domains and warms images only on books", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const fetch = vi.fn(async () =>
      Response.json({
        attempted: true,
        invalidated: 1,
        warmed: 1,
        warmFailures: [],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await refreshBookCachesAfterSync(
      { bookIdsToInvalidate: ["book"], bookIdsToWarm: ["book"] },
      "cron",
    );
    expect(result.error).toBeUndefined();
    expect(fetch.mock.calls).toHaveLength(2);
    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([url]) => url)).toEqual([
      "https://www.chappyasel.com/api/revalidate-book-caches",
      "https://books.chappyasel.com/api/revalidate-book-caches",
    ]);
    expect(
      calls.map(
        ([, init]) =>
          (JSON.parse(init.body as string) as { bookIdsToWarm: string[] })
            .bookIdsToWarm,
      ),
    ).toEqual([[], ["book"]]);
  });
});
