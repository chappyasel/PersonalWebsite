/**
 * URL slugs for per-exercise pages, derived from display names (iteration +
 * name, the same derivation the SQL queries use). Deterministic and
 * collision-safe: duplicate slugs get a numeric suffix in input order, so a
 * stable input list always yields the same slug for the same exercise.
 */

export function exerciseSlug(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Map display names to unique slugs, suffixing collisions (-2, -3, …).
 * Callers must pass displayNames in a data-independent order (alphabetical)
 * so a collision's suffix assignment never flips when PRs reorder the index.
 */
export function buildSlugMap(displayNames: string[]): Map<string, string> {
  const used = new Map<string, number>();
  const result = new Map<string, string>();
  for (const name of displayNames) {
    // A name with no ASCII alphanumerics would slug to "" and claim the
    // dashboard route; give it a real base instead
    const base = exerciseSlug(name) || "exercise";
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    result.set(name, count === 0 ? base : `${base}-${count + 1}`);
  }
  return result;
}
