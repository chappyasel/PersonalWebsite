import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { GET, maxDuration } from "./route";

const mocks = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock("~/server/bookCoverEmojis/cloud", () => ({
  syncBookEmojis: mocks.sync,
}));

const request = (token = "secret") =>
  new NextRequest("https://example.com/api/cron/sync-book-emojis", {
    headers: { authorization: `Bearer ${token}` },
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "secret");

  mocks.sync.mockResolvedValue({ failed: [], pagesApplied: 1, unchanged: 3 });
});
afterEach(() => vi.unstubAllEnvs());

it("fails closed without a secret and rejects wrong credentials", async () => {
  expect((await GET(request("wrong"))).status).toBe(401);
  vi.stubEnv("CRON_SECRET", "");
  expect((await GET(request("undefined"))).status).toBe(401);
  expect(mocks.sync).not.toHaveBeenCalled();
});

it("runs without any opt-in variable being set", async () => {
  expect(await (await GET(request())).json()).toMatchObject({ success: true });
  expect(mocks.sync).toHaveBeenCalled();
});

it("can be stopped with the kill switch alone", async () => {
  vi.stubEnv("BOOK_COVER_EMOJIS_DISABLED", "true");
  expect(await (await GET(request())).json()).toEqual({
    skipped: true,
    reason: "disabled",
  });
  expect(mocks.sync).not.toHaveBeenCalled();
});

it("reports what the run did, inside its own bounded invocation", async () => {
  expect(maxDuration).toBe(300);
  expect(await (await GET(request())).json()).toMatchObject({
    success: true,
    pagesApplied: 1,
    unchanged: 3,
  });
});

it("is not successful when a book failed", async () => {
  mocks.sync.mockResolvedValue({
    failed: [{ workId: "book-x", error: "cover download failed" }],
    pagesApplied: 0,
  });
  expect(await (await GET(request())).json()).toMatchObject({ success: false });
});

it("contains provider failure and does not expose its message", async () => {
  mocks.sync.mockRejectedValue(new Error("secret signed URL"));
  const response = await GET(request());
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain("secret signed URL");
});
