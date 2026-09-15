import { exhaustedPages, isSettled, outstandingPages } from "./pending";
import type { AppliedRecord } from "./state";
import { describe, expect, it } from "vitest";

const record = (over: Partial<AppliedRecord> = {}): AppliedRecord => ({
  state: "applied",
  emojiId: "e1",
  emojiName: "book-the-body",
  workId: "book-the-body",
  sha256: "sha-a",
  revision: 1,
  at: "2026-09-15T12:00:00.000Z",
  previousIcon: "none",
  ...over,
});

const artifact = {
  workId: "book-the-body",
  sha256: "sha-a",
  emojiName: "book-the-body",
};

describe("settlement", () => {
  it("counts a page with no record as outstanding", () => {
    expect(isSettled(undefined, artifact)).toBe(false);
  });

  it("settles a page we applied this exact artwork to", () => {
    expect(isSettled(record(), artifact)).toBe(true);
  });

  it("settles a page we stood down on, so a manual icon cannot starve the queue", () => {
    expect(isSettled(record({ state: "manual", emojiId: "" }), artifact)).toBe(true);
  });

  it("reopens a page when the artwork changes, exactly once", () => {
    const newArt = { ...artifact, sha256: "sha-b" };
    expect(isSettled(record(), newArt)).toBe(false);
    expect(isSettled(record({ state: "manual", sha256: "sha-b" }), newArt)).toBe(true);
  });

  it("does not mistake one book's revision number for another's", () => {
    // Both are revision 1; only the work id tells them apart.
    const other = { ...artifact, workId: "book-zero-to-one" };
    expect(isSettled(record(), other)).toBe(false);
  });

  it("picks out only the pages that still need work", () => {
    const pages = [{ notionId: "p1" }, { notionId: "p2" }, { notionId: "p3" }];
    const records = {
      p1: record(),
      p2: record({ state: "manual" }),
      p3: record({ sha256: "older" }),
    };
    expect(outstandingPages(pages, records, artifact)).toEqual([{ notionId: "p3" }]);
  });

  it("treats both readings of a reread independently", () => {
    const pages = [{ notionId: "read-1" }, { notionId: "read-2" }];
    const records = { "read-1": record() };
    expect(outstandingPages(pages, records, artifact)).toEqual([{ notionId: "read-2" }]);
  });
});

describe("bounded retries", () => {
  const failed = (attempts: number) =>
    record({ state: "failed", attempts, error: "http 500" });

  it("retries a failure while it still has attempts left", () => {
    expect(isSettled(failed(1), artifact)).toBe(false);
    expect(isSettled(failed(2), artifact)).toBe(false);
  });

  it("stops picking a page once its attempts are spent", () => {
    // Otherwise one permanently broken page is chosen first on every run and
    // the rest of the catalog never gets a slot.
    expect(isSettled(failed(3), artifact)).toBe(true);
    expect(isSettled(failed(9), artifact)).toBe(true);
  });

  it("treats a failure with no attempt count as needing a try", () => {
    expect(isSettled(record({ state: "failed" }), artifact)).toBe(false);
  });

  it("gives an exhausted page a fresh budget when the artwork changes", () => {
    const newArt = { ...artifact, sha256: "sha-b" };
    expect(isSettled(failed(3), newArt)).toBe(false);
  });

  it("keeps a failing page from crowding out the others", () => {
    const pages = [{ notionId: "broken" }, { notionId: "fine" }];
    const records = { broken: failed(3), fine: record() };
    expect(outstandingPages(pages, records, artifact)).toEqual([]);
    const stillTrying = { broken: failed(1), fine: record() };
    expect(outstandingPages(pages, stillTrying, artifact)).toEqual([
      { notionId: "broken" },
    ]);
  });

  it("lists the pages that gave up, so status can surface them", () => {
    const records = { a: failed(3), b: record(), c: failed(1) };
    expect(exhaustedPages(records).map((item) => item.notionId)).toEqual(["a"]);
  });
});

describe("a corrected emoji name", () => {
  it("reopens a page that was applied under the old name", () => {
    // A name-only revision changes neither artwork nor pages, so settlement
    // keyed on those alone would never apply the correction.
    const applied = record({ emojiName: "book-the-body-old" });
    expect(isSettled(applied, artifact)).toBe(false);
  });

  it("reopens an exhausted failure when the name is corrected", () => {
    const spent = record({ state: "failed", attempts: 3, emojiName: "book-old" });
    expect(isSettled(spent, artifact)).toBe(false);
  });

  it("stays settled once the record carries the current name", () => {
    expect(isSettled(record({ emojiName: "book-the-body" }), artifact)).toBe(true);
  });
});

describe("an unfinished intent", () => {
  it("is never settled, because only the live icon can say what happened", () => {
    // Written before the PATCH. The process may have died either side of it.
    const intent = record({ state: "intent", targetEmojiId: "e-new" });
    expect(isSettled(intent, artifact)).toBe(false);
  });

  it("stays unsettled even when everything else matches", () => {
    const intent = record({
      state: "intent",
      targetEmojiId: "e-new",
      emojiName: artifact.emojiName,
      sha256: artifact.sha256,
      workId: artifact.workId,
    });
    expect(isSettled(intent, artifact)).toBe(false);
  });

  it("does not hold up the pages around it", () => {
    const pages = [{ notionId: "mid-write" }, { notionId: "done" }];
    const records = { "mid-write": record({ state: "intent" }), done: record() };
    expect(outstandingPages(pages, records, artifact)).toEqual([
      { notionId: "mid-write" },
    ]);
  });
});
