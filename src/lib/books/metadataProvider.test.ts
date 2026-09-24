import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchMetadataEvidence } from "./metadataProvider";

afterEach(() => vi.unstubAllGlobals());
describe("metadata catalog providers", () => {
  it("queries title-only for empty author and retains competing candidates and identifiers", async () => {
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("googleapis")
              ? {
                  totalItems: 2,
                  items: [
                    {
                      id: "one",
                      volumeInfo: {
                        title: "Superintelligence",
                        authors: ["Nick Bostrom"],
                        publishedDate: "2014-07",
                        pageCount: 352,
                        imageLinks: {
                          thumbnail: "http://books.google.com/cover?edge=curl",
                        },
                      },
                    },
                    {
                      id: "two",
                      volumeInfo: {
                        title: "Superintelligence",
                        authors: ["Another Author"],
                      },
                    },
                  ],
                }
              : {
                  products: [
                    {
                      asin: "B00LPMD72K",
                      title: "Superintelligence",
                      authors: [{ name: "Nick Bostrom" }],
                      runtime_length_min: 780,
                    },
                  ],
                },
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await fetchMetadataEvidence({
      title: "Superintelligence",
      author: "",
    });
    expect(result.failures).toEqual([]);
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0]).toMatchObject({
      id: "one",
      publicationYear: 2014,
      pageCount: 352,
      coverUrl: "https://books.google.com/cover",
    });
    expect(
      fetcher.mock.calls.every(
        ([url]) => !url.includes("inauthor") && !url.includes("author="),
      ),
    ).toBe(true);
  });
  it("reports HTTP and malformed data failures instead of pretending the catalog is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("googleapis")
          ? new Response("{}", { status: 429 })
          : new Response("bad json"),
      ),
    );
    expect(
      (await fetchMetadataEvidence({ title: "Title", author: "Author" }))
        .failures,
    ).toHaveLength(2);
  });
  it("marks truncated result sets incomplete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.includes("googleapis")
                ? {
                    totalItems: 99,
                    items: [
                      {
                        id: "a",
                        volumeInfo: { title: "Title", authors: ["Author"] },
                      },
                    ],
                  }
                : { products: [] },
            ),
          ),
      ),
    );
    expect(
      (await fetchMetadataEvidence({ title: "Title", author: "" })).failures,
    ).toContainEqual({ source: "google", code: "truncated" });
  });
  it("rejects malformed successful response shapes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ unexpected: true }))),
    );
    expect(
      (await fetchMetadataEvidence({ title: "Title", author: "" })).failures,
    ).toHaveLength(2);
  });
});
it("fetches the exact linked Audible product and retains it during a Google 429", async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes("googleapis")) return new Response("{}", { status: 429 });
    expect(url).toContain("/catalog/products/B00LPMD72K?");
    return new Response(
      JSON.stringify({
        product: {
          asin: "B00LPMD72K",
          title: "Superintelligence",
          authors: [{ name: "Nick Bostrom" }],
          runtime_length_min: 857,
        },
      }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const evidence = await fetchMetadataEvidence({
    title: "Superintelligence",
    author: "",
    audibleUrl: "https://www.audible.com/pd/B00LPMD72K",
  });
  expect(evidence.failures).toEqual([
    { source: "google", code: "http", httpStatus: 429 },
  ]);
  expect(evidence.candidates).toEqual([
    {
      source: "audible",
      id: "B00LPMD72K",
      title: "Superintelligence",
      authors: ["Nick Bostrom"],
      audioLengthMin: 857,
    },
  ]);
});
