import { eq } from "drizzle-orm";

import { db } from "~/server/db";
import { books } from "~/server/db/schema";

// Retired URLs point to a stable Notion page, since titles and slugs can change.
const legacyBookNotionIds = new Map([
  [
    "disciplined-entrepreneurship-expanded-updated",
    "3dcc5ab0-d88d-81ad-90de-ffe1800b1816",
  ],
]);

export async function findBookById(bookId: string) {
  const book = await db.query.books.findFirst({
    where: eq(books.id, bookId),
    with: { tags: true },
  });
  if (book) return book;

  const notionId = legacyBookNotionIds.get(bookId);
  if (!notionId) return undefined;

  return db.query.books.findFirst({
    where: eq(books.notionId, notionId),
    with: { tags: true },
  });
}
