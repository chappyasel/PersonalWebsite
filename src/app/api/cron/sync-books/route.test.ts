import type * as NextServer from "next/server";
import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

const mocks = vi.hoisted(() => ({
  after: [] as Array<() => Promise<void>>,
  sync: vi.fn(),
  lock: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof NextServer>()),
  after: (task: () => Promise<void>) => mocks.after.push(task),
}));
vi.mock("~/env", () => ({ env: { CRON_SECRET: "test-secret" } }));
vi.mock("~/lib/books/sync", () => ({
  syncBooksFromNotion: mocks.sync,
  withBookSyncLock: mocks.lock,
}));
vi.mock("~/lib/books/cacheInvalidation", () => ({
  refreshBookCachesAfterSync: mocks.refresh,
}));

const request = (auth = true) =>
  new NextRequest("https://www.chappyasel.com/api/cron/sync-books", {
    method: "POST",
    headers: auth ? { authorization: "Bearer test-secret" } : {},
  });
const result = {
  bookIdsToInvalidate: ["the-power-law"],
  bookIdsToWarm: ["the-power-law"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.after.length = 0;
  mocks.sync.mockResolvedValue(result);
  mocks.lock.mockImplementation((run: () => Promise<unknown>) => run());
  mocks.refresh.mockResolvedValue({ attempted: true });
});

it("answers a Notion button before syncing, then syncs after the response", async () => {
  const response = POST(request());
  expect(response.status).toBe(202);
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(mocks.after).toHaveLength(1);

  await mocks.after[0]!();
  expect(mocks.lock).toHaveBeenCalledOnce();
  expect(mocks.sync).toHaveBeenCalledWith("manual", expect.any(Function));
  expect(mocks.refresh).toHaveBeenCalledWith(result, "manual");
});

it("logs a failed background sync instead of throwing after the response", async () => {
  mocks.lock.mockRejectedValue(new Error("busy"));
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  POST(request());
  await expect(mocks.after[0]!()).resolves.toBeUndefined();
  expect(error).toHaveBeenCalledWith("Webhook sync failed:", expect.any(Error));
  error.mockRestore();
});

it("rejects an unauthenticated webhook without scheduling a sync", () => {
  expect(POST(request(false)).status).toBe(401);
  expect(mocks.after).toHaveLength(0);
});

it("keeps the daily cron synchronous so its response carries the result", async () => {
  const response = await GET(request());
  expect(await response.json()).toMatchObject({ success: true, result });
  expect(mocks.lock).toHaveBeenCalledOnce();
  expect(mocks.after).toHaveLength(0);
});
