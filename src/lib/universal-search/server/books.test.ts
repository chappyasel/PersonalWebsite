import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  BOOK_SEARCH_VECTOR_SQL,
  type BookSearchRow,
  searchBooks,
} from "./books";

describe("searchBooks", () => {
  it("ranks identity before tag and body matches and emits canonical URLs", async () => {
    const rows: BookSearchRow[] = [
      {
        id: "body-book",
        title: "A Different Book",
        author: "Author",
        tags: [],
        notes: "The durable decision appears here.",
      },
      {
        id: "decision-book",
        title: "Decision Book",
        author: "Another Author",
        tags: [],
        notes: null,
      },
      {
        id: "tag-book",
        title: "Third Book",
        author: "Writer",
        tags: ["Decision science"],
        notes: null,
      },
    ];
    const load = vi.fn(async () => rows);

    const results = await searchBooks("decision", {
      load,
      location: new URL("https://manual.chappyasel.com"),
    });

    expect(results.map((item) => item.id)).toEqual([
      "book:decision-book",
      "book:tag-book",
      "book:body-book",
    ]);
    expect(results[0]?.href).toBe("https://books.chappyasel.com/decision-book");
    expect(results[2]?.excerpt).toContain("decision");
  });

  it("passes a normalized two-character query to the database loader", async () => {
    const load = vi.fn(async () => []);
    await searchBooks(" AI ", {
      load,
      location: new URL("http://localhost:4310"),
    });

    expect(load).toHaveBeenCalledWith("ai", expect.any(AbortSignal));
  });

  it("preserves full-text rows when stemming finds a non-literal note match", async () => {
    const results = await searchBooks("running", {
      load: async () => [
        {
          id: "stemmed-book",
          title: "A Different Title",
          author: "Author",
          tags: [],
          notes: "A chapter about how people run organizations.",
        },
      ],
      location: new URL("https://www.chappyasel.com"),
    });

    expect(results[0]).toMatchObject({
      id: "book:stemmed-book",
      matchKind: "body",
    });
  });

  it("matches canonical tags whose punctuation is removed from the query", async () => {
    const results = await searchBooks("Stats & data", {
      load: async (query) => {
        expect(query).toBe("stats data");
        return [
          {
            id: "statistics-book",
            title: "A Statistics Book",
            author: "Author",
            tags: ["Stats & data"],
            notes: null,
          },
        ];
      },
      location: new URL("https://www.chappyasel.com"),
    });

    expect(results[0]).toMatchObject({
      id: "book:statistics-book",
      matchKind: "metadata",
    });
  });

  it("keeps canonical detail paths inside preview deployments", async () => {
    const [result] = await searchBooks("decision", {
      load: async () => [
        {
          id: "decision-book",
          title: "Decision Book",
          author: "Author",
          tags: [],
          notes: null,
        },
      ],
      location: new URL("https://personal-website.vercel.app"),
    });

    expect(result?.href).toBe(
      "https://personal-website.vercel.app/books/decision-book",
    );
  });
});

describe("book search migration", () => {
  it("uses the same weighted vector as the query and preserves public visibility", async () => {
    const migration = await readFile(
      path.join(
        process.cwd(),
        "src/server/db/migrations/0015_book_search_vector.sql",
      ),
      "utf8",
    );
    const provider = await readFile(
      new URL("./books.ts", import.meta.url),
      "utf8",
    );
    const previousSnapshot = JSON.parse(
      await readFile(
        path.join(
          process.cwd(),
          "src/server/db/migrations/meta/0014_snapshot.json",
        ),
        "utf8",
      ),
    ) as { id: string };
    const snapshot = JSON.parse(
      await readFile(
        path.join(
          process.cwd(),
          "src/server/db/migrations/meta/0015_snapshot.json",
        ),
        "utf8",
      ),
    ) as { prevId: string };
    const journal = JSON.parse(
      await readFile(
        path.join(process.cwd(), "src/server/db/migrations/meta/_journal.json"),
        "utf8",
      ),
    ) as { entries: Array<{ tag: string }> };

    expect(migration).toContain(BOOK_SEARCH_VECTOR_SQL);
    expect(provider).toContain(BOOK_SEARCH_VECTOR_SQL);
    expect(provider).toContain("finished IS NOT NULL OR started IS NOT NULL");
    expect(provider).toContain("EXISTS");
    expect(provider).toContain("UNION ALL");
    expect(provider).toContain("regexp_replace");
    expect(snapshot.prevId).toBe(previousSnapshot.id);
    // Registered in the journal; later migrations may follow it
    expect(
      journal.entries.some((entry) => entry.tag === "0015_book_search_vector"),
    ).toBe(true);
  });
});
