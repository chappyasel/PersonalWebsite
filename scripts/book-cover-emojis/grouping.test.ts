import {
  type CatalogRow,
  assignName,
  groupCatalog,
  groupKeyFor,
  normalizeKeyPart,
  slugify,
} from "./grouping";
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

describe("grouping keys", () => {
  it("treats case, spacing, and Unicode compatibility forms as the same book", () => {
    expect(normalizeKeyPart("The  Mom   Test")).toBe("the mom test");
    expect(normalizeKeyPart("ＴＨＥ Mom Test")).toBe("the mom test");
    expect(normalizeKeyPart("  Zero to One  ")).toBe("zero to one");
  });

  it("keeps punctuation, so a subtitle is a different book", () => {
    expect(groupKeyFor({ title: "The Body", author: "Bill Bryson" })).not.toBe(
      groupKeyFor({ title: "The Body: A Guide", author: "Bill Bryson" }),
    );
  });

  it("keeps distinct non-Latin titles distinct", () => {
    const a = groupKeyFor({ title: "こころ", author: "夏目 漱石" });
    const b = groupKeyFor({ title: "羅生門", author: "芥川 龍之介" });
    const c = groupKeyFor({ title: "Война и мир", author: "Лев Толстой" });
    expect(new Set([a, b, c]).size).toBe(3);
    expect(a).not.toBe("");
  });

  it("cannot confuse a title/author split with a different one", () => {
    expect(groupKeyFor({ title: "A", author: "BC" })).not.toBe(
      groupKeyFor({ title: "AB", author: "C" }),
    );
  });
});

describe("reread folding", () => {
  const rereads = [
    row({ notionId: "bbb", id: "zero-to-one", finished: "2024-01-01" }),
    row({ notionId: "aaa", id: "zero-to-one-2019", finished: "2019-06-01" }),
  ].map((r) => ({ ...r, title: "Zero to One", author: "Peter Thiel" }));

  it("gives two readings of one book a single asset holding both Notion ids", () => {
    const groups = groupCatalog(rereads);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.rows.map((r) => r.notionId)).toEqual(["aaa", "bbb"]);
    expect(groups[0]!.name).toBe("book-zero-to-one");
  });

  it("keeps the same name when a new reading is added later", () => {
    const before = groupCatalog(rereads)[0]!.name;
    const after = groupCatalog([
      ...rereads,
      row({
        notionId: "zzz",
        id: "zero-to-one-2026",
        title: "Zero to One",
        author: "Peter Thiel",
        finished: "2026-09-01",
      }),
    ])[0]!.name;
    expect(after).toBe(before);
  });

  it("picks the cover deterministically regardless of input order", () => {
    const withCovers = [
      { ...rereads[0]!, coverUrl: "https://example.test/b.jpg" },
      { ...rereads[1]!, coverUrl: "https://example.test/a.jpg" },
    ];
    const forward = groupCatalog(withCovers)[0]!;
    const backward = groupCatalog([...withCovers].reverse())[0]!;
    expect(forward.coverUrl).toBe(backward.coverUrl);
    expect(forward.coverRowId).toBe(backward.coverRowId);
  });
});

describe("name assignment", () => {
  it("prefixes every name and keeps it searchable", () => {
    const groups = groupCatalog([
      row({ notionId: "a1", title: "The Mom Test", author: "Rob Fitzpatrick" }),
    ]);
    expect(groups[0]!.name).toBe("book-the-mom-test");
  });

  it("escalates through author, year, then Notion id when titles collide", () => {
    // Four different books called "Essays" by four authors who share a
    // surname, so each rung of the ladder has to fire in turn. Assignment
    // walks groups in key order, so Ann takes the clean name.
    const groups = groupCatalog([
      row({ notionId: "d4", title: "Essays", author: "Lee Alpha", publicationYear: 1991 }),
      row({ notionId: "a1", title: "Essays", author: "Ann Alpha", publicationYear: 1990 }),
      row({ notionId: "c3", title: "Essays", author: "Zed Alpha", publicationYear: 1991 }),
      row({ notionId: "b2", title: "Essays", author: "Kim Alpha", publicationYear: 1991 }),
    ]);
    const byAuthor = new Map(groups.map((g) => [g.author, g.name]));
    expect(byAuthor.get("Ann Alpha")).toBe("book-essays");
    expect(byAuthor.get("Kim Alpha")).toBe("book-essays-alpha");
    expect(byAuthor.get("Lee Alpha")).toBe("book-essays-alpha-1991");
    expect(byAuthor.get("Zed Alpha")).toBe("book-essays-alpha-1991-c3");
    expect(new Set(groups.map((g) => g.name)).size).toBe(4);
  });

  it("never emits two assets under one name, whatever the catalog", () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      row({
        notionId: `id-${i}`,
        id: `slug-${i}`,
        title: i % 2 === 0 ? "Same Title" : "Same Title!",
        author: "One Author",
        publicationYear: 2000,
      }),
    );
    const groups = groupCatalog(rows);
    const names = groups.map((g) => g.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("falls back to a stable hash when a title does not transliterate", () => {
    const groups = groupCatalog([
      row({ notionId: "j1", title: "こころ", author: "夏目 漱石" }),
      row({ notionId: "j2", title: "羅生門", author: "芥川 龍之介" }),
    ]);
    const names = groups.map((g) => g.name);
    expect(slugify("こころ")).toBe("");
    expect(new Set(names).size).toBe(2);
    for (const name of names) expect(name).toMatch(/^book-[0-9a-f]{10}$/);
    // Same catalog, same names.
    expect(groupCatalog([
      row({ notionId: "j1", title: "こころ", author: "夏目 漱石" }),
      row({ notionId: "j2", title: "羅生門", author: "芥川 龍之介" }),
    ]).map((g) => g.name)).toEqual(names);
  });

  it("produces filename-safe names", () => {
    const groups = groupCatalog([
      row({ notionId: "p1", title: "Where Is My Flying Car?: A Memoir", author: "J. Storrs Hall" }),
    ]);
    expect(groups[0]!.name).toBe("book-where-is-my-flying-car-a-memoir");
    expect(groups[0]!.name).toMatch(/^[a-z0-9-]+$/);
  });

  it("does not hand out a name already taken", () => {
    const name = assignName(
      {
        key: "k",
        title: "Taken",
        author: "Only Author",
        publicationYear: null,
        rows: [row({ notionId: "x1" })],
      },
      new Set(["book-taken"]),
    );
    expect(name).not.toBe("book-taken");
    expect(name.startsWith("book-taken-")).toBe(true);
  });
});
