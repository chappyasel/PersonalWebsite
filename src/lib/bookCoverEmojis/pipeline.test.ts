import { describe, expect, it } from "vitest";

import {
  type CatalogRow,
  groupCatalog,
} from "../../../scripts/book-cover-emojis/grouping";
import { TEST_WORKSPACE, fakeNotion } from "./fakeNotion";
import { fakeS3 } from "./fakeS3";
import { fileUrlKey } from "./iconPolicy";
import { RECHECK_MS, runPipeline } from "./pipeline";
import { EmojiStore, type PageRecord } from "./store";

const row = (over: Partial<CatalogRow> & { id: string; notionId: string }): CatalogRow => ({
  title: "The Mom Test",
  author: "Rob Fitzpatrick",
  publicationYear: 2013,
  finished: "2024-01-01",
  abandoned: null,
  coverUrl: "https://covers.example/mom-test.jpg",
  coverColor: "#987c78",
  ...over,
});

const MOM_A = "020c5b32-1db7-4ee7-aa6f-10f7defb2ac9";
const MOM_B = "340c5ab0-d88d-8064-a516-c5654c136679";

/** One work, two pages: the reread shape the whole design turns on. */
const REREAD: CatalogRow[] = [
  row({ id: "the-mom-test", notionId: MOM_A }),
  row({ id: "the-mom-test-2", notionId: MOM_B }),
];

function harness(options?: {
  rows?: CatalogRow[];
  pages?: Record<string, unknown>;
  cover?: Buffer;
  workspaceId?: string;
  now?: () => number;
}) {
  const rows = options?.rows ?? REREAD;
  const s3 = fakeS3();
  const store = new EmojiStore({ bucket: "b", region: "r" }, s3.client);
  const notion = fakeNotion({
    ...(options?.workspaceId ? { workspaceId: options.workspaceId } : {}),
    pages:
      options?.pages ??
      Object.fromEntries(rows.map((entry) => [entry.notionId, null])),
  });
  let art = options?.cover ?? Buffer.from("jacket-one");
  let clock = options?.now?.() ?? 1_700_000_000_000;
  const run = (over?: Parameters<typeof runPipeline>[0] extends infer T ? Partial<T> : never) =>
    runPipeline({
      store,
      notion: { token: "t", fetchImpl: notion.fetchImpl, sleep: async () => undefined },
      workspaceId: options?.workspaceId ?? TEST_WORKSPACE,
      readCatalog: async () => rows,
      apply: true,
      now: () => clock,
      fetchCover: async () => ({
        ok: true,
        bytes: art,
        contentType: "image/jpeg",
        attempts: 1,
      }),
      render: async (input: Buffer) => ({
        png: Buffer.concat([Buffer.from("png:"), input]),
        source: { width: 800, height: 1200, format: "jpeg" },
        art: { width: 341, height: 512, left: 85, top: 0 },
      }),
      ...over,
    });
  return {
    s3,
    store,
    notion,
    run,
    setArt: (next: Buffer) => {
      art = next;
    },
    advance: (ms: number) => {
      clock += ms;
    },
    pageRecord: async (id: string) => (await store.getPage(id))?.value ?? null,
  };
}

describe("duplicate avoidance", () => {
  it("uploads one file for a reread and puts it on both pages", async () => {
    const h = harness();
    const result = await h.run();

    expect(result.pagesApplied).toBe(2);
    expect(h.notion.countCalls("POST /v1/file_uploads")).toBe(2); // create + send
    expect(h.notion.uploads.size).toBe(1);
    expect(h.notion.attachments.size).toBe(1);

    const a = fileUrlKey((h.notion.iconOf(MOM_A) as { file: { url: string } }).file.url);
    const b = fileUrlKey((h.notion.iconOf(MOM_B) as { file: { url: string } }).file.url);
    expect(a).toBe(b);
  });

  it("re-attaches the stored upload on a recheck instead of uploading again", async () => {
    const h = harness();
    await h.run();
    const before = h.notion.uploads.size;

    // A week later the cover is downloaded again, but it has not changed.
    h.advance(RECHECK_MS + 1);
    const result = await h.run();

    expect(h.notion.uploads.size).toBe(before);
    expect(result.pagesAlreadyCorrect).toBe(2);
    expect(result.pagesApplied).toBe(0);
  });

  it("uploads again only when the artwork actually moves", async () => {
    const h = harness();
    await h.run();
    h.advance(RECHECK_MS + 1);
    h.setArt(Buffer.from("jacket-two"));

    const result = await h.run();
    expect(h.notion.uploads.size).toBe(2);
    expect(result.pagesApplied).toBe(2);
  });
});

