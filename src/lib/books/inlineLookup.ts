import { type SQL, inArray, or } from "drizzle-orm";

import { db } from "~/server/db";
import { books } from "~/server/db/schema";
import { orEmpty } from "~/server/queries/degrade";

import type { BookLookup } from "~/components/notion/types";

import { notionPageIdsIn, rewriteNotionBookLinks } from "./notionLinks";

/** Every books.chappyasel.com/<slug> mentioned anywhere in a synced snapshot. */
export function extractBookSlugs(data: unknown): string[] {
  const slugs = new Set<string>();
  const re = /books\.chappyasel\.com\/([a-z0-9-]+)/g;
  for (const match of JSON.stringify(data).matchAll(re)) {
    if (match[1]) slugs.add(match[1]);
  }
  return [...slugs];
}

const lookupColumns = {
  id: books.id,
  notionId: books.notionId,
  title: books.title,
  author: books.author,
  coverUrl: books.coverUrl,
  rating: books.rating,
  started: books.started,
  finished: books.finished,
  abandoned: books.abandoned,
  abandonedAtMin: books.abandonedAtMin,
  audioLengthMin: books.audioLengthMin,
  pageCount: books.pageCount,
  hasNotes: books.hasNotes,
};

function selectLookupRows(scope: string, where: SQL | undefined) {
  return orEmpty(
    scope,
    () => db.select(lookupColumns).from(books).where(where),
    [],
  );
}

type LookupRow = Awaited<ReturnType<typeof selectLookupRows>>[number];

function toLookup(rows: LookupRow[]): BookLookup {
  const lookup: BookLookup = {};
  for (const row of rows) {
    lookup[row.id] = {
      title: row.title,
      author: row.author,
      coverUrl: row.coverUrl,
      rating: row.rating,
      started: row.started?.toISOString() ?? null,
      finished: row.finished?.toISOString() ?? null,
      abandoned: row.abandoned?.toISOString() ?? null,
      abandonedAtMin: row.abandonedAtMin,
      audioLengthMin: row.audioLengthMin,
      pageCount: row.pageCount,
      hasNotes: row.hasNotes,
    };
  }
  return lookup;
}

/**
 * Title, cover, and hover-card facts for every book a snapshot links.
 *
 * The page itself is static JSON. The database only decorates its book
 * links, so an outage drops the covers and cards and leaves every word on
 * the page readable. `scope` names the caller in the degrade log.
 */
export async function lookupInlineBooks(
  scope: string,
  data: unknown,
): Promise<BookLookup> {
  const slugs = extractBookSlugs(data);
  if (slugs.length === 0) return {};
  return toLookup(await selectLookupRows(scope, inArray(books.id, slugs)));
}

/**
 * A book's notes with their links to other books resolved against the
 * library.
 *
 * Notion exports a mention of another Book Notes page as that page's Notion
 * URL. Each one the library mirrors becomes the book's URL on the site, and
 * the lookup carries the facts its BookLink shows. The match is by Notion
 * page ID, so a link survives the target's slug changing. If the database
 * is away, the notes come back as written and their links stay on Notion.
 */
export async function linkNotesToLibrary(
  notes: string,
): Promise<{ notes: string; linkedBooks: BookLookup }> {
  const notionIds = notionPageIdsIn(notes);
  const slugs = extractBookSlugs(notes);
  if (notionIds.length === 0 && slugs.length === 0) {
    return { notes, linkedBooks: {} };
  }

  const rows = await selectLookupRows(
    "book-notes-links",
    or(
      notionIds.length > 0 ? inArray(books.notionId, notionIds) : undefined,
      slugs.length > 0 ? inArray(books.id, slugs) : undefined,
    ),
  );
  return {
    notes: rewriteNotionBookLinks(
      notes,
      new Map(rows.map((row) => [row.notionId, row.id])),
    ),
    linkedBooks: toLookup(rows),
  };
}
