import type * as NextServer from "next/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

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

afterEach(() => {
  vi.useRealTimers();
});

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

it("keeps the scheduled cron synchronous so its response carries the result", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T22:00:40Z")); // 3 PM PDT
  const response = await GET(request());
  expect(await response.json()).toMatchObject({ success: true, result });
  expect(mocks.lock).toHaveBeenCalledOnce();
  expect(mocks.after).toHaveLength(0);
});

it.each([
  ["3 AM PDT", "2026-09-29T10:00:40Z", true],
  ["4 AM PDT", "2026-09-29T11:00:40Z", false],
  ["2 PM PST", "2026-12-01T22:00:40Z", false],
  ["3 PM PST", "2026-12-01T23:00:40Z", true],
])(
  "syncs from the cron only at 3 AM and 3 PM Pacific (%s)",
  async (_label, at, runs) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(at));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledTimes(runs ? 1 : 0);
  },
);
