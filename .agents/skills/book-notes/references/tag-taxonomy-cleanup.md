# Book tag taxonomy cleanup reference

Use this as the concrete pattern for repairing Book Notes tags so `books.chappyasel.com` shows them correctly.

## Source of truth and supported taxonomy

- Book Notes pages live in Notion; the PersonalWebsite Postgres DB is a synced cache.
- Supported public-site tags are defined in the PersonalWebsite repo, not by the broad Notion tags visible in the UI.
- In the 2026-06 cleanup, the canonical list was read from:
  - `/Users/chappyasel/Desktop/Repos/PersonalWebsite/src/lib/books/tagColors.ts`
- The sync path was inspected in:
  - `src/lib/books/notion.ts`
  - `src/lib/books/sync.ts`
  - `src/app/api/cron/sync-books/route.ts`

## Audit shape

Query unsupported rows by anti-joining current `book_tags.tag_name` against the supported set. Include enough columns to safely update Notion:

```sql
WITH supported(tag) AS (VALUES
  ('Business Strategy'),
  ('Business Operations'),
  ('Entrepreneurship'),
  ('Innovation'),
  ('Leadership'),
  ('Management'),
  ('Information Technology'),
  ('Emerging Technology'),
  ('AI'),
  ('Futurism'),
  ('Pure Science'),
  ('Applied Science'),
  ('Stats & data'),
  ('Physical Health'),
  ('Clinical Psychology'),
  ('Cognitive Psychology'),
  ('Habits & Biases'),
  ('Personal Growth'),
  ('Productivity'),
  ('Personal Finance'),
  ('Interpersonal'),
  ('Philosophy'),
  ('Happiness & Success'),
  ('Sociology'),
  ('Politics'),
  ('Macroeconomics'),
  ('Microeconomics'),
  ('Contemporary Issues'),
  ('History (Pre-WWII)'),
  ('History (Post-WWII)'),
  ('Biographies'),
  ('Classical Literature'),
  ('Contemporary Literature'),
  ('Science Fiction')
)
SELECT b.title, b.author, b.id, b.notion_id, bt.tag_name
FROM book_tags bt
JOIN books b ON b.id = bt.book_id
LEFT JOIN supported s ON s.tag = bt.tag_name
WHERE s.tag IS NULL
ORDER BY b.title, bt.tag_name;
```

## Legacy broad-tag mapping from 2026-06 cleanup

The broad Notion tags from the UI screenshot do not all render on the site. Use book-specific judgment, but these are the replacement families that worked:

- `Economics` -> `Macroeconomics` or `Microeconomics`
- `History` -> `History (Pre-WWII)` or `History (Post-WWII)`
- `Psychology` -> `Cognitive Psychology`, `Clinical Psychology`, `Habits & Biases`, or `Happiness & Success`
- `Self-Help` -> `Personal Growth`, `Productivity`, `Habits & Biases`, or `Happiness & Success`
- `Technology` -> `Information Technology`, `Emerging Technology`, `AI`, or `Futurism`
- `Business` -> `Business Strategy`, `Business Operations`, `Entrepreneurship`, `Leadership`, or `Management`
- `Finance` -> `Personal Finance`, `Macroeconomics`, or `Microeconomics`
- `Medicine` -> `Physical Health` or `Clinical Psychology`
- `Communication` -> `Interpersonal`
- `Marketing` -> `Business Strategy` or `Entrepreneurship`
- `Negotiation` -> `Interpersonal`
- `Science` -> `Pure Science`, `Applied Science`, or `Stats & data`
- `Biology` -> `Pure Science`, `Applied Science`, or `Physical Health`
- `Community` -> `Sociology` or `Interpersonal`
- `Networking` -> `Interpersonal`

Preserve existing supported tags on each book and replace only unsupported tags.

## Apply + verify pattern

1. Build a dry-run script that:
   - loads only needed env vars from the website `.env` without printing values
   - parses the unsupported rows CSV
   - defines the supported tag set
   - defines the proposed replacement map by book id / Notion page id
   - prints before/after tags without writing
2. Review the plan. For >50 affected books, fan out subagents over JSON batches to propose replacements, then consolidate.
3. Apply with Notion API page updates to the `Tags` multi-select property.
4. Sync the website DB from Notion from the PersonalWebsite repo:

```bash
DOTENV_CONFIG_PATH=.env npx tsx -r dotenv/config -e "import { syncBooksFromNotion } from './src/lib/books/sync'; const result = await syncBooksFromNotion('manual'); console.log('SYNC_RESULT_JSON=' + JSON.stringify(result));"
```

5. Verify with the unsupported-tag anti-join. A clean result may show only CSV headers, e.g. `tag_name,count`.
6. List final tag counts for sanity and check `git status --short` is clean.

## Pitfalls

- Do not update Postgres directly; the next sync can overwrite it.
- Do not add broad tags to the website taxonomy just because they exist in Notion. Chappy asked for books to use supported tags only.
- Direct per-page Notion verification can hit rate limits. A successful Notion-to-DB sync followed by DB anti-join verification is sufficient for the website rendering path; if direct Notion verification is still needed, use slower batched reads with Retry-After handling.
- Never include `.env` values, Notion tokens, database URLs, or cron secrets in reports or saved references.
