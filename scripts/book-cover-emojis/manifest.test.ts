import { type CatalogRow, groupCatalog } from "./grouping";
import {
  type AssetEntry,
  buildRowEntries,
  countManifest,
  planWork,
  refreshReusedAsset,
} from "./manifest";
import { describe, expect, it } from "vitest";

function row(overrides: Partial<CatalogRow> & { notionId: string }): CatalogRow {
  return {
    id: overrides.notionId,
    title: "A Title",
    author: "Some Author",
    publicationYear: null,
    finished: null,
    abandoned: null,
    coverUrl: "https://example.test/cover.jpg",
    coverColor: null,
    ...overrides,
  };
}

const catalog = [
  row({ notionId: "n1", id: "zero-to-one", title: "Zero to One", author: "Peter Thiel" }),
  row({ notionId: "n2", id: "zero-to-one-2019", title: "Zero to One", author: "Peter Thiel" }),
  row({ notionId: "n3", id: "the-body", title: "The Body", author: "Bill Bryson" }),
  row({ notionId: "n4", id: "no-cover", title: "No Cover", author: "Ann Author", coverUrl: null }),
];

function asset(name: string, overrides: Partial<AssetEntry> = {}): AssetEntry {
  return {
    name,
    file: `emoji/${name}.png`,
    status: "success",
    title: name,
    author: "Some Author",
    publicationYear: null,
    coverUrl: "https://example.test/cover.jpg",
    coverRowId: "r1",
    coverColor: null,
    sourceRowIds: ["r1"],
    notionIds: ["n1"],
    readings: 1,
    png: {
      width: 512,
      height: 512,
      bytes: 100,
      sha256: "digest-1",
      art: { width: 341, height: 512, left: 85, top: 0 },
      source: { width: 1000, height: 1500, format: "jpeg" },
    },
    ...overrides,
  };
}

describe("row entries", () => {
  const groups = groupCatalog(catalog);
  const statuses = new Map<string, AssetEntry["status"]>([
    ["book-zero-to-one", "success"],
    ["book-the-body", "success"],
    ["book-no-cover", "missing-cover"],
  ]);

  it("accounts for every source row, not just every asset", () => {
    const rows = buildRowEntries(groups, statuses);
    expect(groups).toHaveLength(3);
    expect(rows).toHaveLength(catalog.length);
    expect(new Set(rows.map((r) => r.notionId)).size).toBe(catalog.length);
  });

  it("maps both readings of a reread onto the one asset and marks them", () => {
    const rows = buildRowEntries(groups, statuses);
    const reread = rows.filter((r) => r.asset === "book-zero-to-one");
    expect(reread.map((r) => r.notionId).sort()).toEqual(["n1", "n2"]);
    expect(reread.every((r) => r.reread)).toBe(true);
    expect(rows.find((r) => r.notionId === "n3")!.reread).toBe(false);
  });

  it("carries the asset's failure down to each of its rows", () => {
    const rows = buildRowEntries(groups, statuses);
    expect(rows.find((r) => r.notionId === "n4")!.status).toBe("missing-cover");
  });
});

describe("counts", () => {
  it("counts assets and rows separately, and names the reread groups", () => {
    const groups = groupCatalog(catalog);
    const assets = [
      asset("book-zero-to-one", { readings: 2, notionIds: ["n1", "n2"] }),
      asset("book-the-body"),
      asset("book-no-cover", {
        status: "missing-cover",
        file: null,
        png: undefined,
        error: "no cover_url on any row of this group",
      }),
    ];
    const rows = buildRowEntries(
      groups,
      new Map(assets.map((a) => [a.name, a.status])),
    );
    const counts = countManifest(assets, rows);
    expect(counts.assets).toEqual({
      success: 2,
      "missing-cover": 1,
      "fetch-failed": 0,
      "render-failed": 0,
      total: 3,
    });
    expect(counts.rows.total).toBe(4);
    expect(counts.rows.success).toBe(3);
    expect(counts.rows["missing-cover"]).toBe(1);
    expect(counts.rereadGroups).toBe(1);
  });

  it("counts a failure once per kind", () => {
    const assets = [
      asset("a", { status: "fetch-failed", file: null, png: undefined }),
      asset("b", { status: "render-failed", file: null, png: undefined }),
    ];
    const counts = countManifest(assets, []);
    expect(counts.assets["fetch-failed"]).toBe(1);
    expect(counts.assets["render-failed"]).toBe(1);
    expect(counts.assets.success).toBe(0);
  });
});

