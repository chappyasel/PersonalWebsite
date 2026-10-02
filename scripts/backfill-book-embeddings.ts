/**
 * Backfill script: build and embed note-search passages for every book.
 *
 * Each sync embeds at most 40 changed books, so a first run, or a bump of
 * the chunker version in src/lib/books/noteEmbeddings.ts, goes through here.
 * Books whose passages are already current are skipped, so a rerun only
 * picks up what failed.
 *
 * Usage:
 *   pnpm backfill:book-embeddings
 */
// Env comes from the `dotenv -e .env --` wrapper in package.json rather than a
// config() call here: this script imports ~/server/db, which validates env at
// module-evaluation time, and ESM hoists imports above any statement body.
import { refreshNoteEmbeddings } from "../src/lib/books/noteEmbeddings";
import { withBookSyncLock } from "../src/lib/books/sync";

async function main() {
  const started = Date.now();
  // Under the sync's lock: a cron run or the Notion button rebuilding the
  // same books at the same time would collide on their passages.
  const result = await withBookSyncLock(() =>
    refreshNoteEmbeddings({ concurrency: 4 }),
  );
  console.log({
    ...result,
    seconds: Math.round((Date.now() - started) / 1000),
  });
  if (result.failures.length) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
