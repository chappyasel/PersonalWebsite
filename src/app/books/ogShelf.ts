/**
 * Pure helpers behind the /books OG card. They live outside the route file
 * because Next only permits its own exports there.
 */

/** Every k-th book of the color-ordered shelf, so the sample keeps the whole
 * spectrum and the families' true proportions. Short shelves repeat. */
export function sampleEvenly<T>(items: readonly T[], count: number): T[] {
  if (items.length === 0 || count <= 0) return [];
  const step = items.length / count;
  return Array.from(
    { length: count },
    (_, i) => items[Math.floor(i * step) % items.length]!,
  );
}

/** One decimal, or an em dash when the stat has nothing behind it. Matches
 * the homepage Book Notes card. */
export function formatShelfStat(value: number | null, suffix = ""): string {
  return value == null ? "\u2014" : `${value.toFixed(1)}${suffix}`;
}
