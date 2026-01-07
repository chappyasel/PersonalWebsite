/**
 * Generates human-readable, deterministic slugs for books.
 *
 * The algorithm ensures that:
 * 1. Slugs are URL-friendly (lowercase, alphanumeric + hyphens)
 * 2. Slugs are deterministic (same book always gets same slug)
 * 3. Conflicts are resolved using: author → year → notion ID
 */

type BookForSlug = {
  notionId: string;
  title: string;
  author: string | null;
  publicationYear: number | null;
};

/**
 * Convert a string to a URL-friendly slug.
 * - Lowercase
 * - Replace non-alphanumeric chars with hyphens
 * - Collapse consecutive hyphens
 * - Trim leading/trailing hyphens
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Extract the last name from an author string.
 * Handles common formats like "First Last", "First Middle Last", etc.
 */
function getAuthorLastName(author: string): string {
  const trimmed = author.trim();
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1] ?? trimmed;
}

/**
 * Generate all book IDs at once to handle conflicts deterministically.
 *
 * The algorithm:
 * 1. Generate base slugs from titles
 * 2. For conflicts, append author's last name
 * 3. If still conflicting, append publication year
 * 4. If still conflicting, append first 4 chars of Notion ID
 *
 * Books are sorted by notionId before processing to ensure deterministic
 * conflict resolution order.
 */
export function generateAllBookIds(
  books: BookForSlug[],
): Map<string, string> {
  // Sort by notionId for deterministic ordering
  const sortedBooks = [...books].sort((a, b) =>
    a.notionId.localeCompare(b.notionId),
  );

  const result = new Map<string, string>();
  const usedSlugs = new Set<string>();

  for (const book of sortedBooks) {
    let slug = slugify(book.title);

    // If base slug conflicts, try adding author
    if (usedSlugs.has(slug) && book.author) {
      const authorSlug = slugify(getAuthorLastName(book.author));
      if (authorSlug) {
        slug = `${slug}-${authorSlug}`;
      }
    }

    // If still conflicts, try adding year
    if (usedSlugs.has(slug) && book.publicationYear) {
      slug = `${slug}-${book.publicationYear}`;
    }

    // If still conflicts, append first 4 chars of Notion ID (last resort)
    if (usedSlugs.has(slug)) {
      const notionPrefix = book.notionId.replace(/-/g, "").slice(0, 4);
      slug = `${slug}-${notionPrefix}`;
    }

    usedSlugs.add(slug);
    result.set(book.notionId, slug);
  }

  return result;
}

/**
 * Check if a string looks like a Notion UUID.
 * Used to detect old-style URLs for redirect handling.
 */
export function isNotionId(id: string): boolean {
  // Notion IDs are UUIDs with or without dashes
  // With dashes: 8-4-4-4-12 format
  // Without: 32 hex chars
  const uuidWithDashes = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uuidWithoutDashes = /^[0-9a-f]{32}$/i;
  return uuidWithDashes.test(id) || uuidWithoutDashes.test(id);
}
