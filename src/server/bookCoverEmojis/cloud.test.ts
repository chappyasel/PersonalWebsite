import { build } from "esbuild";
import { expect, it, vi } from "vitest";

import { EmojiStore } from "~/lib/bookCoverEmojis/store";

import type { CloudCatalogRow } from "./catalog";
import { produceCloudCovers } from "./cloud";
import { fakeS3 } from "./fakeS3";

const row = (title: string, notionId = title): CloudCatalogRow => ({
  id: title,
  notionId,
  title,
  author: "A",
  publicationYear: null,
  finished: null,
  abandoned: null,
  coverUrl: "https://example.com/cover",
  coverColor: null,
  lastEditedTime: "today",
});
function setup(rows: CloudCatalogRow[]) {
  const fake = fakeS3();
  const store = new EmojiStore({ bucket: "fake", region: "fake" }, fake.client);
  const download = vi.fn().mockResolvedValue({
    ok: true,
    bytes: Buffer.from("cover"),
    contentType: "image/png",
    attempts: 1,
  });
  const render = vi.fn().mockResolvedValue({ png: Buffer.from("png") });
  const options = {
    store,
    workspaceId: "workspace",
    readCatalog: async () => rows,
    fetchCover: download,
    render,
    now: () => 1_000_000,
  };
  return { fake, store, download, render, options };
}

it("groups exact reread page IDs and skips unchanged covers without fetch/render", async () => {
  const { options, store, download, render } = setup([
    row("Test", "p1"),
    { ...row("Test", "p2"), id: "test-reread" },
  ]);
  expect((await produceCloudCovers(options)).created).toBe(1);
  expect((await store.getRevision("book-test", 1))?.value.pages).toEqual([
    { notionId: "p1", bookId: "Test" },
    { notionId: "p2", bookId: "test-reread" },
  ]);
  expect((await produceCloudCovers(options)).unchanged).toBe(1);
  expect(download).toHaveBeenCalledTimes(1);
  expect(render).toHaveBeenCalledTimes(1);
});

it("refreshes changed mapping and artwork, and periodically rechecks stable URLs", async () => {
  const rows = [row("Test", "p1")];
  const { options, render, store } = setup(rows);
  await produceCloudCovers(options);
  rows.push(row("Test", "p2"));
  expect((await produceCloudCovers(options)).pagesChanged).toBe(1);
  render.mockResolvedValue({ png: Buffer.from("changed art") });
  expect(
    (await produceCloudCovers({ ...options, now: () => 8 * 86400_000 }))
      .artworkChanged,
  ).toBe(1);
  expect((await store.getHead("book-test"))?.value.emojiRevision).toBe(2);
});

it("checkpoints bounded batches and continues beyond a failed download", async () => {
  const { options, download, store } = setup([row("A"), row("B"), row("C")]);
  download.mockResolvedValueOnce({
    ok: false,
    reason: "private URL",
    attempts: 1,
  });
  const first = await produceCloudCovers({ ...options, maxWorks: 1 });
  expect(first.failed).toEqual([
    { workId: "book-a", error: "cover processing failed" },
  ]);
  expect(first.created).toBe(0);
  expect(first.deferred).toBe(2);
  const next = await produceCloudCovers({ ...options, maxWorks: 1 });
  expect(next.created).toBe(1);
  expect(await store.getHead("book-b")).not.toBeNull();
  expect(await store.getHead("book-a")).toBeNull();
});

it("reports missing covers, isolates individual failures, and makes no writes if DB snapshot fails", async () => {
  const { options, fake } = setup([{ ...row("A"), coverUrl: null }, row("B")]);
  const result = await produceCloudCovers(options);
  expect(result.failed).toEqual([{ workId: "book-a", error: "missing cover" }]);
  expect(result.created).toBe(1);
  const before = fake.writes.length;
  await expect(
    produceCloudCovers({
      ...options,
      readCatalog: async () => {
        throw new Error("DB unavailable");
      },
    }),
  ).rejects.toThrow("DB unavailable");
  expect(fake.writes).toHaveLength(before);
});

it("stops before starting work when the time budget is exhausted", async () => {
  const { options, download } = setup([row("A")]);
  const result = await produceCloudCovers({ ...options, budgetMs: 40_000 });
  expect(result.deferred).toBe(1);
  expect(download).not.toHaveBeenCalled();
});

it("bundles the cron's application imports without CLI, filesystem, cookies, or browser code", async () => {
  const result = await build({
    entryPoints: ["src/app/api/cron/sync-book-emojis/route.ts"],
    bundle: true,
    write: false,
    metafile: true,
    platform: "node",
    packages: "external",
    tsconfig: "tsconfig.json",
  });
  const inputs = Object.keys(result.metafile.inputs);
  expect(inputs).toContain("scripts/book-cover-emojis/render.ts");
  expect(inputs).toContain("scripts/book-cover-emojis/grouping.ts");
  expect(inputs).toContain("scripts/book-cover-emojis/fetch.ts");
  expect(inputs.join("\n")).not.toMatch(
    /worker|cookies|scripts\/book-cover-emojis\/(catalog|run|cli|seed)\.ts|lib\/books\/sync/,
  );
  const external = Object.values(result.metafile.inputs).flatMap((input) =>
    input.imports.filter((entry) => entry.external).map((entry) => entry.path),
  );
  expect(external.join("\n")).not.toMatch(
    /node:fs|^fs$|playwright|puppeteer|dotenv|notion/i,
  );
});

