/**
 * Job identity and revisions.
 *
 * One work item per book, never per reading. A book read twice has two Notion
 * pages and one jacket, so the job carries both page ids and both pages end up
 * wearing the same emoji id. That is the whole reason work is keyed by asset
 * and not by page.
 *
 * Two different revisions are tracked because they answer different questions.
 * `revision` is the job revision, bumped whenever anything about the job
 * changes, and it names an immutable S3 object. `emojiRevision` bumps only
 * when the artwork changes, because that is the only thing that forces a new
 * emoji name in Notion. Adding a reread changes the first and not the second.
 */
import { emojiNameFor } from "./emojiNames";

export type WorkPage = { notionId: string; bookId: string };

export type WorkInput = {
  /** Asset name from the generator, e.g. "book-the-mom-test". */
  workId: string;
  sha256: string;
  bytes: number;
  title: string;
  author: string;
  pages: WorkPage[];
};

export type WorkRevision = {
  workId: string;
  revision: number;
  emojiRevision: number;
  emojiName: string;
  sha256: string;
  assetKey: string;
  bytes: number;
  title: string;
  author: string;
  pages: WorkPage[];
  workspaceId: string;
  createdAt: string;
};

/** The small mutable pointer that says which revision is current. */
export type WorkHead = {
  workId: string;
  revision: number;
  emojiRevision: number;
  emojiName: string;
  sha256: string;
  updatedAt: string;
};

/**
 * "name" covers the case where the artwork and pages are both unchanged but
 * the name policy has moved, which happened once for real: the length cap was
 * a guess at 64 until Notion's dialog said "Name must be less than 50
 * characters". A stored name that the policy would no longer produce needs a
 * fresh revision, because the old one is immutable and the worker would
 * otherwise keep trying to register a name Notion rejects.
 */
export type WorkChange = "created" | "artwork" | "pages" | "name" | "unchanged";

export type PlannedWork = {
  change: WorkChange;
  head: WorkHead;
  revision: WorkRevision | null;
};

function samePages(a: readonly WorkPage[], b: readonly WorkPage[]): boolean {
  if (a.length !== b.length) return false;
  const key = (page: WorkPage) => `${page.notionId}:${page.bookId}`;
  const left = [...a].map(key).sort();
  const right = [...b].map(key).sort();
  return left.every((value, index) => value === right[index]);
}

export function sortPages(pages: readonly WorkPage[]): WorkPage[] {
  return [...pages].sort((a, b) => a.notionId.localeCompare(b.notionId));
}

/**
 * Decide what, if anything, this book needs next.
 *
 * `previousRevision` is the current revision object, needed only to tell a
 * page-set change from no change at all; a caller that does not have it gets
 * a new revision whenever the head is missing or the artwork moved.
 */
export function planWorkItem(
  input: WorkInput,
  head: WorkHead | null,
  previousRevision: WorkRevision | null,
  workspaceId: string,
  now: string,
  assetKeyFor: (sha256: string) => string,
  maxNameLength?: number,
): PlannedWork {
  const pages = sortPages(input.pages);

  if (!head) {
    const emojiRevision = 1;
    const emojiName = emojiNameFor(input.workId, emojiRevision, maxNameLength);
    return {
      change: "created",
      head: {
        workId: input.workId,
        revision: 1,
        emojiRevision,
        emojiName,
        sha256: input.sha256,
        updatedAt: now,
      },
      revision: {
        workId: input.workId,
        revision: 1,
        emojiRevision,
        emojiName,
        sha256: input.sha256,
        assetKey: assetKeyFor(input.sha256),
        bytes: input.bytes,
        title: input.title,
        author: input.author,
        pages,
        workspaceId,
        createdAt: now,
      },
    };
  }

  const artworkMoved = head.sha256 !== input.sha256;
  const pagesMoved =
    previousRevision !== null && !samePages(previousRevision.pages, pages);

  const emojiRevision = artworkMoved ? head.emojiRevision + 1 : head.emojiRevision;
  const emojiName = emojiNameFor(input.workId, emojiRevision, maxNameLength);
  // Same artwork, same pages, but the name policy no longer agrees with what
  // is stored. The stored revision is immutable, so this becomes a new one.
  const nameMoved = !artworkMoved && head.emojiName !== emojiName;

  if (!artworkMoved && !pagesMoved && !nameMoved) {
    return { change: "unchanged", head, revision: null };
  }

  const revision = head.revision + 1;

  return {
    change: artworkMoved ? "artwork" : pagesMoved ? "pages" : "name",
    head: {
      workId: input.workId,
      revision,
      emojiRevision,
      emojiName,
      sha256: input.sha256,
      updatedAt: now,
    },
    revision: {
      workId: input.workId,
      revision,
      emojiRevision,
      emojiName,
      sha256: input.sha256,
      assetKey: assetKeyFor(input.sha256),
      bytes: input.bytes,
      title: input.title,
      author: input.author,
      pages,
      workspaceId,
      createdAt: now,
    },
  };
}
