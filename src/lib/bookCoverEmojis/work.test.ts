import { emojiNameFor } from "./emojiNames";
import { assetKey } from "./keys";
import { type WorkHead, type WorkInput, planWorkItem } from "./work";
import { describe, expect, it } from "vitest";

const WORKSPACE = "859fbc85-7644-4498-88d8-e0229d8cea32";
const NOW = "2026-09-15T12:00:00.000Z";
const LATER = "2026-09-15T13:00:00.000Z";

const reread: WorkInput = {
  workId: "book-zero-to-one",
  sha256: "sha-a",
  bytes: 100,
  title: "Zero to One",
  author: "Peter Thiel",
  pages: [
    { notionId: "page-2", bookId: "zero-to-one-2019" },
    { notionId: "page-1", bookId: "zero-to-one" },
  ],
};

const plan = (input: WorkInput, head: WorkHead | null, previous = null) =>
  planWorkItem(input, head, previous, WORKSPACE, NOW, assetKey);

describe("first sight of a book", () => {
  it("creates revision 1 with the plain name and every page", () => {
    const result = plan(reread, null);
    expect(result.change).toBe("created");
    expect(result.head.revision).toBe(1);
    expect(result.head.emojiRevision).toBe(1);
    expect(result.head.emojiName).toBe("book-zero-to-one");
    expect(result.revision?.pages.map((page) => page.notionId)).toEqual([
      "page-1",
      "page-2",
    ]);
    expect(result.revision?.workspaceId).toBe(WORKSPACE);
    expect(result.revision?.assetKey).toBe(assetKey("sha-a"));
  });

  it("gives both readings of one book the same single work item", () => {
    const result = plan(reread, null);
    expect(result.revision?.pages).toHaveLength(2);
    expect(result.revision?.emojiName).toBe("book-zero-to-one");
  });
});

describe("nothing moved", () => {
  it("does no work when artwork and pages are both unchanged", () => {
    const first = plan(reread, null);
    const again = planWorkItem(
      reread,
      first.head,
      first.revision,
      WORKSPACE,
      LATER,
      assetKey,
    );
    expect(again.change).toBe("unchanged");
    expect(again.revision).toBeNull();
    expect(again.head).toEqual(first.head);
  });
});

describe("a cover changes", () => {
  it("bumps the emoji revision and the name, so nothing is overwritten", () => {
    const first = plan(reread, null);
    const changed = planWorkItem(
      { ...reread, sha256: "sha-b" },
      first.head,
      first.revision,
      WORKSPACE,
      LATER,
      assetKey,
    );
    expect(changed.change).toBe("artwork");
    expect(changed.head.emojiRevision).toBe(2);
    expect(changed.head.emojiName).toBe("book-zero-to-one-r2");
    expect(changed.head.revision).toBe(2);
    expect(changed.revision?.assetKey).toBe(assetKey("sha-b"));
  });

  it("keeps climbing on a third cover rather than reusing r2", () => {
    const first = plan(reread, null);
    const second = planWorkItem(
      { ...reread, sha256: "sha-b" },
      first.head,
      first.revision,
      WORKSPACE,
      LATER,
      assetKey,
    );
    const third = planWorkItem(
      { ...reread, sha256: "sha-c" },
      second.head,
      second.revision,
      WORKSPACE,
      LATER,
      assetKey,
    );
    expect(third.head.emojiName).toBe("book-zero-to-one-r3");
  });
});

describe("a reread appears", () => {
  it("makes a new job revision but keeps the emoji", () => {
    const single: WorkInput = { ...reread, pages: [reread.pages[1]!] };
    const first = plan(single, null);
    const withReread = planWorkItem(
      reread,
      first.head,
      first.revision,
      WORKSPACE,
      LATER,
      assetKey,
    );
    expect(withReread.change).toBe("pages");
    expect(withReread.head.revision).toBe(2);
    expect(withReread.head.emojiRevision).toBe(1);
    expect(withReread.head.emojiName).toBe("book-zero-to-one");
    expect(withReread.revision?.pages).toHaveLength(2);
  });
});

