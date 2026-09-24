import type * as Drizzle from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { bookTags, books } from "~/server/db/schema";

import type { NotionBook } from "./notion";
import { syncBooksFromNotion } from "./sync";

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  notes: vi.fn(),
  enrich: vi.fn(),
  updateNotion: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  writes: [] as Array<{
    table: unknown;
    values?: Record<string, unknown>;
    id?: unknown;
    kind: string;
  }>,
  syncId: 0,
  globalRuns: 0,
}));
vi.mock("~/env", () => ({ env: { NOTION_API_KEY: "test" } }));
vi.mock("drizzle-orm", async (original) => ({
  ...(await original<typeof Drizzle>()),
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));
vi.mock("./notion", () => ({
  fetchBooksFromNotion: mocks.catalog,
  fetchBookDetails: mocks.notes,
  ensureWebsiteProperty: vi.fn(),
  WEBSITE_PROPERTY: "Website",
}));
vi.mock("./metadataEnrichment", () => ({ enrichNotionBook: mocks.enrich }));
vi.mock("./notionClient", () => ({
  createBookNotionClient: () => ({ pages: { update: mocks.updateNotion } }),
}));
vi.mock("./coverColor.server", () => ({
  resolveCoverColor: vi.fn(async () => "#123456"),
}));
vi.mock("~/server/db", () => {
  const database = {
    select: () => ({
      from: () => ({ where: async () => [{ count: mocks.globalRuns }] }),
    }),
    query: {
      books: {
        findMany: async () => mocks.rows.map((row) => ({ ...row })),
        findFirst: async ({ where }: { where: { value: unknown } }) => {
          const row = mocks.rows.find((r) => r.notionId === where.value);
          return row ? { ...row, tags: [] } : undefined;
        },
      },
    },
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        mocks.writes.push({ table, values, kind: "insert" });
        if (values.triggeredBy === "cron" || values.triggeredBy === "manual")
          mocks.globalRuns++;
        if (table === books) {
          const existing = mocks.rows.find((r) => r.id === values.id);
          if (existing && existing.notionId !== values.notionId)
            throw new Error("duplicate book primary key");
          if (existing) Object.assign(existing, values);
          else mocks.rows.push({ ...values });
        }
        return {
          returning: async () => [{ id: ++mocks.syncId }],
          onConflictDoUpdate: async () => undefined,
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async ({ value }: { value: unknown }) => {
          mocks.writes.push({ table, values, id: value, kind: "update" });
          if (table === books)
            for (const row of mocks.rows)
              if (row.notionId === value) Object.assign(row, values);
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async ({ value }: { value: unknown }) => {
        mocks.writes.push({ table, id: value, kind: "delete" });
        if (table === books)
          mocks.rows = mocks.rows.filter((r) => r.notionId !== value);
      },
    }),
    transaction: async <T>(fn: (db: unknown) => Promise<T>) => fn(database),
  };
  return { db: database };
});
const complete: NotionBook = {
  id: "superintelligence",
  notionId: "target",
  title: "Superintelligence",
  author: "Nick Bostrom",
  publicationYear: 2014,
  started: "2026-01-01",
  finished: null,
  abandoned: null,
  abandonedAtMin: null,
  rating: null,
  audioLengthMin: 857,
  pageCount: 352,
  coverUrl: "https://example.com/oup.jpg",
  audibleUrl: "https://www.audible.com/pd/B00LPMD72K",
  tags: ["AI"],
  hasNotes: true,
  hasSummary: false,
  isAutomated: false,
  isFeatured: false,
  notionUrl: "https://notion.so/target",
  websiteUrl: "https://books.chappyasel.com/superintelligence",
  lastEditedTime: "2026-01-01T00:00:00Z",
};
function stored(book: NotionBook) {
  return {
    ...book,
    notes: "Saved notes",
    lastEditedTime: new Date(book.lastEditedTime),
    coverColor: "#123456",
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("External services disabled in sync tests");
    }),
  );
  mocks.syncId = 0;
  mocks.globalRuns = 0;
  mocks.writes = [];
  mocks.rows = [stored(complete)];
  mocks.catalog.mockResolvedValue([{ ...complete }]);
  mocks.notes.mockImplementation(async () => ({
    ...complete,
    notes: "Fresh notes",
  }));
  mocks.enrich.mockImplementation(async (book: NotionBook) => book);
  mocks.updateNotion.mockResolvedValue({});
});
it("retries empty author and cover on unchanged pages without downloading notes", async () => {
  const incomplete = { ...complete, author: "", coverUrl: null };
  mocks.catalog.mockResolvedValue([incomplete]);
  mocks.rows = [stored(incomplete)];
  mocks.enrich.mockResolvedValue(complete);
  const result = await syncBooksFromNotion("manual");
  expect(mocks.enrich).toHaveBeenCalledOnce();
  expect(mocks.notes).not.toHaveBeenCalled();
  expect(mocks.rows[0]).toMatchObject({
    author: "Nick Bostrom",
    coverUrl: complete.coverUrl,
  });
  expect(result.bookIdsToInvalidate).toContain("superintelligence");
});
it("keeps recovered metadata and previous notes/watermark after notes fail", async () => {
  mocks.catalog.mockResolvedValue([
    {
      ...complete,
      author: "",
      coverUrl: null,
      lastEditedTime: "2026-02-01T00:00:00Z",
    },
  ]);
  mocks.rows = [stored({ ...complete, author: "", coverUrl: null })];
  mocks.enrich.mockResolvedValue({
    ...complete,
    lastEditedTime: "2026-02-01T00:00:00Z",
  });
  mocks.notes.mockRejectedValue(new Error("Notes unavailable"));
  const result = await syncBooksFromNotion("manual");
  expect(mocks.rows[0]).toMatchObject({
    author: complete.author,
    coverUrl: complete.coverUrl,
    notes: "Saved notes",
    lastEditedTime: new Date(complete.lastEditedTime),
  });
  expect(result.errors).toHaveLength(1);
});
it("uses acknowledged metadata even if detail fetching returns stale properties", async () => {
  mocks.rows = [];
  mocks.catalog.mockResolvedValue([
    { ...complete, author: "", coverUrl: null },
  ]);
  mocks.enrich.mockResolvedValue(complete);
  mocks.notes.mockResolvedValue({
    ...complete,
    author: "",
    coverUrl: null,
    notes: "Fresh notes",
  });
  await syncBooksFromNotion("manual");
  expect(mocks.rows[0]).toMatchObject({
    author: complete.author,
    coverUrl: complete.coverUrl,
    notes: "Fresh notes",
  });
});
it("targeted refresh writes only the selected book and never deletes unrelated rows", async () => {
  const unrelated = {
    ...complete,
    notionId: "other",
    id: "other",
    title: "Other",
    author: "",
    coverUrl: null,
  };
  mocks.catalog.mockResolvedValue([complete, unrelated]);
  const absent = { ...complete, notionId: "absent", id: "absent" };
  mocks.rows = [
    stored({ ...complete, author: "" }),
    stored(unrelated),
    stored(absent),
  ];
  const snapshots = structuredClone(mocks.rows.slice(1));
  await syncBooksFromNotion("manual", undefined, { onlyNotionIds: ["target"] });
  expect(mocks.rows.slice(1)).toEqual(snapshots);
  expect(
    mocks.writes.filter((w) => w.table === books && w.kind === "delete"),
  ).toEqual([]);
  expect(
    mocks.enrich.mock.calls.every(
      ([book]) => (book as NotionBook).notionId === "target",
    ),
  ).toBe(true);
  expect(
    mocks.updateNotion.mock.calls.every(
      ([args]) => (args as { page_id: string }).page_id === "target",
    ),
  ).toBe(true);
});
it("targeted refresh rejects a catalog-derived slug collision with an unrelated stored reading", async () => {
  const other = { ...complete, notionId: "other", finished: "2025-01-01" };
  const target = { ...complete, finished: "2026-01-01" };
  mocks.rows = [
    stored({ ...target, id: "superintelligence-bostrom" }),
    stored(other),
  ];
  mocks.catalog.mockResolvedValue([target, other]);
  await expect(
    syncBooksFromNotion("manual", undefined, { onlyNotionIds: ["target"] }),
  ).rejects.toThrow(/slug.*collision/i);
  expect(
    mocks.writes.filter((w) => w.table === books || w.table === bookTags),
  ).toEqual([]);
  expect(mocks.updateNotion).not.toHaveBeenCalled();
});
it("migrates a selected reread's author-dependent slug and Website even when notes fail", async () => {
  const other = { ...complete, notionId: "other", finished: "2026-05-01" };
  const target = {
    ...complete,
    id: "superintelligence-2014",
    author: "",
    finished: "2025-01-01",
    websiteUrl: "https://books.chappyasel.com/superintelligence-2014",
  };
  mocks.catalog.mockResolvedValue([
    { ...target, lastEditedTime: "2026-02-01T00:00:00Z" },
    other,
  ]);
  mocks.rows = [stored(target), stored(other)];
  mocks.enrich.mockImplementation(async (book: NotionBook) => ({
    ...book,
    author: complete.author,
  }));
  mocks.notes.mockRejectedValue(new Error("Notes unavailable"));
  const result = await syncBooksFromNotion("manual", undefined, {
    onlyNotionIds: ["target"],
  });
  expect(mocks.rows.find((r) => r.notionId === "target")).toMatchObject({
    id: "superintelligence-bostrom",
    author: complete.author,
    notes: "Saved notes",
    lastEditedTime: new Date(complete.lastEditedTime),
  });
  expect(mocks.updateNotion).toHaveBeenCalledWith({
    page_id: "target",
    properties: {
      Website: {
        type: "url",
        url: "https://books.chappyasel.com/superintelligence-bostrom",
      },
    },
  });
  expect(result.bookIdsToInvalidate).toContain("superintelligence-2014");
  expect(result.bookIdsToWarm).toContain("superintelligence-bostrom");
});
it("rejects empty or unknown target lists without falling back to global writes", async () => {
  await expect(
    syncBooksFromNotion("manual", undefined, { onlyNotionIds: [] }),
  ).rejects.toThrow();
  await expect(
    syncBooksFromNotion("manual", undefined, { onlyNotionIds: ["unknown"] }),
  ).rejects.toThrow();
  expect(
    mocks.writes.filter((w) => w.table === books || w.table === bookTags),
  ).toEqual([]);
});
it("is idempotent across repeated completed runs", async () => {
  await syncBooksFromNotion("manual");
  await syncBooksFromNotion("manual");
  expect(mocks.enrich).not.toHaveBeenCalled();
  expect(mocks.notes).not.toHaveBeenCalled();
  expect(
    mocks.writes
      .filter((w) => w.table === books)
      .every((w) =>
        Object.keys(w.values ?? {}).every((key) => key === "lastSyncedAt"),
      ),
  ).toBe(true);
});
it("attempts a new incomplete page immediately while reserving retry slots for unchanged pages", async () => {
  const oldPages = Array.from({ length: 45 }, (_, i) => ({
    ...complete,
    id: `old-${i}`,
    title: `Old ${i}`,
    notionId: `old-${i}`,
    author: "",
    coverUrl: null,
    websiteUrl: `https://books.chappyasel.com/old-${i}`,
  }));
  const newcomer = {
    ...complete,
    notionId: "zz-new",
    title: "New Book",
    author: "",
    coverUrl: null,
  };
  mocks.catalog.mockResolvedValue([...oldPages, newcomer]);
  mocks.rows = oldPages.map(stored);
  mocks.enrich.mockImplementation(async (book: NotionBook) => book);
  await syncBooksFromNotion("manual");
  const attempted = mocks.enrich.mock.calls.map(
    ([book]) => (book as NotionBook).notionId,
  );
  expect(attempted).toContain("zz-new");
  expect(attempted.filter((id) => id.startsWith("old-"))).toHaveLength(20);
});
it("rotates unresolved unchanged records across repeated runs after upstream misses", async () => {
  const oldPages = Array.from({ length: 45 }, (_, i) => ({
    ...complete,
    id: `old-${i}`,
    title: `Old ${i}`,
    notionId: `old-${i}`,
    author: "",
    coverUrl: null,
    websiteUrl: `https://books.chappyasel.com/old-${i}`,
  }));
  mocks.catalog.mockResolvedValue(oldPages);
  mocks.rows = oldPages.map(stored);
  for (let run = 0; run < 3; run++) await syncBooksFromNotion("manual");
  expect(
    new Set(
      mocks.enrich.mock.calls.map(([book]) => (book as NotionBook).notionId),
    ).size,
  ).toBe(45);
  expect(mocks.notes).not.toHaveBeenCalled();
});
it("scoped maintenance runs cannot skip retry windows in later global runs", async () => {
  const oldPages = Array.from({ length: 40 }, (_, i) => ({
    ...complete,
    id: `old-${i}`,
    title: `Old ${i}`,
    notionId: `old-${i}`,
    author: "",
    coverUrl: null,
    websiteUrl: `https://books.chappyasel.com/old-${i}`,
  }));
  mocks.catalog.mockResolvedValue(oldPages);
  mocks.rows = oldPages.map(stored);
  await syncBooksFromNotion("manual");
  await syncBooksFromNotion("manual", undefined, { onlyNotionIds: ["old-0"] });
  await syncBooksFromNotion("cron");
  expect(
    new Set(
      mocks.enrich.mock.calls.map(([book]) => (book as NotionBook).notionId),
    ).size,
  ).toBe(40);
});
it("global refresh releases a removed reading's clean slug before migrating its surviving reread", async () => {
  const survivor = {
    ...complete,
    id: "superintelligence-bostrom",
    finished: "2024-01-01",
  };
  const removed = { ...complete, notionId: "removed", finished: "2025-01-01" };
  mocks.rows = [stored(survivor), stored(removed)];
  mocks.catalog.mockResolvedValue([survivor]);
  const result = await syncBooksFromNotion("manual");
  expect(result.booksDeleted).toBe(1);
  expect(mocks.rows).toHaveLength(1);
  expect(mocks.rows[0]).toMatchObject({
    notionId: "target",
    id: "superintelligence",
    notes: "Saved notes",
  });
});
it("complete new pages do not consume initial metadata lookup capacity", async () => {
  const ready = Array.from({ length: 10 }, (_, i) => ({
    ...complete,
    notionId: `a-${i}`,
    title: `New ${i}`,
  }));
  const missing = {
    ...complete,
    notionId: "z-missing",
    title: "Missing",
    author: "",
    coverUrl: null,
  };
  mocks.rows = [];
  mocks.catalog.mockResolvedValue([...ready, missing]);
  await syncBooksFromNotion("manual");
  expect(mocks.enrich).toHaveBeenCalledExactlyOnceWith(missing);
});
