/**
 * Names for the emoji themselves.
 *
 * Notion's emoji UI has no safe way to swap the image behind an existing
 * name, so a changed cover gets a new name rather than a quiet overwrite. The
 * first revision uses the asset name as-is; later ones append the revision, so
 * `book-the-mom-test` becomes `book-the-mom-test-r2`. The old emoji survives,
 * which is what lets page icons move only after the new one is verified.
 *
 * Notion's actual limit on emoji name length is undocumented, and cannot be
 * learned without writing one. The cap here is a knob with a conservative
 * default rather than a discovered fact, and the first pilot batch is what
 * confirms it.
 */

/**
 * Notion's actual cap, read off the dialog on 2026-09-15: a 50-character name
 * disables Save and shows "Name must be less than 50 characters". 49 is
 * accepted. This was a guess at 64 until the first pilot batch proved it.
 */
export const DEFAULT_MAX_NAME_LENGTH = 49;

/** Longest asset name in the current catalog, for context in the docs. */
export const LONGEST_KNOWN_NAME = "book-101-essays-that-will-change-the-way-you-think";

export function emojiNameFor(
  base: string,
  emojiRevision: number,
  maxLength: number = DEFAULT_MAX_NAME_LENGTH,
): string {
  if (!Number.isInteger(emojiRevision) || emojiRevision < 1) {
    throw new Error(`emoji revision must be 1 or more, got ${String(emojiRevision)}`);
  }
  const suffix = emojiRevision === 1 ? "" : `-r${emojiRevision}`;
  const room = maxLength - suffix.length;
  if (room < 1) {
    throw new Error(`maxLength ${maxLength} leaves no room for ${suffix}`);
  }
  if (base.length <= room) return `${base}${suffix}`;

  // Cut back to a word boundary rather than mid-word: "…-the-way-you" reads,
  // "…-the-way-you-thin" looks like a typo. Falls back to a hard cut if the
  // first segment alone is already too long.
  const cut = base.slice(0, room);
  const lastHyphen = cut.lastIndexOf("-");
  const trimmed = (lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/, "");
  return `${trimmed || cut}${suffix}`;
}

/** Notion emoji names are compared case-insensitively by the picker. */
export function normalizeEmojiName(name: string): string {
  return name.trim().toLowerCase();
}