describe("emoji names", () => {
  it("leaves the first revision alone and suffixes later ones", () => {
    expect(emojiNameFor("book-the-mom-test", 1)).toBe("book-the-mom-test");
    expect(emojiNameFor("book-the-mom-test", 2)).toBe("book-the-mom-test-r2");
  });

  it("clamps a long name to a word boundary, leaving room for the suffix", () => {
    const long = "book-101-essays-that-will-change-the-way-you-think";
    // Cut back to the last hyphen rather than filling the cap exactly, so the
    // name never ends mid-word.
    expect(emojiNameFor(long, 1, 30)).toBe("book-101-essays-that-will");
    expect(emojiNameFor(long, 1, 30).length).toBeLessThanOrEqual(30);
    const second = emojiNameFor(long, 2, 30);
    expect(second.length).toBeLessThanOrEqual(30);
    expect(second.endsWith("-r2")).toBe(true);
  });

  it("never ends a clamped name on a hyphen", () => {
    expect(emojiNameFor("book-abc-def", 1, 8)).not.toMatch(/-$/);
  });

  it("refuses a revision below 1 and a cap with no room", () => {
    expect(() => emojiNameFor("book-x", 0)).toThrow();
    expect(() => emojiNameFor("book-x", 12, 2)).toThrow();
  });
});

describe("Notion's real name cap", () => {
  it("keeps every name under 50 characters, which is where Save disables", () => {
    // Observed live: a 50-character name shows "Name must be less than 50
    // characters" and Save stays disabled. 49 is accepted.
    for (const name of [
      "book-101-essays-that-will-change-the-way-you-think",
      "book-disciplined-entrepreneurship-expanded-updated",
    ]) {
      expect(name.length).toBe(50);
      expect(emojiNameFor(name, 1).length).toBeLessThan(50);
    }
  });

  it("cuts back to a word boundary instead of mid-word", () => {
    expect(emojiNameFor("book-101-essays-that-will-change-the-way-you-think", 1)).toBe(
      "book-101-essays-that-will-change-the-way-you",
    );
    expect(emojiNameFor("book-disciplined-entrepreneurship-expanded-updated", 1)).toBe(
      "book-disciplined-entrepreneurship-expanded",
    );
  });

  it("leaves a name that already fits completely alone", () => {
    expect(emojiNameFor("book-100m-offers", 1)).toBe("book-100m-offers");
    expect(emojiNameFor("book-the-mom-test", 1)).toBe("book-the-mom-test");
  });

  it("still fits after a revision suffix is added", () => {
    const long = "book-101-essays-that-will-change-the-way-you-think";
    expect(emojiNameFor(long, 2).length).toBeLessThan(50);
    expect(emojiNameFor(long, 2).endsWith("-r2")).toBe(true);
  });
});

describe("a name policy change", () => {
  it("issues a new revision when the stored name no longer matches policy", () => {
    const input: WorkInput = {
      workId: "book-101-essays-that-will-change-the-way-you-think",
      sha256: "sha-a",
      bytes: 10,
      title: "101 Essays",
      author: "Brianna Wiest",
      pages: [{ notionId: "p1", bookId: "b1" }],
    };
    // A head written before the cap was known, carrying the 50-character name.
    const staleHead = {
      workId: input.workId,
      revision: 1,
      emojiRevision: 1,
      emojiName: input.workId,
      sha256: "sha-a",
      updatedAt: NOW,
    };
    const previous = {
      ...staleHead,
      assetKey: assetKey("sha-a"),
      bytes: 10,
      title: "101 Essays",
      author: "Brianna Wiest",
      pages: [{ notionId: "p1", bookId: "b1" }],
      workspaceId: WORKSPACE,
      createdAt: NOW,
    };
    const result = planWorkItem(input, staleHead, previous, WORKSPACE, LATER, assetKey);
    expect(result.change).toBe("name");
    expect(result.head.revision).toBe(2);
    // The emoji identity did not change, only the name it is registered under.
    expect(result.head.emojiRevision).toBe(1);
    expect(result.head.emojiName).toBe("book-101-essays-that-will-change-the-way-you");
    expect(result.revision?.revision).toBe(2);
  });

  it("stays unchanged once the stored name already matches policy", () => {
    const input: WorkInput = {
      workId: "book-the-mom-test",
      sha256: "sha-a",
      bytes: 10,
      title: "The Mom Test",
      author: "Rob Fitzpatrick",
      pages: [{ notionId: "p1", bookId: "b1" }],
    };
    const first = planWorkItem(input, null, null, WORKSPACE, NOW, assetKey);
    const again = planWorkItem(input, first.head, first.revision, WORKSPACE, LATER, assetKey);
    expect(again.change).toBe("unchanged");
  });
});
