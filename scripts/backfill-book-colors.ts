/**
 * Backfill script: sample a shelf color for every book that has a cover.
 *
 * The daily sync samples `cover_color` only for books whose Notion page
 * changed, so rows that predate the column stay NULL until this runs. By
 * default it touches only rows with a cover and no color; `--force` resamples
 * every cover (after a threshold change in coverColor.server.ts, say).
 *
 * Usage:
 *   pnpm backfill:book-colors --dry-run   # sample and report, write nothing
 *   pnpm backfill:book-colors             # write missing colors
 *   pnpm backfill:book-colors --force     # resample every cover
 */
// Env comes from the `dotenv -e .env --` wrapper in package.json rather than a
// config() call here: this script imports ~/server/db, which validates env at
// module-evaluation time, and ESM hoists imports above any statement body.
import { coverColorLabel } from "../src/lib/books/coverColor";
import { resolveCoverColor } from "../src/lib/books/coverColor.server";
import { db } from "../src/server/db";
import { books } from "../src/server/db/schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const CONCURRENCY = 6;

async function main() {
  console.log(
    `🎨 Backfilling book cover colors${force ? " (force)" : ""}${dryRun ? " (dry run)" : ""}...`,
  );

  const rows = await db
    .select({
      id: books.id,
      title: books.title,
      coverUrl: books.coverUrl,
      coverColor: books.coverColor,
    })
    .from(books)
    .where(
      force
        ? isNotNull(books.coverUrl)
        : and(isNotNull(books.coverUrl), isNull(books.coverColor)),
    );
  console.log(`   ${rows.length} book(s) to sample`);

  let sampled = 0;
  let failed = 0;
  const families = new Map<string, number>();
  let cursor = 0;

  async function worker() {
    while (cursor < rows.length) {
      const row = rows[cursor++]!;
      const color = await resolveCoverColor(row.coverUrl);
      if (!color) {
        failed++;
        console.log(`   ✗ ${row.title}: could not sample ${row.coverUrl}`);
        continue;
      }
      sampled++;
      const label = coverColorLabel(color);
      families.set(label, (families.get(label) ?? 0) + 1);
      const change =
        row.coverColor && row.coverColor !== color
          ? `${row.coverColor} → ${color}`
          : color;
      console.log(
        `   ${dryRun ? "would set" : "set"} ${row.title}: ${change} (${label})`,
      );
      if (!dryRun) {
        await db
          .update(books)
          .set({ coverColor: color })
          .where(eq(books.id, row.id));
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const breakdown = [...families.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `${label} ${count}`)
    .join(", ");
  console.log(
    `\n✓ ${dryRun ? "Would set" : "Set"} ${sampled} color(s), ${failed} failed.` +
      (breakdown ? `\n   ${breakdown}` : ""),
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
