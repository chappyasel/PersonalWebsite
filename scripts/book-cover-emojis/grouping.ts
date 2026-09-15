/**
 * Fold the mirrored book catalog into one emoji per work.
 *
 * A reread is two rows in `books`: same title, same author, two Notion pages,
 * two site slugs, two finish dates. An emoji is a picture of a book, not of a
 * reading, so both rows collapse into one asset here and the manifest keeps
 * every source row and Notion id that fed it.
 *
 * Naming is deterministic for a given catalog and deliberately date-blind:
 * a name derives from title, author surname, publication year, and Notion id,
 * in that order, never from a finish date. The site's own slug ladder
 * (src/lib/books/slugify.ts) does sort by finish date so the most recent read
 * claims the clean URL, which is right for URLs and wrong for files.
 *
 * Limits worth knowing before anyone treats a name as permanent:
 *   - a title edited in Notion changes the name, because the name is built
 *     from the title;
 *   - a name only escalates past the title when two groups collide, so adding
 *     a second, different book with the same title can push the newer group
 *     onto a longer name (the earlier group keeps the short one, since
 *     assignment walks groups in key order);
 *   - the Notion-id rung uses the group's first row by Notion id, so a reread
 *     whose page id sorts earlier would change that rung's suffix.
 * A run reports how many names needed more than the title, so a catalog that
 * starts exercising these rungs is visible rather than silent.
 */
import { createHash } from "node:crypto";

export type CatalogRow = {
  /** books.id — the human-readable site slug for this reading. */
  id: string;
  notionId: string;
  title: string;
  author: string;
  publicationYear: number | null;
  finished: string | null;
  abandoned: string | null;
  coverUrl: string | null;
  coverColor: string | null;
};

export type CoverGroup = {
  /** Normalized title + author. Stable join key, never shown. */
  key: string;
  /** Asset name without extension. Searchable, collision-free. */
  name: string;
  title: string;
  author: string;
  publicationYear: number | null;
  /** The cover art every row in the group shares, as stored. */
  coverUrl: string | null;
  /** books.id of the row that supplied coverUrl, null when none has one. */
  coverRowId: string | null;
  coverColor: string | null;
  /** Every source row, ordered by notionId. */
  rows: CatalogRow[];
};

/** Prefix on every asset name, so a loose file still says what it is. */
export const NAME_PREFIX = "book";

/**
 * Fold a title or author to a comparison form, conservatively: Unicode
 * compatibility normalization, case, and whitespace only. Script and
 * punctuation survive, so two distinct non-Latin titles stay two groups
 * rather than collapsing into one empty key. It groups no more aggressively
 * than a plain SQL lower() would.
 */
export function normalizeKeyPart(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Length-prefixed join rather than a separator character, so no title
 * containing the separator can be confused with a different title/author
 * split.
 */
export function groupKeyFor(row: Pick<CatalogRow, "title" | "author">): string {
  const title = normalizeKeyPart(row.title);
  const author = normalizeKeyPart(row.author);
  return `${title.length}:${title}:${author}`;
}

/**
 * Filename-safe form of a display string: strip diacritics, keep what is left
 * of ASCII. Returns an empty string for text with no Latin letters or digits
 * at all; callers fall back to a hash so such a book still gets a stable,
 * unique name instead of a blank one.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Short, stable digest of a group key, for titles that do not transliterate. */
export function keyHash(key: string, length = 10): string {
  return createHash("sha256").update(key).digest("hex").slice(0, length);
}

function authorLastName(author: string): string {
  const parts = author.trim().split(/\s+/);
  return parts[parts.length - 1] ?? author.trim();
}

function byNotionId(a: CatalogRow, b: CatalogRow): number {
  return a.notionId.localeCompare(b.notionId);
}

/**
 * Longest a name may reach before a suffix is appended. Well inside every
 * filesystem limit, and longer than any title in the library.
 */
const MAX_NAME_LENGTH = 96;

function clampName(name: string): string {
  if (name.length <= MAX_NAME_LENGTH) return name;
  return name.slice(0, MAX_NAME_LENGTH).replace(/-+$/, "");
}

/**
 * Collapse rows into groups. Within a group the canonical row is the first by
 * Notion id, which fixes the display title and author without consulting a
 * date; the cover is the canonical row's when it has one, otherwise the first
 * row by Notion id that does. Readings of one book normally share a cover, so
 * the rule mostly has to be stable rather than clever.
 */
export function groupCatalog(rows: readonly CatalogRow[]): CoverGroup[] {
  const buckets = new Map<string, CatalogRow[]>();
  for (const row of rows) {
    const key = groupKeyFor(row);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  const groups: CoverGroup[] = [];
  for (const [key, bucket] of buckets) {
    const ordered = [...bucket].sort(byNotionId);
    const canonical = ordered[0]!;
    const coverRow = ordered.find((row) => row.coverUrl) ?? null;
    groups.push({
      key,
      name: "",
      title: canonical.title,
      author: canonical.author,
      publicationYear:
        canonical.publicationYear ??
        ordered.find((row) => row.publicationYear !== null)?.publicationYear ??
        null,
      coverUrl: coverRow?.coverUrl ?? null,
      coverRowId: coverRow?.id ?? null,
      coverColor:
        coverRow?.coverColor ??
        ordered.find((row) => row.coverColor)?.coverColor ??
        null,
      rows: ordered,
    });
  }

  // Assign in key order rather than date order, so a newly added reading does
  // not reshuffle names that are already on disk.
  groups.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const used = new Set<string>();
  for (const group of groups) {
    group.name = assignName(group, used);
    used.add(group.name);
  }
  return groups;
}

/**
 * Title, then author surname, then publication year, then a Notion prefix,
 * then a key hash. The ladder mirrors the site's slug escalation so one
 * naming scheme reads like the other. The title alone usually suffices; the
 * rest of the ladder exists so a second "Essays" cannot overwrite a file.
 */
export function assignName(
  group: Pick<
    CoverGroup,
    "key" | "title" | "author" | "publicationYear" | "rows"
  >,
  used: ReadonlySet<string>,
): string {
  const notionId = group.rows[0]?.notionId ?? "";
  const notionPrefix = notionId.replace(/-/g, "").slice(0, 8);
  const titleSlug = slugify(group.title) || keyHash(group.key);
  const base = clampName(`${NAME_PREFIX}-${titleSlug}`);

  const candidates: string[] = [base];
  const surname = slugify(authorLastName(group.author));
  if (surname) candidates.push(`${base}-${surname}`);
  if (group.publicationYear) {
    candidates.push(
      `${candidates[candidates.length - 1]!}-${group.publicationYear}`,
    );
  }
  if (notionPrefix) {
    candidates.push(`${candidates[candidates.length - 1]!}-${notionPrefix}`);
  }
  candidates.push(`${base}-${keyHash(group.key)}`);

  for (const candidate of candidates) {
    if (!used.has(candidate)) return candidate;
  }

  // Only reachable if two groups share a key, which grouping prevents.
  const tail = candidates[candidates.length - 1]!;
  for (let n = 2; ; n++) {
    const candidate = `${tail}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
