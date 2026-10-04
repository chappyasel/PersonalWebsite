import * as path from "path";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sync: vi.fn().mockResolvedValue({ totalVideos: 1 }),
}));
vi.mock("dotenv/config", () => ({}));
vi.mock("../src/lib/youtube/sync", () => ({ syncYouTube: mocks.sync }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("passes the configured history path to sync without accessing a live database", async () => {
  vi.stubEnv("YOUTUBE_TAKEOUT_DATA_DIR", "/fixture-worker/data");
  vi.stubEnv("YOUTUBE_TAKEOUT_STATE_DIR", "/fixture-worker/state");
  vi.stubEnv("YOUTUBE_TAKEOUT_CREDENTIALS_DIR", "/fixture-worker/credentials");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  const exit = vi
    .spyOn(process, "exit")
    .mockImplementation(() => undefined as never);
  await import("./sync-youtube");
  await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
  expect(mocks.sync).toHaveBeenCalledWith(
    "manual",
    path.join("/fixture-worker/data", "watch-history.json"),
  );
});
