---
name: book-notes
description: Query Chappy's personal book library synced from Notion — titles, authors, ratings, tags, reading dates, and full notes/summaries. Use this skill whenever the user asks about books they've read, want to read, notes on a specific book, reading history, ratings, tags/topics, reading pace over time, recommendations based on their library, or anything referencing "my books", "my reading", "what I've read", "the book about X", or a specific title. Prefer this over web search for any question about Chappy's personal reading.
---

# book-notes

Read-only SQL access to Chappy's book library in the PersonalWebsite Postgres DB (Neon). The Vercel cron sync runs daily at 09:00 UTC from the Notion Book Notes database.

## Ownership and discovery

The canonical skill lives beside the implementation at `/Users/chappyasel/Desktop/Repos/PersonalWebsite/.agents/skills/book-notes`. The paths `~/.agents/skills/book-notes` and `/Users/chappyasel/Desktop/Agents/book-notes` are discovery symlinks to that directory. Edit the canonical repo copy so skill and code changes can land together.

Treat these code paths as authoritative:

- Book schema: `/Users/chappyasel/Desktop/Repos/PersonalWebsite/src/server/db/schema.ts`
- Notion mapping: `/Users/chappyasel/Desktop/Repos/PersonalWebsite/src/lib/books/notion.ts`
- Sync behavior: `/Users/chappyasel/Desktop/Repos/PersonalWebsite/src/lib/books/sync.ts`
- Supported tag taxonomy: `/Users/chappyasel/Desktop/Repos/PersonalWebsite/src/lib/books/tagColors.ts`

If those files change the fields, filters, freshness, or query behavior described here, update this skill in the same code change.

## READ ONLY — hard rule for direct SQL

Never issue `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`, `GRANT`, or any other direct write against the Postgres cache. The `q.sh` script wraps each query in `BEGIN TRANSACTION READ ONLY`, so writes will error without changing pooled-session defaults — but do not even attempt them. The PersonalWebsite application sync is the supported cache writer; invoke it only when an explicit maintenance workflow below calls for a refresh.

**Important distinction:** Postgres is read-only, but creating an empty Book Notes page in Notion is allowed when Chappy explicitly asks for it (e.g. “create a new empty booknotes”, “make me a book notes skeleton”, “ready to fill out myself”). Use the Notion API path below — never try to write to Postgres.

## Create an empty Book Notes skeleton in Notion

Use this when Chappy asks for a new blank booknotes page with chapter headings / empty bullets, not a summary. Do **not** invent summaries or takeaways.

1. Check whether the book already exists in the Postgres cache:
   ```bash
   ~/.agents/skills/book-notes/scripts/q.sh "SELECT id,title,author,notion_url FROM books WHERE lower(title) LIKE '%<title words>%' LIMIT 10;"
   ```
   If absent, search Notion directly before creating anything. The SQL mirror includes only pages whose `Started` or `Finished` date is populated, so a blank or undated Notion page remains absent even after the daily sync.
2. Find authoritative chapter names / table of contents. Prefer the publisher/library catalog/author site. Web search is acceptable for the TOC; do not fetch copyrighted full text unless unavoidable for TOC metadata.
3. Create a new page in the Book Notes database via Notion API:
   - Book Notes database ID: `340ec223-7246-4d89-a44e-8005075bb7c4`
   - Book Notes data source ID: `9d03bfe1-3c22-411e-921a-60f86bd790c4`
   - For books with multiple authors, record only the first-listed author in the `Author` property.
   - Required properties: `Title` (title), `Author` (rich_text if known), `Publication` (number if known), `Tags` (multi_select if obvious), `Notes?` = false, `Summarized?` = false, `Automated?` = false.
   - Leave `Started` and `Finished` empty unless Chappy explicitly supplies a date. The page will stay Notion-only until one of those fields is set.
   - Leave `Website` empty. The sync fills it once the page enters the mirror.
4. Page body should match Chappy’s fill-in template:
   - `# Summary`
   - paragraph `Todo`
   - `# Key Takeaways`
   - one bullet `Todo`
   - `# Notes`
   - optional Parts as `heading_3` blocks, numbered with just the part number when possible
   - introductions, chapters, and epilogues as bold paragraphs
   - exactly one empty bulleted-list item under each empty reading-section leaf
5. Verify by fetching the new page’s children and confirming the expected block count/order. Return the Notion URL.

Credential/path notes: use the `notion` skill for API details. If `$NOTION_API_KEY` is not exported, parse only the `NOTION_API_KEY=` line from `~/.hermes/.env`, then fall back to `~/.config/notion/api_key`.

## How to query

Run SQL via the bundled script. Output is CSV on stdout.

```bash
~/.agents/skills/book-notes/scripts/q.sh "SELECT title, author, rating FROM books WHERE rating >= 4 ORDER BY finished DESC LIMIT 20;"
```

- `DATABASE_URL` is auto-loaded from the PersonalWebsite repo's ignored `.env`. The script resolves the physical repo path even when invoked through either discovery symlink.
- Statement timeout is 10s.
- No row cap is injected — always add `LIMIT` for exploratory queries. Aggregations without `LIMIT` are fine.

### Freshness caveat

The Postgres book cache syncs daily at 09:00 UTC. Existing mirrored pages may be stale until the next successful sync. After a successful sync, changed website book routes and OG images are invalidated and the changed OG images are warmed; unchanged images remain cached. New pages enter the mirror only when `Started` or `Finished` is non-empty; blank scaffolds and undated want-to-read pages are intentionally outside the SQL mirror. If SQL misses a page or freshness matters, query the Notion Book Notes database directly by title/page ID. Hand off to `book-notes-summarizer` when the task is to write a finished summary.

