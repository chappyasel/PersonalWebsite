/**
 * Every S3 key this feature touches, built in one place.
 *
 * The bucket is shared with the weightlifting backup and the weight log, so
 * confinement is not a style preference. Each builder runs through
 * `confine`, which refuses anything that would escape the prefix, and the
 * worker checks the same function before it reads or writes. A workId comes
 * from a book title by way of a slug, so it is already tame, but the check is
 * cheap and the failure it prevents is deleting somebody else's object.
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

export const assetKey = (sha256: string) =>
  confine(`${PREFIX}assets/${assertSegment(sha256, "sha256")}.png`);

export const revisionKey = (workId: string, revision: number) =>
  confine(
    `${PREFIX}work/${assertSegment(workId, "workId")}/rev-${assertPositive(revision, "revision")}.json`,
  );

export const headKey = (workId: string) =>
  confine(`${PREFIX}work/${assertSegment(workId, "workId")}/head.json`);

export const receiptKey = (workId: string, revision: number, attempt: number) =>
  confine(
    `${PREFIX}receipts/${assertSegment(workId, "workId")}/${assertPositive(revision, "revision")}-${assertPositive(attempt, "attempt")}.json`,
  );

export const catalogKey = () => confine(`${PREFIX}index/catalog.json`);

export const workPrefix = () => `${PREFIX}work/`;

function assertPositive(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`invalid ${label}: ${String(value)}`);
  }
  return value;
}