it("invalidates the source cache when another producer changes only the page mapping", async () => {
  const { options, store, download } = setup([row("Test", "p1")]);
  await produceCloudCovers(options);
  const current = (await store.getRevision("book-test", 1))!.value;
  const head = (await store.getHead("book-test"))!;
  await store.putRevision({
    ...current,
    revision: 2,
    pages: [{ notionId: "old-page", bookId: "old-slug" }],
  });
  await store.putHead({ ...head.value, revision: 2 }, head.etag);
  const result = await produceCloudCovers(options);
  expect(result.pagesChanged).toBe(1);
  expect(download).toHaveBeenCalledTimes(2);
  expect((await store.getRevision("book-test", 3))?.value.pages).toEqual([
    { notionId: "p1", bookId: "Test" },
  ]);
});

it("repairs a cached legacy name immediately while keeping valid cached covers unchanged", async () => {
  const names = await import("~/lib/bookCoverEmojis/emojiNames");
  const currentNameFor = names.emojiNameFor;
  const legacyPolicy = vi
    .spyOn(names, "emojiNameFor")
    .mockImplementation((base, revision, maxLength) =>
      currentNameFor(base, revision, maxLength ?? 64),
    );
  const title = "A long book title that exceeds the forty nine character limit";
  const workId =
    "book-a-long-book-title-that-exceeds-the-forty-nine-character-limit";
  const { options, store, download } = setup([
    row(title, "p1"),
    row("Short", "p2"),
  ]);
  try {
    expect((await produceCloudCovers(options)).created).toBe(2);
  } finally {
    legacyPolicy.mockRestore();
  }
  const original = (await store.getRevision(workId, 1))!.value;
  expect(original.emojiName.length).toBeGreaterThan(49);
  const result = await produceCloudCovers(options);
  expect(result).toMatchObject({
    nameChanged: 1,
    unchanged: 1,
    rendered: 1,
    created: 0,
    artworkChanged: 0,
    pagesChanged: 0,
    failed: [],
  });
  expect(download).toHaveBeenCalledTimes(3);
  expect((await store.getRevision(workId, 1))!.value).toEqual(original);
  const updated = (await store.getRevision(workId, 2))!.value;
  expect(updated.emojiName.length).toBeLessThan(50);
  expect(updated.sha256).toBe(original.sha256);
  expect(updated.emojiRevision).toBe(original.emojiRevision);
  expect(await produceCloudCovers(options)).toMatchObject({
    nameChanged: 0,
    unchanged: 2,
    rendered: 0,
  });
});

it("queues a new book late in cursor order ahead of weekly rechecks", async () => {
  // Seed a catalog whose names sort before the new one, so rotation alone
  // would reach it last. With a 1-book budget that meant waiting days.
  const existing = ["Aaa", "Bbb", "Ccc", "Ddd"].map((title) => row(title));
  const { options, store, download } = setup(existing);
  for (const seeded of existing) {
    const pass = await produceCloudCovers({ ...options, maxWorks: 1 });
    expect(pass.failed, `seeding ${seeded.title}`).toEqual([]);
  }
  expect(download).toHaveBeenCalledTimes(existing.length);

  // A week later every existing book is due a recheck, and a new book arrives
  // whose name sorts last.
  const withNew = [...existing, row("Zzz")];
  const later = 1_000_000 + 8 * 86_400_000;
  download.mockClear();
  const result = await produceCloudCovers({
    ...options,
    readCatalog: async () => withNew,
    now: () => later,
    maxWorks: 1,
  });

  expect(result.created).toBe(1);
  const head = await store.getHead("book-zzz");
  expect(head?.value.workId).toBe("book-zzz");
  // The single unit of work went to the new book, not to a stale recheck.
  expect(download).toHaveBeenCalledTimes(1);
});

it("does not re-render a cover because its notes were edited", async () => {
  const { options, download, render } = setup([row("Notes")]);
  await produceCloudCovers(options);
  expect(download).toHaveBeenCalledTimes(1);

  // Same cover, same pages, later last-edit: notes changed, jacket did not.
  download.mockClear();
  render.mockClear();
  const edited = [{ ...row("Notes"), lastEditedTime: "later" }];
  const result = await produceCloudCovers({
    ...options,
    readCatalog: async () => edited,
  });
  expect(result.unchanged).toBe(1);
  expect(download).not.toHaveBeenCalled();
  expect(render).not.toHaveBeenCalled();
});

it("still prioritizes a changed cover URL over an untouched one", async () => {
  const { options, download } = setup([row("Aaa"), row("Zzz")]);
  await produceCloudCovers(options);
  download.mockClear();

  const moved = [
    row("Aaa"),
    { ...row("Zzz"), coverUrl: "https://example.com/new-cover" },
  ];
  const result = await produceCloudCovers({
    ...options,
    readCatalog: async () => moved,
    now: () => 1_000_000 + 8 * 86_400_000,
    maxWorks: 1,
  });
  expect(result.artworkChanged + result.unchanged).toBeGreaterThan(0);
  expect(download).toHaveBeenCalledTimes(1);
});
