import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { booksRouter } from "~/server/api/routers/books";
import { db } from "~/server/db";

import { getBookForOG, getBookWithNotes } from "./ogDataAccess";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), findMany: vi.fn() }));
vi.mock("~/server/db", () => ({
  db: { query: { books: mocks } },
}));
vi.mock("~/lib/books/sync", () => ({ syncBooksFromNotion: vi.fn() }));
vi.mock("~/lib/books/cacheInvalidation", () => ({
  refreshBookCachesAfterSync: vi.fn(),
}));
vi.mock("~/server/queries/books", async () => {
  const { z } = await import("zod");
  return {
    bookCollectionInputSchema: z.object({}),
    getBooks: vi.fn(),
    getBookStats: vi.fn(),
    getBookTags: vi.fn(),
  };
});
vi.mock("~/server/api/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.create();
  return {
    createTRPCRouter: t.router,
    publicProcedure: t.procedure,
    protectedProcedure: t.procedure,
  };
});

const oldSlug = "disciplined-entrepreneurship-expanded-updated";
const book = {
  id: "disciplined-entrepreneurship",
  notionId: "3dcc5ab0-d88d-81ad-90de-ffe1800b1816",
  title: "Disciplined Entrepreneurship",
  author: "Bill Aulet",
  notes: "Book notes",
  tags: [],
};
const context = { db, session: null, headers: new Headers() };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findFirst.mockImplementation(async ({ where }: { where: SQL }) => {
    const query = new PgDialect().sqlToQuery(where);
    const column = query.sql.includes('"notion_id"') ? "notionId" : "id";
    return query.params[0] === book[column] ? book : undefined;
  });
  mocks.findMany.mockResolvedValue([]);
});

describe("renamed book links", () => {
  it("opens the old slug through the modal's tRPC lookup", async () => {
    const caller = booksRouter.createCaller(context);
    await expect(caller.getById({ bookId: oldSlug })).resolves.toMatchObject({
      id: book.id,
      notes: book.notes,
    });
  });

  it("loads standalone notes and share metadata through the old slug", async () => {
    await expect(getBookWithNotes(oldSlug)).resolves.toMatchObject({
      id: book.id,
      notes: book.notes,
    });
    await expect(getBookForOG(oldSlug)).resolves.toMatchObject({
      id: book.id,
      title: book.title,
    });
  });

  it("keeps canonical lookups to one query", async () => {
    await expect(getBookWithNotes(book.id)).resolves.toMatchObject({
      id: book.id,
    });
    expect(mocks.findFirst).toHaveBeenCalledOnce();
  });

  it("prefers an exact live slug over a legacy alias", async () => {
    mocks.findFirst.mockResolvedValueOnce({ ...book, id: oldSlug });
    await expect(getBookWithNotes(oldSlug)).resolves.toMatchObject({
      id: oldSlug,
    });
    expect(mocks.findFirst).toHaveBeenCalledOnce();
  });

  it("does not guess a book for an unknown slug", async () => {
    await expect(
      getBookWithNotes(`${book.id}-unknown-edition`),
    ).resolves.toBeNull();
    expect(mocks.findFirst).toHaveBeenCalledOnce();
  });

  it("follows the stable page even if its canonical slug changes again", async () => {
    mocks.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ ...book, id: "renamed-again" });
    await expect(getBookWithNotes(oldSlug)).resolves.toMatchObject({
      id: "renamed-again",
      notionId: book.notionId,
    });
    const { where } = mocks.findFirst.mock.calls[1]![0] as { where: SQL };
    const query = new PgDialect().sqlToQuery(where);
    expect(query.sql).toContain('"notion_id"');
    expect(query.params).toEqual([book.notionId]);
  });

  it("keeps a retired link missing if its Notion page leaves the mirror", async () => {
    mocks.findFirst.mockResolvedValue(undefined);
    await expect(getBookWithNotes(oldSlug)).resolves.toBeNull();
  });

  it("returns NOT_FOUND for a missing book in tRPC", async () => {
    const caller = booksRouter.createCaller(context);
    await expect(
      caller.getById({ bookId: "missing-book" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("reading history on detail lookups", () => {
  it("returns identical linked history on the page and modal, identifying duplicate dates by ID", async () => {
    const earlier = {
      id: "earlier-read",
      started: new Date("2025-01-01"),
      finished: new Date("2025-02-01"),
    };
    const current = { ...earlier, id: book.id };
    const abandoned = {
      id: "abandoned-attempt",
      abandoned: new Date("2025-03-01"),
    };
    const ongoing = { id: "ongoing-read", started: new Date("2026-01-01") };
    mocks.findMany.mockResolvedValue([earlier, current, abandoned, ongoing]);
    const page = await getBookWithNotes(book.id);
    const modal = await booksRouter
      .createCaller(context)
      .getById({ bookId: book.id });
    expect(page).toEqual(modal);
    expect(page).toMatchObject({
      readNumber: 2,
      totalReads: 3,
      otherReadings: [
        { id: earlier.id },
        { id: book.id },
        { id: abandoned.id },
        { id: ongoing.id },
      ],
    });
  });
});
