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
  vi.stubEnv("BOOK_COVER_EMOJIS_ENABLED", "true");
  mocks.sync.mockResolvedValue({ failed: [], contended: 0, created: 1 });
});
afterEach(() => vi.unstubAllEnvs());
it("fails closed without a secret and rejects wrong credentials", async () => {
  expect((await GET(request("wrong"))).status).toBe(401);
  vi.stubEnv("CRON_SECRET", "");
  expect((await GET(request("undefined"))).status).toBe(401);
  expect(mocks.sync).not.toHaveBeenCalled();
});
it("requires explicit enablement", async () => {
  vi.stubEnv("BOOK_COVER_EMOJIS_ENABLED", "");
  expect(await (await GET(request())).json()).toEqual({
    skipped: true,
    reason: "disabled",
  });
  expect(mocks.sync).not.toHaveBeenCalled();
});
it("reports persisted counts under the bounded separate invocation", async () => {
  expect(maxDuration).toBe(300);
  expect(await (await GET(request())).json()).toMatchObject({
    success: true,
    created: 1,
  });
});
it("contains provider failure and does not expose its message", async () => {
  mocks.sync.mockRejectedValue(new Error("secret signed URL"));
  const response = await GET(request());
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain(
    "secret signed URL",
  );
});

it("includes name-only migrations in the cron response", async () => {
  mocks.sync.mockResolvedValue({
    failed: [],
    contended: 0,
    created: 0,
    nameChanged: 1,
  });
  expect(await (await GET(request())).json()).toMatchObject({
    success: true,
    created: 0,
    nameChanged: 1,
  });
});
