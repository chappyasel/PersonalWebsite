import { describe, expect, it, vi } from "vitest";

import { type BacklinkReading, collectBookBacklinks } from "./bookBacklinks";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("~/server/db", () => ({ db: {} }));

const notionId = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const notionUrl = (n: number) =>
  `https://app.notion.com/p/${notionId(n).replace(/-/g, "")}`;

function reading(
  id: string,
  n: number,
  overrides: Partial<BacklinkReading> = {},
): BacklinkReading {
  return {
    id,
    notionId: notionId(n),
    title: id,
    author: "Author",
    publicationYear: null,
    coverUrl: null,
    coverColor: null,
    started: null,
    finished: "2024-01-01T08:00:00.000Z",
    abandoned: false,
    notes: null,
    ...overrides,
  };
}

const cites = (...targets: number[]) =>
  targets.map((n) => `- See [Book ${n}](${notionUrl(n)})`).join("\n");

const ids = (backlinks: Record<string, { id: string }[]>, bookId: string) =>
  backlinks[bookId]?.map((book) => book.id);

describe("collectBookBacklinks", () => {
  it("lists the books whose notes link a book, newest reading first", () => {
    const backlinks = collectBookBacklinks([
      reading("bowling-alone", 1),
      reading("superminds", 2, {
        notes: cites(1),
        finished: "2022-05-01T07:00:00.000Z",
      }),
      reading("get-together", 3, {
        notes: cites(1),
        finished: "2025-02-01T08:00:00.000Z",
      }),
    ]);
    expect(ids(backlinks, "bowling-alone")).toEqual([
      "get-together",
      "superminds",
    ]);
    expect(backlinks["get-together"]).toBeUndefined();
    expect(backlinks["bowling-alone"]![0]).toMatchObject({
      linkText: "Book 1",
      anchor: null,
      excerpt: [
        { text: "See ", match: false },
        { text: "Book 1", match: true },
      ],
    });
  });

  it("counts a book read twice once, from its latest reading that links", () => {
    const backlinks = collectBookBacklinks([
      reading("the-status-game", 1),
      reading("the-courage-to-be-disliked", 2, {
        title: "The Courage to be Disliked",
        notes: cites(1),
        finished: "2020-01-01T08:00:00.000Z",
      }),
      reading("the-courage-to-be-disliked-2", 3, {
        title: "The Courage to be Disliked",
        notes: cites(1),
        finished: "2025-01-01T08:00:00.000Z",
      }),
    ]);
    expect(ids(backlinks, "the-status-game")).toEqual([
      "the-courage-to-be-disliked-2",
    ]);
  });

  it("lists a link to one reading on every reading of the book", () => {
    const backlinks = collectBookBacklinks([
      reading("essentialism", 1, { title: "Essentialism" }),
      reading("essentialism-2", 2, { title: "Essentialism" }),
      reading("deep-work", 3, { notes: cites(1) }),
    ]);
    expect(ids(backlinks, "essentialism")).toEqual(["deep-work"]);
    expect(ids(backlinks, "essentialism-2")).toEqual(["deep-work"]);
  });

  it("never lists a book under itself or one of its other readings", () => {
    const backlinks = collectBookBacklinks([
      reading("principles", 1, { title: "Principles", notes: cites(1, 2) }),
      reading("principles-2", 2, { title: "Principles", notes: cites(1) }),
    ]);
    expect(backlinks).toEqual({});
  });

  it("leaves out abandoned attempts, as the shelf does", () => {
    const backlinks = collectBookBacklinks([
      reading("bowling-alone", 1),
      reading("dropped", 2, { notes: cites(1), abandoned: true }),
    ]);
    expect(backlinks).toEqual({});
  });

  it("reads links to the Books site by slug", () => {
    const backlinks = collectBookBacklinks([
      reading("bowling-alone", 1),
      reading("superminds", 2, {
        notes: "- [Bowling Alone](https://books.chappyasel.com/bowling-alone)",
      }),
    ]);
    expect(ids(backlinks, "bowling-alone")).toEqual(["superminds"]);
  });
});
