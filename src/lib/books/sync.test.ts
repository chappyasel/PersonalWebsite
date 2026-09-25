import { beforeEach, describe, expect, it, vi } from "vitest";

import { notionDateToInstant } from "./dates";
import type { NotionBook } from "./notion";
import { syncBooksFromNotion } from "./sync";

const mocks = vi.hoisted(() => ({
  fetchBooks: vi.fn(),
  fetchDetails: vi.fn(),
  findMany: vi.fn(),
  updates: [] as Record<string, unknown>[],
}));

vi.mock("~/env", () => ({ env: { NOTION_API_KEY: "test" } }));
vi.mock("./metadataEnrichment", () => ({
  enrichNotionBook: vi.fn(async (book: NotionBook) => book),
}));
vi.mock("./coverColor.server", () => ({ resolveCoverColor: vi.fn() }));
vi.mock("./notion", () => ({
  fetchBooksFromNotion: mocks.fetchBooks,
  fetchBookDetails: mocks.fetchDetails,
  ensureWebsiteProperty: vi.fn(),
  WEBSITE_PROPERTY: "Website",
}));
vi.mock("~/server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [{ count: 1 }] }) }),
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ query: { books: { findMany: mocks.findMany } } }),
    query: { books: { findMany: mocks.findMany } },
    insert: () => ({ values: () => ({ returning: async () => [{ id: 1 }] }) }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mocks.updates.push(values);
        return { where: async () => undefined };
      },
    }),
  },
}));

const book = {
  id: "test-book",
  notionId: "notion-book",
  title: "Test Book",
  author: "Author",
  finished: "2026-09-07",
  lastEditedTime: "2026-09-09T18:26:00Z",
  isFeatured: true,
  coverUrl: "https://example.com/cover.jpg",
  audioLengthMin: 300,
  publicationYear: 2014,
  pageCount: 352,
  audibleUrl: "https://www.audible.com/pd/example",
  websiteUrl: "https://books.chappyasel.com/test-book",
} as NotionBook;
/** The row's dates as the sync stores them: Pacific midnights. */
const storedDates = { finished: notionDateToInstant(book.finished!) };

describe("featured selection during book sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updates.length = 0;
    mocks.fetchBooks.mockResolvedValue([book]);
    mocks.fetchDetails.mockRejectedValue(new Error("Notes unavailable"));
    mocks.findMany.mockResolvedValue([
      {
        ...book,
        ...storedDates,
        id: "test-book",
        notionId: book.notionId,
        isFeatured: false,
        author: book.author,
        lastEditedTime: new Date("2026-09-08T00:00:00Z"),
      },
    ]);
  });

  it("saves the featured flag and invalidates its book even if notes fail", async () => {
    const result = await syncBooksFromNotion("manual");
    expect(mocks.updates).toContainEqual({ isFeatured: true });
    expect(result.bookIdsToInvalidate).toContain("test-book");
    expect(mocks.updates.some((update) => "lastEditedTime" in update)).toBe(
      false,
    );
    expect(result.errors).toHaveLength(1);
  });

  it("also removes a featured flag when notes fail", async () => {
    mocks.fetchBooks.mockResolvedValue([{ ...book, isFeatured: false }]);
    mocks.findMany.mockResolvedValue([
      {
        ...book,
        ...storedDates,
        id: "test-book",
        notionId: book.notionId,
        isFeatured: true,
        author: book.author,
        lastEditedTime: new Date("2026-09-08T00:00:00Z"),
      },
    ]);
    await syncBooksFromNotion("manual");
    expect(mocks.updates).toContainEqual({ isFeatured: false });
  });

  it("refreshes the shelf before beginning any note downloads", async () => {
    const refresh = vi.fn(async (ids: string[]) => {
      expect(ids).toEqual(["test-book"]);
      expect(mocks.updates).toContainEqual({ isFeatured: true });
      expect(mocks.fetchDetails).not.toHaveBeenCalled();
    });
    await syncBooksFromNotion("cron", refresh);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not write or refresh an unchanged featured selection", async () => {
    mocks.fetchBooks.mockResolvedValue([{ ...book, isFeatured: false }]);
    const refresh = vi.fn();
    await syncBooksFromNotion("cron", refresh);
    expect(refresh).not.toHaveBeenCalled();
    expect(mocks.updates.some((update) => "isFeatured" in update)).toBe(false);
  });
});

describe("author changes during book sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updates.length = 0;
    mocks.fetchBooks.mockResolvedValue([book]);
    mocks.fetchDetails.mockRejectedValue(new Error("Notes unavailable"));
    mocks.findMany.mockResolvedValue([
      {
        ...book,
        ...storedDates,
        id: "test-book",
        notionId: book.notionId,
        isFeatured: book.isFeatured,
        author: "Previous Author",
        lastEditedTime: new Date("2026-09-08T00:00:00Z"),
      },
    ]);
  });

  it("saves and invalidates the author before notes download, even when notes fail", async () => {
    const refresh = vi.fn(async (ids: string[]) => {
      expect(ids).toEqual(["test-book"]);
      expect(mocks.updates).toContainEqual({ author: book.author });
      expect(mocks.fetchDetails).not.toHaveBeenCalled();
    });
    const result = await syncBooksFromNotion("manual", refresh);
    expect(refresh).toHaveBeenCalledOnce();
    expect(result.bookIdsToInvalidate).toContain("test-book");
    expect(mocks.updates.some((update) => "lastEditedTime" in update)).toBe(
      false,
    );
    expect(result.errors).toHaveLength(1);
  });

  it("does not write or invalidate an unchanged author", async () => {
    mocks.fetchBooks.mockResolvedValue([
      { ...book, author: "Previous Author" },
    ]);
    const refresh = vi.fn();
    await syncBooksFromNotion("manual", refresh);
    expect(refresh).not.toHaveBeenCalled();
    expect(mocks.updates.some((update) => "author" in update)).toBe(false);
  });
});
