import { fetchCover } from "../../../scripts/book-cover-emojis/fetch";
import { groupCatalog } from "../../../scripts/book-cover-emojis/grouping";
import { renderCoverEmoji } from "../../../scripts/book-cover-emojis/render";
import { createHash } from "node:crypto";

import { emojiNameFor } from "~/lib/bookCoverEmojis/emojiNames";
import { EmojiStore } from "~/lib/bookCoverEmojis/store";

import { type CloudCatalogRow, readCloudCatalog } from "./catalog";
import { publishWorkItems } from "./producer";

const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const WEEK = 7 * 24 * 60 * 60 * 1000;
type Source = {
  fingerprint: string;
  sha256: string;
  revision: number;
  checkedAt: number;
};
type Checkpoint = {
  cursor?: string;
  /** workId to fingerprint, so the next run can spot new and changed work
   * without reading every source object first. A scheduling hint only; the
   * per-group source read still decides what actually happens. */
  fingerprints?: Record<string, string>;
};

/** What the jacket depends on. Not when the notes were last edited. */
function fingerprintOf(
  group: { coverUrl: string | null; rows: Array<{ notionId: string; id: string }> },
  workspaceId: string,
): string {
  return hash(
    JSON.stringify({
      renderer: "512-contain-v1",
      workspaceId,
      url: group.coverUrl,
      pages: group.rows.map((row) => [row.notionId, row.id]),
    }),
  );
}

export async function produceCloudCovers(options: {
  store: EmojiStore;
  workspaceId: string;
  readCatalog: () => Promise<CloudCatalogRow[]>;
  fetchCover?: typeof fetchCover;
  render?: typeof renderCoverEmoji;
  now?: () => number;
  maxWorks?: number;
  budgetMs?: number;
}) {
  const now = options.now ?? Date.now;
  const started = now();
  const deadline = started + (options.budgetMs ?? 240_000);
  const rows = await options.readCatalog();
  const groups = groupCatalog(rows);
  const checkpoint = await options.store.getCatalog<Checkpoint>();
  const cursor = checkpoint?.value.cursor ?? "";
  const known = checkpoint?.value.fingerprints ?? {};
  const rotated = [
    ...groups.filter((g) => g.key > cursor),
    ...groups.filter((g) => g.key <= cursor),
  ];
  /**
   * A book nobody has queued yet, or one whose cover URL or page mapping moved,
   * goes before a routine weekly recheck. Rotation alone put a new book behind
   * up to 320 refreshes, so it could wait days for an emoji while the queue
   * busied itself confirming that unchanged covers were still unchanged.
   */
  const rank = (group: (typeof groups)[number]): number => {
    const seen = known[group.name];
    if (seen === undefined) return 0;
    return seen === fingerprintOf(group, options.workspaceId) ? 2 : 1;
  };
  const ordered = [
    ...rotated.filter((g) => rank(g) === 0),
    ...rotated.filter((g) => rank(g) === 1),
    ...rotated.filter((g) => rank(g) === 2),
  ];
  const result = {
    total: groups.length,
    visited: 0,
    rendered: 0,
    created: 0,
    artworkChanged: 0,
    pagesChanged: 0,
    nameChanged: 0,
    unchanged: 0,
    contended: 0,
    failed: [] as Array<{ workId: string; error: string }>,
    deferred: 0,
  };
  // Carried forward so a partial run does not forget what it already knew.
  const seenFingerprints: Record<string, string> = { ...known };
  let attempted = 0;
  for (const group of ordered) {
    // Reserve time for one bounded download and its durable writes.
    if (now() >= deadline - 45_000 || attempted >= (options.maxWorks ?? 20))
      break;
    result.visited++;
    try {
      if (!group.coverUrl) throw new Error("missing cover");
      const fingerprint = fingerprintOf(group, options.workspaceId);
      seenFingerprints[group.name] = fingerprint;
      const source = (await options.store.getSource<Source>(group.name))?.value;
      const head = await options.store.getHead(group.name);
      if (
        source?.fingerprint === fingerprint &&
        head?.value.sha256 === source.sha256 &&
        head.value.revision === source.revision &&
        head.value.emojiName ===
          emojiNameFor(group.name, head.value.emojiRevision) &&
        now() - source.checkedAt < WEEK
      ) {
        result.unchanged++;
      } else {
        attempted++;
        const fetched = await (options.fetchCover ?? fetchCover)(
          group.coverUrl,
          { attempts: 1, timeoutMs: 10_000 },
        );
        if (!fetched.ok) throw new Error("cover download failed");
        const { png } = await (options.render ?? renderCoverEmoji)(
          fetched.bytes,
        );
        result.rendered++;
        const sha256 = hash(png);
        const published = await publishWorkItems(
          options.store,
          [
            {
              workId: group.name,
              sha256,
              bytes: png.length,
              title: group.title,
              author: group.author,
              pages: group.rows.map((row) => ({
                notionId: row.notionId,
                bookId: row.id,
              })),
            },
          ],
          {
            workspaceId: options.workspaceId,
            loadAsset: async () => png,
            apply: true,
          },
        );
        for (const key of [
          "created",
          "artworkChanged",
          "pagesChanged",
          "nameChanged",
          "unchanged",
          "contended",
        ] as const)
          result[key] += published[key];
        result.failed.push(...published.failed);
        if (published.failed.length === 0 && published.contended === 0) {
          const publishedHead = await options.store.getHead(group.name);
          const revision = publishedHead
            ? (
                await options.store.getRevision(
                  group.name,
                  publishedHead.value.revision,
                )
              )?.value
            : null;
          const pages = group.rows.map((row) => ({
            notionId: row.notionId,
            bookId: row.id,
          }));
          if (
            revision?.sha256 !== sha256 ||
            revision.workspaceId !== options.workspaceId ||
            JSON.stringify(revision.pages) !== JSON.stringify(pages)
          ) {
            throw new Error("head changed before source checkpoint");
          }
          await options.store.putSource(group.name, {
            fingerprint,
            sha256,
            revision: revision.revision,
            checkedAt: now(),
          } satisfies Source);
        }
      }
    } catch (error) {
      result.failed.push({
        workId: group.name,
        error:
          error instanceof Error && error.message === "missing cover"
            ? "missing cover"
            : "cover processing failed",
      });
    }
    // Cursor advances past failures too, so a broken cover cannot starve later books.
    // A lost cursor write only repeats work; immutable jobs remain authoritative.
    await options.store.putCatalog({
      cursor: group.key,
      fingerprints: seenFingerprints,
      snapshotAt: new Date(started).toISOString(),
      rows,
      result,
    });
  }
  result.deferred = groups.length - result.visited;
  return result;
}

export async function syncBookEmojis() {
  const required = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing ${name}`);
    return value;
  };
  const workspaceId = required("BOOK_COVER_EMOJIS_WORKSPACE_ID");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      workspaceId,
    )
  )
    throw new Error("Invalid workspace ID");
  const databaseUrl = required("DATABASE_URL");
  return produceCloudCovers({
    store: new EmojiStore({
      bucket: required("AWS_BUCKET_NAME"),
      region: required("AWS_REGION"),
    }),
    workspaceId,
    readCatalog: () => readCloudCatalog(databaseUrl),
  });
}
