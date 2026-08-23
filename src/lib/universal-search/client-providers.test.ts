import { describe, expect, it, vi } from "vitest";

import { queryServerSearch } from "./client-providers";

describe("queryServerSearch", () => {
  it("requests the private endpoint without browser caching", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            query: "bench press",
            groups: {
              books: { status: "success", results: [] },
              weightlifting: { status: "success", results: [] },
              dad: { status: "skipped", results: [] },
            },
          }),
          { status: 200 },
        ),
    );
    const signal = new AbortController().signal;

    await expect(
      queryServerSearch("bench press", signal, fetcher),
    ).resolves.toMatchObject({ groups: { dad: { status: "skipped" } } });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/search?q=bench%20press",
      expect.objectContaining({ cache: "no-store", signal }),
    );
  });

  it("does not expose response details when the endpoint fails", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "database secret" }), {
          status: 500,
        }),
    );

    await expect(
      queryServerSearch("books", new AbortController().signal, fetcher),
    ).rejects.toThrow("Search provider unavailable");
  });
});
