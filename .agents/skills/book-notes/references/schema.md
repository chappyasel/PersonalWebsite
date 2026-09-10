# book-notes — example queries

## Basic lookups

```sql
-- Find a book by partial title
SELECT id, title, author, rating, finished
FROM books
WHERE title ILIKE '%sapiens%'
LIMIT 10;

-- Get full notes for one book
SELECT title, author, rating, notes
FROM books
WHERE id = 'thinking-fast-and-slow';
```

## Filtering and ranking

```sql
-- Top-rated finished books
SELECT title, author, rating, finished
FROM books
WHERE rating IS NOT NULL AND finished IS NOT NULL
ORDER BY rating DESC, finished DESC
LIMIT 25;

-- Currently reading (started, neither finished nor abandoned)
SELECT title, author, started
FROM books
WHERE started IS NOT NULL AND finished IS NULL AND abandoned IS NULL
ORDER BY started DESC;

-- Abandoned books, with how far the listen got
-- (abandoned_at_min is the Audible position in raw minutes)
SELECT title, author, abandoned,
       ROUND(100.0 * abandoned_at_min / NULLIF(audio_length_min, 0)) AS pct
FROM books
WHERE abandoned IS NOT NULL
ORDER BY abandoned DESC;

-- Recently finished
SELECT title, author, rating, finished
FROM books
WHERE finished IS NOT NULL
ORDER BY finished DESC
LIMIT 20;
```

## Featured

`is_featured` mirrors the `Featured?` checkbox in Notion. It is a hand-curated
shortlist, not a derived one, so it is the right answer to "which books does
Chappy single out" and the wrong answer to "which does he rate highest".
Currently 8 books. Note that a re-read is a separate row and the checkbox is set
per Notion page, so only one row of a re-read pair carries the flag — match on
`id`, never on title.

```sql
-- The featured shortlist, in the order the homepage shows it
SELECT id, title, author, rating, finished
FROM books
WHERE is_featured
ORDER BY finished DESC;
```

## Cover color

`cover_color` is derived, not synced: the website sync samples the dominant
jacket hue from `cover_url` (`src/lib/books/coverColor.server.ts`), sets it at
the lightness the whole jacket reads at, and stores it as `#rrggbb`. It backs
the shelf's "Color" sort, which groups by family and then walks a smooth
OKLab path inside each family. There is no Notion property behind it, so
never try to fix it in Notion; a wrong family means the thresholds in
`src/lib/books/coverColor.ts` need tuning (no resample needed), a wrong hex
means the sampler does, and `pnpm backfill:book-colors --force` resamples
every cover. NULL means the book has no cover or the cover host could not be
read.

```sql
-- Books still missing a shelf color
SELECT id, title, cover_url
FROM books
WHERE cover_url IS NOT NULL AND cover_color IS NULL;
```

The 3D homepage uses a separate, server-sampled **edge color** from
`src/lib/books/coverEdgeColor.server.ts` for boards and spines. It samples
the perimeter of the same cover image the scene renders, caches successful
samples by URL, and does not read or write `cover_color`. A white-faced book
with a red border can therefore sort with white books while wearing red
boards in the scene. These are separate measurements, not competing sources
for one value.

## Website link

Notion's `Website` URL property is the one field the sync writes rather than
reads (`syncWebsiteUrlsToNotion` in `src/lib/books/sync.ts`). After every sync
it equals `'https://books.chappyasel.com/' || id` for each mirrored page, so a
slug change (re-read shuffles, a retitled page) rewrites it on the next run and
a page leaving the mirror has it cleared. It is not stored in Postgres; build
the link from `id` instead, and never patch the property by hand.

```sql
-- The link the sync wrote for a book
SELECT title, 'https://books.chappyasel.com/' || id AS website_url
FROM books
WHERE lower(title) LIKE '%thinking%';
```

## Tags / topics

```sql
-- Books with a given tag
SELECT b.title, b.author, b.rating
FROM books b
JOIN book_tags t ON t.book_id = b.id
WHERE t.tag_name = 'Macroeconomics'
ORDER BY b.rating DESC NULLS LAST;

-- All tags with counts
SELECT tag_name, COUNT(*) AS n
FROM book_tags
GROUP BY tag_name
ORDER BY n DESC;

-- Books matching any of several tags
SELECT DISTINCT b.title, b.author, b.rating
FROM books b
JOIN book_tags t ON t.book_id = b.id
WHERE t.tag_name IN ('AI', 'Philosophy', 'Sociology')
ORDER BY b.rating DESC NULLS LAST;
```

## Search inside notes

Migration `0015_book_search_vector` adds a GIN expression index over the same
weighted English `tsvector` used by Universal Search. Keep its indexed
full-text branch separate from wildcard identity or tag branches; combining
them in one `OR` prevents Postgres from using the GIN index.

```sql
-- Fast full-text search across title, author, and notes. Keep this expression
-- identical to src/lib/universal-search/server/books.ts.
SELECT id, title, author
FROM books
WHERE (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(author, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(notes, '')), 'D')
) @@ plainto_tsquery('english', 'attention is all you need')
LIMIT 20;

-- Pull literal snippet context when exact wording matters. This ILIKE query
-- does not use the GIN expression index.
SELECT title,
       SUBSTRING(
         notes
         FROM GREATEST(STRPOS(LOWER(notes), 'compounding') - 80, 1)
         FOR 480
       ) AS snippet
FROM books
WHERE notes ILIKE '%compounding%'
LIMIT 10;
```

## Reading pace

```sql
-- Books finished per month (last 2 years)
SELECT DATE_TRUNC('month', finished) AS month, COUNT(*) AS n
FROM books
WHERE finished >= NOW() - INTERVAL '2 years'
GROUP BY 1
ORDER BY 1;

-- Average rating per year
SELECT EXTRACT(YEAR FROM finished) AS year,
       COUNT(*) AS n,
       ROUND(AVG(rating)::numeric, 2) AS avg_rating
FROM books
WHERE finished IS NOT NULL AND rating IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;
```

## Re-reads

```sql
-- Books read more than once (same title/author with multiple rows)
SELECT title, author, COUNT(*) AS times_read
FROM books
GROUP BY title, author
HAVING COUNT(*) > 1
ORDER BY times_read DESC;
```

## Metadata / sync freshness

```sql
SELECT MAX(last_synced_at) AS last_sync FROM books;
```