describe("unchanged books cost nothing", () => {
  it("does not read a page or download a cover on the second run", async () => {
    const h = harness();
    await h.run();
    const reads = h.notion.countCalls("GET /v1/pages");

    const result = await h.run();
    expect(result.unchanged).toBe(1);
    expect(result.rendered).toBe(0);
    expect(h.notion.countCalls("GET /v1/pages")).toBe(reads);
  });
});

describe("icons people chose are left alone", () => {
  it("stands down on an image icon it has no record of, and settles it", async () => {
    const h = harness({
      pages: {
        [MOM_A]: {
          type: "custom_emoji",
          custom_emoji: { id: "someone-elses", name: "cat", url: "https://x/y.png" },
        },
        [MOM_B]: null,
      },
    });
    const result = await h.run();

    expect(result.pagesStoodDown).toBe(1);
    expect(result.pagesApplied).toBe(1);
    expect((await h.pageRecord(MOM_A))?.state).toBe("manual");
    expect(h.notion.iconOf(MOM_A)).toMatchObject({ type: "custom_emoji" });

    // Settled: a second run does not come back for it.
    const second = await h.run();
    expect(second.unchanged).toBe(1);
  });

  it("stops touching a page after a person changes the icon it set", async () => {
    const h = harness();
    await h.run();

    // Somebody replaces one page's icon by hand.
    h.notion.pages.get(MOM_A)!.icon = { type: "emoji", emoji: "🔥" };
    delete h.notion.pages.get(MOM_A)!.attachedUpload;
    h.advance(RECHECK_MS + 1);
    h.setArt(Buffer.from("jacket-two"));

    const result = await h.run();
    expect(result.pagesStoodDown).toBe(1);
    expect(h.notion.iconOf(MOM_A)).toEqual({ type: "emoji", emoji: "🔥" });
    expect((await h.pageRecord(MOM_A))?.state).toBe("manual");
    // The other page still gets the new artwork.
    expect(result.pagesApplied).toBe(1);
  });

  it("keeps the pre-automation icon through later writes", async () => {
    const h = harness({
      pages: { [MOM_A]: { type: "emoji", emoji: "📗" }, [MOM_B]: null },
    });
    await h.run();
    expect((await h.pageRecord(MOM_A))?.originalIcon).toEqual({
      type: "emoji",
      emoji: "📗",
    });

    h.advance(RECHECK_MS + 1);
    h.setArt(Buffer.from("jacket-two"));
    await h.run();

    // Not the file icon the first run put there.
    expect((await h.pageRecord(MOM_A))?.originalIcon).toEqual({
      type: "emoji",
      emoji: "📗",
    });
    expect((await h.pageRecord(MOM_B))?.originalIcon).toBeNull();
  });
});

describe("crash recovery", () => {
  it("finishes an intent left by a process that died before the upload", async () => {
    const h = harness();
    // The record says a write was starting, but no upload was ever made and
    // the page still has no icon. The next run should simply do the work.
    const intent: PageRecord = {
      notionId: MOM_A,
      workId: "book-the-mom-test",
      state: "intent",
      sha256: "a-sha-from-the-run-that-died",
      owned: null,
      target: null,
      uploadId: null,
      originalIcon: null,
      originalIconDescribed: "none",
      attempts: 1,
      at: new Date().toISOString(),
    };
    await h.store.putPage(intent);

    const result = await h.run();
    expect(result.pagesApplied).toBe(2);
    expect((await h.pageRecord(MOM_A))?.state).toBe("applied");
  });

  it("reuses the intent's upload even when the source record is lost too", async () => {
    const h = harness();
    await h.run();
    const uploads = h.notion.uploads.size;
    const applied = await h.pageRecord(MOM_A);

    // Crash window, plus the source object gone: the intent is all that is left.
    await h.store.putPage({ ...applied!, state: "intent", target: null, owned: null });
    h.s3.objects.delete("book-cover-emojis/sources/book-the-mom-test.json");

    const result = await h.run();
    expect(h.notion.uploads.size).toBe(uploads);
    expect(result.uploaded).toBe(0);
    expect((await h.pageRecord(MOM_A))?.state).toBe("applied");
  });

  it("re-attaches the same upload after a crash between PATCH and record", async () => {
    const h = harness();
    await h.run();
    const uploadsAfterFirst = h.notion.uploads.size;
    const applied = await h.pageRecord(MOM_A);

    // Simulate the crash window: the icon landed, the record still says intent.
    await h.store.putPage({ ...applied!, state: "intent", target: null, owned: null });
    h.advance(RECHECK_MS + 1);

    const result = await h.run();
    expect(h.notion.uploads.size).toBe(uploadsAfterFirst);
    expect((await h.pageRecord(MOM_A))?.state).toBe("applied");
    expect(result.failed).toEqual([]);
  });
});

