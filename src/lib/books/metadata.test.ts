import { describe, expect, it } from "vitest";

import {
  type MetadataCandidate,
  type MetadataInput,
  identifyMetadata,
  selectMetadataBatch,
} from "./metadata";

const book: MetadataInput = {
  title: "Superintelligence",
  author: "",
  coverUrl: null,
  publicationYear: null,
  pageCount: 352,
  audioLengthMin: null,
  audibleUrl: null,
};
const print: MetadataCandidate = {
  source: "google",
  id: "oup",
  title: "Superintelligence",
  authors: ["Nick Bostrom"],
  publicationYear: 2014,
  pageCount: 352,
  coverUrl: "https://example.com/oup.jpg",
};
const audio: MetadataCandidate = {
  source: "audible",
  id: "B00LPMD72K",
  title: "Superintelligence",
  authors: ["Nick Bostrom"],
  audioLengthMin: 780,
};
const resolve = (input = book, candidates = [print, audio]) =>
  identifyMetadata(input, { candidates, failures: [] });

describe("evidence-aware book metadata", () => {
  it("recovers an exact title corroborated by independent catalogs", () => {
    expect(resolve()).toMatchObject({
      status: "matched",
      patch: {
        author: "Nick Bostrom",
        coverUrl: print.coverUrl,
        publicationYear: 2014,
        audioLengthMin: 780,
        audibleUrl: "https://www.audible.com/pd/B00LPMD72K",
      },
    });
    expect(resolve().patch).not.toHaveProperty("pageCount");
  });
  it("uses an existing Audible identifier to disambiguate same-title authors", () => {
    const other = { ...print, id: "other", authors: ["Other Author"] };
    expect(
      resolve(
        {
          ...book,
          audibleUrl: "https://www.audible.com/pd/Some-Title/B00LPMD72K?ref=x",
        },
        [other, audio, print],
      ).patch.author,
    ).toBe("Nick Bostrom");
  });
  it("does not choose the first same-title author", () => {
    const result = resolve(book, [
      print,
      audio,
      { ...print, id: "other", authors: ["Other Author"] },
    ]);
    expect(result.status).toBe("ambiguous");
    expect(result.patch).toEqual({});
    expect(result.evidence).toHaveLength(3);
  });
  it("blocks conflicts between a manual author and anchored Audible identity", () => {
    expect(
      resolve({
        ...book,
        author: "Someone Else",
        audibleUrl: "https://www.audible.com/pd/B00LPMD72K",
      }),
    ).toMatchObject({ status: "conflict", patch: {} });
  });
  it("rejects prefix titles, missing authors and uncorroborated title-only guesses", () => {
    expect(resolve(book, [print]).patch).toEqual({});
    expect(
      resolve(book, [{ ...print, title: "Superintelligence Workbook" }, audio])
        .patch,
    ).toEqual({});
    expect(
      resolve(book, [
        { ...print, authors: [] },
        { ...audio, authors: [] },
      ]).patch,
    ).toEqual({});
  });
  it("preserves every manual field, including non-image cover and short page counts", () => {
    const manual = {
      ...book,
      author: "Nick Bostrom",
      coverUrl: "https://example.com/manual",
      publicationYear: 2000,
      pageCount: 12,
      audioLengthMin: 123,
      audibleUrl: "https://example.com/manual-audio",
    };
    expect(resolve(manual).patch).toEqual({});
  });
  it("leaves conflicting edition fields blank", () => {
    const result = resolve({ ...book, pageCount: null }, [
      print,
      {
        ...print,
        id: "edition2",
        publicationYear: 2015,
        pageCount: 400,
        coverUrl: "https://example.com/other.jpg",
      },
      audio,
    ]);
    expect(result.patch.author).toBe("Nick Bostrom");
    expect(result.patch).not.toHaveProperty("coverUrl");
    expect(result.patch).not.toHaveProperty("pageCount");
    expect(result.patch).not.toHaveProperty("publicationYear");
    expect(result.unresolved).toContain("pageCount");
  });
  it("does not treat incomplete upstream evidence as a unique match", () => {
    expect(
      identifyMetadata(book, {
        candidates: [print],
        failures: [{ source: "audible", code: "http", httpStatus: 503 }],
      }),
    ).toMatchObject({ status: "upstream_error", patch: {} });
  });
  it("recovers linked Audible identity during a Google outage without guessing print fields", () => {
    const result = identifyMetadata(
      { ...book, audibleUrl: "https://www.audible.com/pd/B00LPMD72K" },
      {
        candidates: [{ ...audio, audioLengthMin: 857 }],
        failures: [{ source: "google", code: "http", httpStatus: 429 }],
      },
    );
    expect(result.patch).toEqual({
      author: "Nick Bostrom",
      audioLengthMin: 857,
    });
    expect(result.unresolved).toContain("coverUrl");
    expect(result.failures).toEqual([
      { source: "google", code: "http", httpStatus: 429 },
    ]);
  });
  it("uses an exact title and manual author from a healthy source during another provider outage", () => {
    expect(
      identifyMetadata(
        { ...book, author: "Nick Bostrom" },
        {
          candidates: [print],
          failures: [{ source: "audible", code: "http", httpStatus: 503 }],
        },
      ).patch,
    ).toEqual({ coverUrl: print.coverUrl, publicationYear: 2014 });
  });
  it("does not use incomplete editions even when the author is known", () => {
    expect(
      identifyMetadata(
        { ...book, author: "Nick Bostrom" },
        {
          candidates: [print, audio],
          failures: [{ source: "google", code: "truncated" }],
        },
      ).patch,
    ).toEqual({
      audibleUrl: "https://www.audible.com/pd/B00LPMD72K",
      audioLengthMin: 780,
    });
  });
  it("repeated resolution after applying metadata is idempotent", () => {
    expect(resolve({ ...book, ...resolve().patch }).patch).toEqual({});
  });
  it("rotates over the whole eligible set even when early records never resolve", () => {
    const records = Array.from({ length: 53 }, (_, i) => ({
      ...book,
      notionId: String(i).padStart(3, "0"),
    }));
    const visited = new Set(
      [1, 2, 3].flatMap((id) =>
        selectMetadataBatch(records, id).map((b) => b.notionId),
      ),
    );
    expect(visited.size).toBe(53);
  });
});
it("does not attach an unlinked audio edition that conflicts with a manual runtime", () => {
  const result = resolve(
    { ...book, author: "Nick Bostrom", audioLengthMin: 900 },
    [{ ...audio, audioLengthMin: 100 }],
  );
  expect(result.patch).not.toHaveProperty("audibleUrl");
  expect(result.status).toBe("conflict");
  expect(result.reason).toMatch(/runtime/i);
});
it("an explicit Audible identifier remains authoritative without changing manual runtime", () => {
  const result = resolve(
    {
      ...book,
      author: "Nick Bostrom",
      audioLengthMin: 900,
      audibleUrl: "https://www.audible.com/pd/B00LPMD72K",
    },
    [{ ...audio, audioLengthMin: 100 }],
  );
  expect(result.patch).not.toHaveProperty("audioLengthMin");
  expect(result.status).toBe("matched");
});
