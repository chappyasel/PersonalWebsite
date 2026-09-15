import { describe, expect, it } from "vitest";

import { fakeS3 } from "./fakeS3";
import { EmojiStore, type PageRecord, type SourceRecord } from "./store";

const store = () => {
  const s3 = fakeS3();
  return { s3, store: new EmojiStore({ bucket: "b", region: "r" }, s3.client) };
};

const record: PageRecord = {
  notionId: "340c5ab0-d88d-8064-a516-c5654c136679",
  workId: "book-the-mom-test",
  state: "applied",
  sha256: "abc",
  owned: { kind: "file", urlKey: "https://x/y/book-the-mom-test.png" },
  target: { kind: "file", urlKey: "https://x/y/book-the-mom-test.png" },
  uploadId: "upload-1",
  originalIcon: { type: "emoji", emoji: "📗" },
  originalIconDescribed: "emoji:📗",
  attempts: 0,
  at: "2026-09-15T19:24:00.000Z",
};

describe("durable memory", () => {
  it("round-trips a page record and a source record", async () => {
    const { store: s } = store();
    await s.putPage(record);
    expect((await s.getPage(record.notionId))?.value).toEqual(record);

    const source: SourceRecord = {
      workId: "book-the-mom-test",
      fingerprint: "fp",
      sha256: "abc",
      uploadId: "upload-1",
      icon: record.owned,
      settled: [record.notionId],
      checkedAt: 1_700_000_000_000,
    };
    await s.putSource(source);
    expect((await s.getSource("book-the-mom-test"))?.value).toEqual(source);
  });

  it("returns null rather than throwing for something never written", async () => {
    const { store: s } = store();
    expect(await s.getPage("00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(await s.getSource("book-nothing")).toBeNull();
    expect(await s.getCatalog()).toBeNull();
  });

  it("lists page ids without the prefix or the extension", async () => {
    const { store: s } = store();
    await s.putPage(record);
    await s.putPage({ ...record, notionId: "020c5b32-1db7-4ee7-aa6f-10f7defb2ac9" });
    await s.putSource({
      workId: "book-x",
      fingerprint: "f",
      sha256: "s",
      uploadId: null,
      icon: null,
      settled: [],
      checkedAt: 0,
    });
    // The source must not show up among the pages.
    expect(await s.listPageIds()).toEqual([
      "020c5b32-1db7-4ee7-aa6f-10f7defb2ac9",
      "340c5ab0-d88d-8064-a516-c5654c136679",
    ]);
  });

  it("refuses to write outside the feature's prefix", async () => {
    const { store: s } = store();
    await expect(s.putPage({ ...record, notionId: "../../weight-log" })).rejects.toThrow(
      /invalid notionId/,
    );
  });
});