describe("resume planning", () => {
  const groups = groupCatalog(catalog);
  const previous = new Map([
    ["book-the-body", asset("book-the-body")],
    ["book-zero-to-one", asset("book-zero-to-one")],
  ]);
  const onDisk = () => "digest-1";

  it("reuses an asset whose cover and bytes are both unchanged", () => {
    const plan = planWork(groups, previous, onDisk);
    const body = plan.find((item) => item.group.name === "book-the-body")!;
    expect(body.action).toBe("reuse");
    expect(body.reuse?.name).toBe("book-the-body");
  });

  it("re-renders when the file on disk no longer matches the manifest", () => {
    const plan = planWork(groups, previous, () => "something-else");
    expect(plan.every((item) => item.action !== "reuse")).toBe(true);
  });

  it("re-renders when the file is gone entirely", () => {
    const plan = planWork(groups, previous, () => null);
    expect(plan.every((item) => item.action !== "reuse")).toBe(true);
  });

  it("re-renders when Notion has a different cover than last time", () => {
    const moved = new Map([
      ["book-the-body", asset("book-the-body", { coverUrl: "https://example.test/new.jpg" })],
    ]);
    const plan = planWork(groups, moved, onDisk);
    expect(plan.find((item) => item.group.name === "book-the-body")!.action).toBe("render");
  });

  it("never reuses a previous failure", () => {
    const failed = new Map([
      ["book-the-body", asset("book-the-body", { status: "fetch-failed", png: undefined, file: null })],
    ]);
    const plan = planWork(groups, failed, onDisk);
    expect(plan.find((item) => item.group.name === "book-the-body")!.action).toBe("render");
  });

  it("re-renders everything under --force", () => {
    const plan = planWork(groups, previous, onDisk, true);
    expect(plan.filter((item) => item.action === "render")).toHaveLength(2);
  });

  it("skips a book with no cover instead of calling it a failure to fetch", () => {
    const plan = planWork(groups, previous, onDisk);
    expect(plan.find((item) => item.group.name === "book-no-cover")!.action).toBe(
      "skip-no-cover",
    );
  });
});

describe("reusing a previously rendered asset", () => {
  const group = groupCatalog([
    row({
      notionId: "n1",
      id: "the-body",
      title: "The Body: A Guide",
      author: "Bill Bryson",
      publicationYear: 2019,
      coverUrl: "https://example.test/cover.jpg",
      coverColor: "#884400",
    }),
    row({
      notionId: "n2",
      id: "the-body-2024",
      title: "The Body: A Guide",
      author: "Bill Bryson",
      publicationYear: 2019,
      coverUrl: "https://example.test/cover.jpg",
      coverColor: "#884400",
    }),
  ])[0]!;

  // What the previous run wrote, before a resync moved the metadata.
  const stale = asset("book-the-body-a-guide", {
    title: "The Body",
    author: "B. Bryson",
    publicationYear: null,
    coverRowId: "the-body-old",
    coverColor: null,
    sourceRowIds: ["the-body"],
    notionIds: ["n1"],
    readings: 1,
  });

  it("keeps the rendered PNG untouched", () => {
    const refreshed = refreshReusedAsset(stale, group);
    expect(refreshed.png).toEqual(stale.png);
    expect(refreshed.png!.sha256).toBe("digest-1");
    expect(refreshed.file).toBe(stale.file);
    expect(refreshed.status).toBe("success");
  });

  it("refreshes every source field, not just the ids", () => {
    const refreshed = refreshReusedAsset(stale, group);
    expect(refreshed.title).toBe("The Body: A Guide");
    expect(refreshed.author).toBe("Bill Bryson");
    expect(refreshed.publicationYear).toBe(2019);
    expect(refreshed.coverRowId).toBe("the-body");
    expect(refreshed.coverColor).toBe("#884400");
    expect(refreshed.coverUrl).toBe("https://example.test/cover.jpg");
  });

  it("picks up a reading added since the last run", () => {
    const refreshed = refreshReusedAsset(stale, group);
    expect(refreshed.notionIds).toEqual(["n1", "n2"]);
    expect(refreshed.sourceRowIds).toEqual(["the-body", "the-body-2024"]);
    expect(refreshed.readings).toBe(2);
  });

  it("leaves nothing from the previous run's catalog behind", () => {
    const refreshed = refreshReusedAsset(stale, group);
    const sourceFields = [
      refreshed.title,
      refreshed.author,
      refreshed.publicationYear,
      refreshed.coverRowId,
      refreshed.coverColor,
      refreshed.readings,
    ];
    const staleFields = [
      stale.title,
      stale.author,
      stale.publicationYear,
      stale.coverRowId,
      stale.coverColor,
      stale.readings,
    ];
    for (const [index, value] of sourceFields.entries()) {
      expect(value).not.toBe(staleFields[index]);
    }
  });
});
