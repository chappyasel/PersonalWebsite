import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runPipeline: vi.fn(), readCatalog: vi.fn() }));
vi.mock("~/lib/bookCoverEmojis/pipeline", () => ({ runPipeline: mocks.runPipeline }));
vi.mock("./catalog", () => ({ readCloudCatalog: mocks.readCatalog }));

const { syncBookEmojis } = await import("./cloud");

const WORKSPACE = "859fbc85-7644-4498-88d8-e0229d8cea32";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runPipeline.mockResolvedValue({ failed: [] });
  for (const [key, value] of Object.entries({
    BOOK_COVER_EMOJIS_WORKSPACE_ID: WORKSPACE,
    NOTION_API_KEY: "ntn_test",
    DATABASE_URL: "postgres://localhost/test",
    AWS_BUCKET_NAME: "bucket",
    AWS_REGION: "us-west-2",
  })) {
    vi.stubEnv(key, value);
  }
});
afterEach(() => vi.unstubAllEnvs());

it("names the missing variable rather than failing obscurely", async () => {
  for (const name of [
    "NOTION_API_KEY",
    "DATABASE_URL",
    "AWS_BUCKET_NAME",
    "AWS_REGION",
  ]) {
    vi.stubEnv(name, "");
    await expect(syncBookEmojis()).rejects.toThrow(`Missing ${name}`);
    vi.unstubAllEnvs();
    beforeEachEnv();
  }
});

function beforeEachEnv() {
  for (const [key, value] of Object.entries({
    BOOK_COVER_EMOJIS_WORKSPACE_ID: WORKSPACE,
    NOTION_API_KEY: "ntn_test",
    DATABASE_URL: "postgres://localhost/test",
    AWS_BUCKET_NAME: "bucket",
    AWS_REGION: "us-west-2",
  })) {
    vi.stubEnv(key, value);
  }
}

it("needs no workspace variable, and still checks an override", async () => {
  vi.stubEnv("BOOK_COVER_EMOJIS_WORKSPACE_ID", "");
  await syncBookEmojis();
  expect(mocks.runPipeline).toHaveBeenCalledWith(
    expect.objectContaining({ workspaceId: WORKSPACE }),
  );

  vi.stubEnv("BOOK_COVER_EMOJIS_WORKSPACE_ID", "Personal");
  await expect(syncBookEmojis()).rejects.toThrow("Invalid workspace ID");
});

it("runs bounded and applying, inside the function's own time limit", async () => {
  await syncBookEmojis();
  expect(mocks.runPipeline).toHaveBeenCalledWith(
    expect.objectContaining({
      apply: true,
      workspaceId: WORKSPACE,
      maxWorks: 20,
      budgetMs: 240_000,
    }),
  );
});
