import { describe, expect, it } from "vitest";

import { buildHomepageBookPlacard } from "./homepagePlacard";
import type { Book } from "./types";

function book(overrides: Partial<Book> & Pick<Book, "id">): Book {
  const { id, ...rest } = overrides;
  return {
    id,
    notionId: `notion-${id}`,
    title: id,
    author: "Author",
    publicationYear: null,
    started: null,
    finished: null,
    rating: null,
    audioLengthMin: null,
    pageCount: null,
    tags: [],
    hasNotes: false,
    hasSummary: false,
    isAutomated: false,
    isFeatured: false,
    coverUrl: null,
    audibleUrl: null,
    notionUrl: "https://notion.so/example",
    readNumber: 1,
    totalReads: 1,
    otherReadings: [],
    ...rest,
  };
}

describe("buildHomepageBookPlacard", () => {
  it("keeps the visible ledger to ten books including current reads", () => {
    const books = [
      book({ id: "current-b", started: "2026-08-02" }),
      book({ id: "current-a", started: "2026-08-10" }),
      ...Array.from({ length: 12 }, (_, index) =>
        book({
          id: `finished-${index}`,
          started: `2026-07-${String(index + 1).padStart(2, "0")}`,
          finished: `2026-07-${String(index + 2).padStart(2, "0")}`,
        }),
      ),
    ];

    const result = buildHomepageBookPlacard(
      books,
      new Date("2026-08-15T12:00:00Z"),
    );

    expect(result.current.map((item) => item.id)).toEqual([
      "current-a",
      "current-b",
    ]);
    expect(result.recent).toHaveLength(8);
    expect(result.current.length + result.recent.length).toBe(10);
  });

  it("builds contiguous yearly bars and projects only the current year", () => {
    const result = buildHomepageBookPlacard(
      [
        book({ id: "2024", finished: "2024-03-01" }),
        book({ id: "2026-a", finished: "2026-02-01" }),
        book({ id: "2026-b", finished: "2026-07-01" }),
      ],
      new Date("2026-07-02T12:00:00Z"),
    );

    expect(result.yearly.map(({ year, books }) => [year, books])).toEqual([
      [2024, 1],
      [2025, 0],
      [2026, 2],
    ]);
    expect(result.yearly[0]?.projectedRemainder).toBe(0);
    expect(result.yearly[2]?.projectedRemainder).toBeGreaterThan(0);
  });

  it("counts each subject once per book and returns the eight most common", () => {
    const books = Array.from({ length: 10 }, (_, index) =>
      book({
        id: String(index),
        tags: ["Shared", "Shared", `Subject ${index}`],
      }),
    );

    const result = buildHomepageBookPlacard(
      books,
      new Date("2026-08-15T12:00:00Z"),
    );

    expect(result.subjects).toHaveLength(8);
    expect(result.subjects[0]).toEqual({ name: "Shared", count: 10 });
  });
});
