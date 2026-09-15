/**
 * Every S3 key this feature touches, built in one place.
 *
 * The bucket is shared with the weightlifting backup and the weight log, so
 * confinement is not a style preference. Each builder runs through `confine`,
 * which refuses anything that would escape the prefix. A workId comes from a
 * book title by way of a slug and a page id is a Notion UUID, so both are
 * already tame, but the check is cheap and the failure it prevents is writing
 * over somebody else's object.
 */

export const PREFIX = "book-cover-emojis/";

/** One path segment: no separators, no traversal, no leading dot. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

export class KeyOutsidePrefixError extends Error {
  constructor(key: string) {
    super(`refusing an S3 key outside ${PREFIX}: ${key}`);
    this.name = "KeyOutsidePrefixError";
  }
}

export function assertSegment(value: string, label: string): string {
  if (!SEGMENT.test(value) || value.includes("..")) {
    throw new Error(`invalid ${label}: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Normalize and verify a key sits under the prefix. Rejects traversal,
 * doubled separators, absolute keys, and anything that normalizes out of
 * the prefix.
 */
export function confine(key: string): string {
  if (key.startsWith("/") || key.includes("//") || key.includes("\\")) {
    throw new KeyOutsidePrefixError(key);
  }
  const segments = key.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new KeyOutsidePrefixError(key);
  }
  if (!key.startsWith(PREFIX)) throw new KeyOutsidePrefixError(key);
  return key;
}

/** What the pipeline last knew about one book: fingerprint, artwork, upload. */
export const sourceKey = (workId: string) =>
  confine(`${PREFIX}sources/${assertSegment(workId, "workId")}.json`);

/** What the automation last did to one Notion page, and what was there before. */
export const pageKey = (notionId: string) =>
  confine(`${PREFIX}pages/${assertSegment(notionId, "notionId")}.json`);

export const pagePrefix = () => `${PREFIX}pages/`;

export const catalogKey = () => confine(`${PREFIX}index/catalog.json`);