## Book tag taxonomy cleanup / repair

Use this workflow when Chappy asks to fix Book Notes tags, make tags show up on `books.chappyasel.com`, or replace non-standard tags.

1. Treat Notion as the source of truth. Do not patch the Postgres cache directly; it is a synced website cache.
2. Discover the website-supported taxonomy from the PersonalWebsite repo before editing data. The canonical list currently lives in `/Users/chappyasel/Desktop/Repos/PersonalWebsite/src/lib/books/tagColors.ts` as the tag color/default ordering set.
3. Audit current tags from Postgres with `q.sh` against the supported set, then list affected books with title, author, id, notion_id, and unsupported tags.
4. Map broad legacy Notion tags into the closest supported site tags. Preserve already-supported tags and replace only unsupported ones.
5. Dry-run the replacement plan first and generate an audit CSV/report. For large batches, fan out subagents to propose replacements, then consolidate before writing.
6. Apply updates to Notion pages via the Notion API `Tags` multi-select property. Never print credentials from `.env` while doing this.
7. Run the PersonalWebsite book sync with the exact repo-local command in `references/tag-taxonomy-cleanup.md`, then verify the DB has zero unsupported `book_tags` rows with its anti-join query.
8. Verify `git status --short` in the website repo is clean unless code changes were intentionally requested.

Reference detail: `references/tag-taxonomy-cleanup.md` captures the proven audit/update/sync pattern and the broad legacy tag replacements from the 2026-06 cleanup.

## Schema and query examples

The Drizzle definitions in `/Users/chappyasel/Desktop/Repos/PersonalWebsite/src/server/db/schema.ts` are the source of truth. Inspect the `books` and `bookTags` definitions before using a field not shown in the bundled examples; TypeScript camelCase names map to snake_case SQL columns. One book has many tags through `book_tags.book_id = books.id`.

One column is derived rather than mirrored from Notion: `cover_color` is the dominant jacket color the sync samples from `cover_url` for the website's color sort. See `references/schema.md` before reasoning about it; it has no Notion counterpart.

One Notion property runs the other way. `Website` (URL) is written by the sync, never read for content: it holds `https://books.chappyasel.com/<id>` for every mirrored page, is rewritten whenever the slug moves (a re-read can hand the clean slug to a different read), and is cleared when a page drops out of the mirror. Do not hand-edit it, and do not query it as a source field; `books.id` is the same value.

### Abandoned books

A book Chappy dropped has `abandoned` (timestamp) set and `finished` NULL; `abandoned_at_min` holds the Audible position in raw minutes (percent = `abandoned_at_min / audio_length_min`). In Notion these are the `Abandoned` date and `Abandoned At` (H.MM, like Audio Length) properties. Consequences for queries:

- `finished IS NOT NULL` still means "actually read" — abandoned books never satisfy it, so books-read counts and rating queries need no change.
- "Currently reading" must exclude drops: `started IS NOT NULL AND finished IS NULL AND abandoned IS NULL`. The old two-clause idiom silently includes abandoned books.
- The website hides abandoned books by default (an "Abandoned" filter shows them); match that framing when answering "what is Chappy reading/has read" — mention abandoned books only when the question is about them.
- Reading-time analytics credit an abandoned book's listened hours (position spread across started → abandoned) but never count it as a finish.

See `references/schema.md` for stable example queries covering common use cases (top-rated, by tag, reading pace, full-text search in notes, re-reads). Update those examples whenever the authoritative schema changes.

## External book-recommendation personalization

Use this workflow when Chappy asks for book recommendations from an external person/source, not just from his own library:

1. Research the external source first and separate primary sources from aggregators. Prefer the person's own site, interviews, podcasts, or curated lists; use aggregators only to cross-check frequency/strength.
2. Extract a broad candidate set before ranking. Do not just echo the first ten items from a list.
3. Query Chappy's book DB for candidate titles/authors before finalizing. Deprioritize books he already read and rated poorly or middling; mark 5-star prior reads as possible rereads only when there is a clear purpose.
4. If Chappy asks for Audible/audiobook recommendations, verify candidate availability in Audible or another current audiobook catalog before finalizing. Prefer titles with confirmed audiobook listings; include duration/narrator only when verified. If a high-fit book appears unavailable in audio, either skip it or label it explicitly as non-Audible/print-only.
5. Personalize the final ranking against Chappy's current priorities, known tastes, and recent operating context. Explicitly say when a pick is high-fit for OpenLattice, judgment, relationships, social systems, or another active theme.
6. Include a short "deprioritize / skip" section when the source's famous recommendations conflict with Chappy's history.

Reference detail: `references/naval-ravikant-recommendations.md` captures the Naval-specific source map and candidate shortlist used in one such session.

## Output handling

CSV output is fine for tabular results. For single-book deep dives (reading `notes` text), query one book at a time — the `notes` column can be large (thousands of lines of markdown).

When extracting a full multiline `notes` field for synthesis, remember that `q.sh` prints leading `SET` lines before the CSV header and the notes may contain embedded newlines. Parse the output as CSV starting at the `notes` header; do not flatten line breaks or rely on line-oriented grep.

## See also

Sibling skills using the same PersonalWebsite Postgres database (cross-domain JOINs are fair game):

- **`book-notes-summarizer`** — write skill: turns a book's raw notes into a structured Notion summary. Use when the user asks to summarize/write book notes.
- **`weightlifting`** — read skill for workout/exercise/set history. Use for questions about lifting, PRs, volume.
- **`youtube-watch-history`** — read skill for YouTube watch history. Use for questions about videos watched, channels, watch time, content quality.
