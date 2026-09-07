import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PUBLIC_INDEX_RESULT_LIMIT,
  clearPublicSearchIndexCacheForTests,
  createPlainTextExcerpt,
  loadPublicSearchIndex,
  parsePublicSearchIndex,
  queryPublicSearchIndex,
  searchLoadedPublicIndex,
} from "./public-index";
import type { PublicSearchIndex } from "./public-index-format";
import { RESULT_GROUP_PREVIEW } from "./types";

const index: PublicSearchIndex = {
  version: 1,
  sourceDigest: "a".repeat(64),
  documents: [
    {
      id: "public:manual:collaboration",
      source: "manual",
      label: "How We Collaborate",
      target: { kind: "site", site: "manual", hash: "collaboration" },
      metadata: [],
      body: "Prefer written context before a decision.",
    },
    {
      id: "public:blog:context",
      source: "musing",
      label: "Context Changes Decisions",
      target: { kind: "url", url: "https://example.com/context" },
      metadata: ["Medium"],
      body: "A stored article description.",
    },
  ],
};

describe("public index parsing", () => {
  it("rejects unsupported, malformed, and YouTube-bearing assets", () => {
    expect(() => parsePublicSearchIndex({ ...index, version: 2 })).toThrow();
    expect(() =>
      parsePublicSearchIndex({
        ...index,
        documents: [{ ...index.documents[0], label: 42 }],
      }),
    ).toThrow();
    expect(() =>
      parsePublicSearchIndex({
        ...index,
        documents: [
          {
            ...index.documents[0],
            target: { kind: "url", url: "not a URL" },
          },
        ],
      }),
    ).toThrow(/forbidden URL/);
    expect(() =>
      parsePublicSearchIndex({
        ...index,
        documents: [
          {
            ...index.documents[0],
            target: { kind: "url", url: "https://youtube.com/watch?v=x" },
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      parsePublicSearchIndex({
        ...index,
        documents: [
          {
            ...index.documents[0],
            target: { kind: "site", site: "home", path: "//example.com" },
          },
        ],
      }),
    ).toThrow();
  });
});

describe("loadPublicSearchIndex", () => {
  beforeEach(() => clearPublicSearchIndexCacheForTests());

  it("fetches and parses the asset once per browser session", async () => {
    const fetcher = vi.fn(async () =>
      Promise.resolve(new Response(JSON.stringify(index), { status: 200 })),
    );

    const first = loadPublicSearchIndex(fetcher);
    const second = loadPublicSearchIndex(fetcher);

    await expect(first).resolves.toEqual(index);
    await expect(second).resolves.toEqual(index);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/data/universal-search-index.json", {
      cache: "no-cache",
    });
  });

  it("does not retain a failed load", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("no", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(index), { status: 200 }),
      );

    await expect(loadPublicSearchIndex(fetcher)).rejects.toThrow();
    await expect(loadPublicSearchIndex(fetcher)).resolves.toEqual(index);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("public index searching", () => {
  const location = {
    hostname: "books.localhost",
    port: "3000",
    protocol: "http:",
  };

  it("ranks identity above body matches and resolves local subdomains", () => {
    const results = searchLoadedPublicIndex(index, "context", location);

    expect(results.map((result) => result.id)).toEqual([
      "public:blog:context",
      "public:manual:collaboration",
    ]);
    expect(results[1]).toMatchObject({
      href: "http://manual.localhost:3000/#collaboration",
      matchKind: "body",
      group: "public-writing",
    });
  });

  it("caps results at the index limit", () => {
    const many: PublicSearchIndex = {
      ...index,
      documents: Array.from({ length: PUBLIC_INDEX_RESULT_LIMIT + 10 }, (_, number) => ({
        ...index.documents[0]!,
        id: `public:manual:${number}`,
        label: `Context ${number}`,
      })),
    };

    expect(searchLoadedPublicIndex(many, "context", location)).toHaveLength(
      PUBLIC_INDEX_RESULT_LIMIT,
    );
  });

  it("keeps a preview of every source before the ranking fills the cap", () => {
    const sources = ["manual", "routine", "systems", "musing", "project"] as const;
    const many: PublicSearchIndex = {
      ...index,
      documents: sources.flatMap((source) =>
        Array.from({ length: 20 }, (_, number) => ({
          ...index.documents[0]!,
          id: `public:${source}:${number}`,
          source,
          label: `Context ${source} ${number}`,
        })),
      ),
    };

    const results = searchLoadedPublicIndex(many, "context", location);
    const perSource = (source: string) =>
      results.filter((result) => result.id.startsWith(`public:${source}:`))
        .length;

    expect(results).toHaveLength(PUBLIC_INDEX_RESULT_LIMIT);
    for (const source of sources) {
      expect(perSource(source)).toBeGreaterThanOrEqual(RESULT_GROUP_PREVIEW);
    }
    // A hundred equal matches in index order would otherwise have left the
    // last two sources with nothing; the reserve gives each its preview and
    // the earlier sources take the remainder in rank order.
    expect(perSource("project")).toBe(RESULT_GROUP_PREVIEW);
    expect(perSource("manual")).toBe(20);
  });

  it("exposes a lazy query API and rejects a stale query without cancelling the shared load", async () => {
    clearPublicSearchIndexCacheForTests();
    const controller = new AbortController();
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const stale = queryPublicSearchIndex("context", {
      location,
      signal: controller.signal,
      fetcher,
    });
    const current = queryPublicSearchIndex("context", {
      location,
      fetcher,
    });

    controller.abort();
    resolveResponse?.(new Response(JSON.stringify(index), { status: 200 }));

    await expect(stale).rejects.toMatchObject({ name: "AbortError" });
    await expect(current).resolves.toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("createPlainTextExcerpt", () => {
  it("removes raw markup, clips by Unicode code point, and stays within 220 characters", () => {
    const body = `${"😀".repeat(150)} <script>alert('x')</script> decision ${"z".repeat(150)}`;
    const excerpt = createPlainTextExcerpt(body, "decision");

    expect(Array.from(excerpt).length).toBeLessThanOrEqual(220);
    expect(excerpt).not.toMatch(/<\/?script/i);
    expect(excerpt).not.toContain("alert('x')");
    expect(excerpt).toContain("decision");
    expect(excerpt).not.toContain("�");
  });
});
