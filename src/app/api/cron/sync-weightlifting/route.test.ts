import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

import { WorkoutSyncBusyError } from "~/lib/weightlifting/sync";

import { GET, POST } from "./route";

const mocks = vi.hoisted(() => ({
  sync: vi.fn(),
  tag: vi.fn(),
  path: vi.fn(),
}));
vi.mock("~/env", () => ({ env: { CRON_SECRET: "test-secret" } }));
vi.mock("next/cache", () => ({
  revalidateTag: mocks.tag,
  revalidatePath: mocks.path,
}));
vi.mock("~/lib/weightlifting/sync", () => ({
  syncWeightlifting: mocks.sync,
  WorkoutSyncBusyError: class extends Error {},
}));
const request = (source?: string, auth = true) =>
  new NextRequest("https://example.com/api/cron/sync-weightlifting", {
    headers: {
      ...(auth ? { authorization: "Bearer test-secret" } : {}),
      ...(source ? { "x-workout-sync-source": source } : {}),
    },
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.sync.mockResolvedValue({ skipped: true });
});
it("requires authentication even with the S3 source header", async () => {
  expect((await POST(request("s3", false))).status).toBe(401);
  expect(mocks.sync).not.toHaveBeenCalled();
});
it("records S3 deliveries and retries cache invalidation after an unchanged import", async () => {
  expect((await POST(request("s3"))).status).toBe(200);
  expect(mocks.sync).toHaveBeenCalledWith("s3");
  expect(mocks.tag).toHaveBeenCalledTimes(2);
  expect(mocks.path).toHaveBeenCalledWith("/");
});
it("leaves caches alone for an unchanged daily fallback", async () => {
  expect((await GET(request())).status).toBe(200);
  expect(mocks.sync).toHaveBeenCalledWith("cron");
  expect(mocks.tag).not.toHaveBeenCalled();
});
it("asks callers to retry an overlapping sync", async () => {
  mocks.sync.mockRejectedValue(new WorkoutSyncBusyError());
  const result = await POST(request("s3"));
  expect(result.status).toBe(503);
  expect(result.headers.get("retry-after")).toBe("30");
});