describe("failures stay bounded", () => {
  it("stops attempting a page that has failed its limit and keeps going", async () => {
    const h = harness();
    await h.store.putPage({
      notionId: MOM_A,
      workId: "book-the-mom-test",
      state: "failed",
      sha256: "png:jacket-one-sha-unused",
      owned: null,
      target: null,
      uploadId: null,
      originalIcon: null,
      originalIconDescribed: "none",
      attempts: 3,
      at: new Date().toISOString(),
    });
    // The record's sha is stale, so this page is reopened, not skipped.
    const result = await h.run();
    expect(result.pagesApplied).toBe(2);
  });

  it("records an attempt and surfaces the failure when the PATCH fails", async () => {
    const h = harness();
    h.notion.failNext((path, method) =>
      method === "PATCH" && path.includes(MOM_A)
        ? new Response(JSON.stringify({ message: "boom" }), { status: 400 })
        : null,
    );
    const result = await h.run();

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.notionId).toBe(MOM_A);
    const record = await h.pageRecord(MOM_A);
    expect(record?.state).toBe("failed");
    expect(record?.attempts).toBe(1);
    // The other page of the reread still got its icon.
    expect(result.pagesApplied).toBe(1);
  });

  it("retries a transient upload failure rather than giving up", async () => {
    const h = harness();
    h.notion.failNext((path, method) =>
      method === "POST" && path.endsWith("/send")
        ? new Response(JSON.stringify({ message: "flaky" }), { status: 503 })
        : null,
    );
    const result = await h.run();
    expect(result.failed).toEqual([]);
    expect(result.pagesApplied).toBe(2);
  });
});

describe("safety rails", () => {
  it("refuses to write when the token is for another workspace", async () => {
    const h = harness({ workspaceId: "00000000-0000-0000-0000-000000000000" });
    await expect(
      h.run({ workspaceId: TEST_WORKSPACE }),
    ).rejects.toThrow(/expected 859fbc85/);
    expect(h.notion.countCalls("PATCH")).toBe(0);
    expect(h.s3.writes).toHaveLength(0);
  });

  it("writes nothing at all on a dry run", async () => {
    const h = harness();
    const result = await h.run({ apply: false });

    expect(result.pagesApplied).toBe(2);
    expect(h.notion.countCalls("PATCH")).toBe(0);
    expect(h.notion.uploads.size).toBe(0);
    expect(h.s3.writes).toHaveLength(0);
  });

  it("creates no upload when there is nothing to apply", async () => {
    // Both pages carry somebody else's icon, so the run stands down on both.
    const other = {
      type: "custom_emoji",
      custom_emoji: { id: "theirs", name: "cat", url: "https://x/y.png" },
    };
    const h = harness({ pages: { [MOM_A]: other, [MOM_B]: other } });
    const result = await h.run();

    expect(result.pagesStoodDown).toBe(2);
    // An upload nobody attaches expires in an hour; none should be made.
    expect(h.notion.uploads.size).toBe(0);
  });
});

describe("ordering", () => {
  it("puts a brand new book ahead of routine rechecks", async () => {
    const established: CatalogRow[] = [
      row({ id: "a-book", notionId: "11111111-1111-1111-1111-111111111111", title: "A Book" }),
      row({ id: "b-book", notionId: "22222222-2222-2222-2222-222222222222", title: "B Book" }),
    ];
    // Sorts last, so rotation by itself would defer it behind both rechecks.
    const arrival = row({
      id: "z-book",
      notionId: "33333333-3333-3333-3333-333333333333",
      title: "Z Book",
    });
    const all = [...established, arrival];
    const names = groupCatalog(all).map((group) => group.name);
    const newcomer = groupCatalog([arrival])[0]!.name;

    // Every page exists from the start; only the catalog the run sees changes.
    const h = harness({ rows: all });
    await h.run({
      onlyWorkIds: names.filter((name) => name !== newcomer),
    });

    h.advance(RECHECK_MS + 1);
    const result = await h.run({ maxWorks: 1 });

    expect(result.pagesApplied).toBe(1);
    expect(h.notion.iconOf("33333333-3333-3333-3333-333333333333")).toMatchObject({
      type: "file",
    });
  });
});

describe("recovering from a lost source record", () => {
  it("adopts the icon already on the page instead of uploading it again", async () => {
    const h = harness();
    await h.run();
    const uploads = h.notion.uploads.size;
    const record = await h.pageRecord(MOM_A);

    // The source record is what says "this artwork is already in Notion".
    // Drop it and the pages are the only remaining evidence.
    h.s3.objects.delete("book-cover-emojis/sources/book-the-mom-test.json");

    const result = await h.run();

    expect(h.notion.uploads.size).toBe(uploads);
    expect(result.uploaded).toBe(0);
    expect(result.pagesAlreadyCorrect).toBe(2);
    expect((await h.pageRecord(MOM_A))?.owned).toEqual(record?.owned);
  });
});
