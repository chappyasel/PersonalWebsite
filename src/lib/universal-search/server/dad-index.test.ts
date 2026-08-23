import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  buildDadSearchDocuments,
  createDadIndexLoader,
  parseDadSearchDocuments,
  searchDadIndex,
} from "./dad-index";

async function dadFixture() {
  const root = await mkdtemp(join(tmpdir(), "dad-search-fixture-"));
  const insights = join(root, "Insights");
  const journal = join(root, "Journal");
  const year = join(journal, "2020");
  await Promise.all([
    mkdir(insights, { recursive: true }),
    mkdir(year, { recursive: true }),
  ]);
  const files: Record<string, string> = {
    "Insights/00-life-story.md":
      "---\ntitle: Life Story\n---\nA safe fixture narrative.",
    "Insights/01-lesson.md":
      "---\ntitle: A Lesson\n---\nPractice made the fixture stronger.",
    "Insights/bio-updates-draft.md":
      "---\ntitle: Draft\n---\nNever index this.",
    "Journal/index.md": "# Journal\nFixture journal introduction.",
    "Journal/preface.md": "# Preface\nBefore the fixture entries.",
    "Journal/epilogue.md": "# Epilogue\nAfter the fixture entries.",
    "Journal/2020/2020-01-02.md":
      "---\ntitle: Fixture Day\ndate: 2020-01-02\n---\n<script>unsafe()</script> A memorable unicode 🚀 practice day.",
  };
  await Promise.all(
    Object.entries(files).map(([path, contents]) =>
      writeFile(join(root, path), contents, "utf8"),
    ),
  );
  return root;
}

describe("Dad search index", () => {
  it("rejects malformed or externally routed private artifacts", () => {
    expect(() => parseDadSearchDocuments({})).toThrow(
      /private Dad search index/i,
    );
    expect(() =>
      parseDadSearchDocuments([
        {
          id: "dad:escape",
          label: "Escape",
          href: "https://example.com/private",
          metadata: [],
          body: "Private body",
        },
      ]),
    ).toThrow(/private Dad search index/i);
  });

  it("builds the exact public route map and excludes the draft", async () => {
    const documents = await buildDadSearchDocuments(await dadFixture());

    expect(documents.map((document) => document.href)).toEqual([
      "/dad/life-story",
      "/dad/insights/01-lesson",
      "/dad/journal",
      "/dad/journal/preface",
      "/dad/journal/epilogue",
      "/dad/journal/2020/2020-01-02",
    ]);
    expect(documents.some((document) => document.id.includes("draft"))).toBe(
      false,
    );
  });

  it("searches title and body without returning markup or a full body", async () => {
    const documents = await buildDadSearchDocuments(await dadFixture());
    const results = await searchDadIndex("memorable unicode", {
      location: new URL("https://books.chappyasel.com"),
      signal: new AbortController().signal,
      load: async () => documents,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "dad:journal:2020:2020-01-02",
      group: "dad",
      href: "https://www.chappyasel.com/dad/journal/2020/2020-01-02",
      matchKind: "body",
    });
    expect(results[0]?.excerpt).not.toMatch(/script|unsafe\(\)|</i);
    expect(Array.from(results[0]?.excerpt ?? "").length).toBeLessThanOrEqual(
      220,
    );
  });

  it("builds once per loader instance", async () => {
    const build = vi.fn(async () => []);
    const load = createDadIndexLoader(build);

    await Promise.all([load(), load(), load()]);

    expect(build).toHaveBeenCalledOnce();
  });

  it("keeps protected destinations on a preview deployment", async () => {
    const results = await searchDadIndex("fixture day", {
      location: new URL("https://personal-website.vercel.app"),
      load: async () => [
        {
          id: "dad:journal:fixture",
          label: "Fixture Day",
          href: "/dad/journal/2020/fixture",
          metadata: [],
          body: "Fixture body",
        },
      ],
    });

    expect(results[0]?.href).toBe(
      "https://personal-website.vercel.app/dad/journal/2020/fixture",
    );
  });
});
