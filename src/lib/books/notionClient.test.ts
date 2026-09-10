import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({ env: { NOTION_API_KEY: "test" } }));

describe("book Notion request scheduling", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("spaces requests from separate clients through the same queue", async () => {
    const fetch = vi.fn(async () => Response.json({ object: "page" }));
    vi.stubGlobal("fetch", fetch);
    const { createBookNotionClient } = await import("./notionClient");
    const a = createBookNotionClient().pages.retrieve({ page_id: "a" });
    const b = createBookNotionClient().pages.retrieve({ page_id: "b" });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(349);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([a, b]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries only the failed request and pauses other clients during Retry-After", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json(
          {
            object: "error",
            status: 429,
            code: "rate_limited",
            message: "Wait",
            additional_data: { retry_after: "1" },
          },
          { status: 429, headers: { "retry-after": "1" } },
        ),
      )
      .mockImplementation(async () => Response.json({ object: "page" }));
    vi.stubGlobal("fetch", fetch);
    const { createBookNotionClient } = await import("./notionClient");
    const a = createBookNotionClient().pages.retrieve({ page_id: "a" });
    const b = createBookNotionClient().pages.retrieve({ page_id: "b" });
    await vi.advanceTimersByTimeAsync(1249);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all([a, b]);
    expect(
      fetch.mock.calls.map(
        ([url]) => new URL(url instanceof Request ? url.url : url).pathname,
      ),
    ).toEqual(["/v1/pages/a", "/v1/pages/a", "/v1/pages/b"]);
  });
});
