/**
 * Backfill script: re-sync the lightweight Notion checkbox flags
 * (Notes?, Summarized?, Automated?, Featured?) onto every book row.
 *
 * The normal book sync only upserts books whose Notion page was edited more
 * recently than the DB copy, so a newly-added flag column stays at its default
 * for every untouched book. This pass ignores lastEditedTime and touches all
 * of them. It reads only the database listing — no page content, no covers,
 * no Audible lookups — so it is cheap and safe to re-run.
 *
 * Usage:
 *   pnpm backfill:book-flags --dry-run   # log what would change
 *   pnpm backfill:book-flags             # write
 */
// Env comes from the `dotenv -e .env --` wrapper in package.json rather than a
// config() call here: this script imports ~/server/db, which validates env at
// module-evaluation time, and ESM hoists imports above any statement body.
import { fetchBooksFromNotion } from "../src/lib/books/notion";
import { db } from "../src/server/db";
import { books } from "../src/server/db/schema";
import { eq } from "drizzle-orm";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(
    `📚 Backfilling book flags from Notion${dryRun ? " (dry run)" : ""}...`,
  );

  const notionBooks = await fetchBooksFromNotion();
  console.log(`   Fetched ${notionBooks.length} books from Notion`);

  const dbBooks = await db
    .select({
      id: books.id,
      notionId: books.notionId,
      title: books.title,
      hasNotes: books.hasNotes,
      hasSummary: books.hasSummary,
      isAutomated: books.isAutomated,
      isFeatured: books.isFeatured,
    })
    .from(books);
  const byNotionId = new Map(dbBooks.map((b) => [b.notionId, b]));
  console.log(`   Loaded ${dbBooks.length} books from the database`);

  let updated = 0;
  let missing = 0;

  for (const book of notionBooks) {
    const existing = byNotionId.get(book.notionId);
    if (!existing) {
      missing++;
      continue;
    }

    const changed =
      existing.hasNotes !== book.hasNotes ||
      existing.hasSummary !== book.hasSummary ||
      existing.isAutomated !== book.isAutomated ||
      existing.isFeatured !== book.isFeatured;
    if (!changed) continue;

    updated++;
    const diff = [
      existing.hasNotes !== book.hasNotes &&
        `notes ${existing.hasNotes}→${book.hasNotes}`,
      existing.hasSummary !== book.hasSummary &&
        `summary ${existing.hasSummary}→${book.hasSummary}`,
      existing.isAutomated !== book.isAutomated &&
        `automated ${existing.isAutomated}→${book.isAutomated}`,
      existing.isFeatured !== book.isFeatured &&
        `featured ${existing.isFeatured}→${book.isFeatured}`,
    ]
      .filter(Boolean)
      .join(", ");
    console.log(
      `   ${dryRun ? "would update" : "updating"} ${book.title}: ${diff}`,
    );

    if (!dryRun) {
      await db
        .update(books)
        .set({
          hasNotes: book.hasNotes,
          hasSummary: book.hasSummary,
          isAutomated: book.isAutomated,
          isFeatured: book.isFeatured,
        })
        .where(eq(books.id, existing.id));
    }
  }

  console.log(
    `\n✓ ${dryRun ? "Would update" : "Updated"} ${updated} book(s).` +
      (missing ? ` ${missing} Notion book(s) not yet in the database.` : ""),
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
