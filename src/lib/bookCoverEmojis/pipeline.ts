/**
 * Render a book's cover, upload it to Notion, and wear it as the page icon.
 *
 * One engine, two callers: the Vercel cron runs it on a schedule against the
 * whole catalog, and the local CLI runs it for the one-time backfill and for
 * pilots. They share this file on purpose — a pilot that exercised different
 * code would prove nothing about the thing that actually runs.
 *
 * Order of work matters more than it looks. A daily run has a budget and a cap,
 * so rotating through the catalog alphabetically would put a brand new book
 * behind up to 320 "is this unchanged cover still unchanged" rechecks and make
 * it wait days for an icon. New and changed books are ranked ahead of routine
 * refreshes for that reason.
 */
import {
  type CatalogRow,
  type CoverGroup,
  groupCatalog,
} from "../../../scripts/book-cover-emojis/grouping";
import { fetchCover } from "../../../scripts/book-cover-emojis/fetch";
import { renderCoverEmoji } from "../../../scripts/book-cover-emojis/render";
import { safeMessage } from "../../../scripts/book-cover-emojis/redact";
import { createHash } from "node:crypto";

import { decideIcon, decodePageIcon, describeIcon, iconIdentity } from "./iconPolicy";
import {
  createFileUpload,
  getPage,
  type NotionApiOptions,
  NotionAuthError,
  sendFileUpload,
  setPageFileIcon,
  whoAmI,
} from "./notionApi";
import { checkBookPage } from "./pageGuard";
import {
  type EmojiStore,
  MAX_PAGE_ATTEMPTS,
  type PageRecord,
  type SourceRecord,
} from "./store";

const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

/** How long an untouched book goes before its cover is downloaded again. */
export const RECHECK_MS = 7 * 24 * 60 * 60 * 1000;

export type Checkpoint = {
  cursor?: string;
  /**
   * workId to fingerprint, so the next run can spot new and changed work
   * without reading every source object first. A scheduling hint only; the
   * per-group source read still decides what actually happens.
   */
  fingerprints?: Record<string, string>;
};

export type PipelineResult = {
  total: number;
  visited: number;
  unchanged: number;
  rendered: number;
  uploaded: number;
  pagesApplied: number;
  pagesAlreadyCorrect: number;
  pagesStoodDown: number;
  failed: Array<{ workId: string; notionId?: string; error: string }>;
  deferred: number;
};

export type PipelineOptions = {
  store: EmojiStore;
  notion: NotionApiOptions;
  workspaceId: string;
  readCatalog: () => Promise<CatalogRow[]>;
  /** False plans and reports without touching Notion or the store. */
  apply: boolean;
  fetchCover?: typeof fetchCover;
  render?: typeof renderCoverEmoji;
  now?: () => number;
  maxWorks?: number;
  budgetMs?: number;
  /** Restrict the run to these works. Used by pilots. */
  onlyWorkIds?: readonly string[];
  log?: (line: string) => void;
};

/** What the jacket depends on. Not when the notes were last edited. */
export function fingerprintOf(
  group: Pick<CoverGroup, "coverUrl" | "rows">,
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

/** Reserve enough time to finish one book rather than abandon it half-done. */
const WORK_RESERVE_MS = 60_000;

class WorkFailure extends Error {
  constructor(
    message: string,
    readonly notionId?: string,
  ) {
    super(message);
    this.name = "WorkFailure";
  }
}

export async function runPipeline(
  options: PipelineOptions,
): Promise<PipelineResult> {
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => undefined);
  const started = now();
  const deadline = started + (options.budgetMs ?? 240_000);
  const maxWorks = options.maxWorks ?? 20;

  // Fail closed on the workspace before anything is read or written. The token
  // decides which workspace it can reach, so a token swapped in the environment
  // is the realistic way icons could land somewhere they were never meant to.
  const me = await whoAmI(options.notion);
  if (me.workspace_id !== options.workspaceId) {
    throw new Error(
      `token belongs to workspace ${me.workspace_id ?? "unknown"}, expected ${options.workspaceId}`,
    );
  }

  const rows = await options.readCatalog();
  const all = groupCatalog(rows);
  const groups = options.onlyWorkIds
    ? all.filter((group) => options.onlyWorkIds?.includes(group.name))
    : all;

  const checkpoint = await options.store.getCatalog<Checkpoint>();
  const cursor = checkpoint?.value.cursor ?? "";
  const known = checkpoint?.value.fingerprints ?? {};

  const rotated = [
    ...groups.filter((group) => group.key > cursor),
    ...groups.filter((group) => group.key <= cursor),
  ];
  const rank = (group: CoverGroup): number => {
    const seen = known[group.name];
    if (seen === undefined) return 0;
    return seen === fingerprintOf(group, options.workspaceId) ? 2 : 1;
  };
  const ordered = [
    ...rotated.filter((group) => rank(group) === 0),
    ...rotated.filter((group) => rank(group) === 1),
    ...rotated.filter((group) => rank(group) === 2),
  ];

  const result: PipelineResult = {
    total: groups.length,
    visited: 0,
    unchanged: 0,
    rendered: 0,
    uploaded: 0,
    pagesApplied: 0,
    pagesAlreadyCorrect: 0,
    pagesStoodDown: 0,
    failed: [],
    deferred: 0,
  };
  // Carried forward so a partial run does not forget what it already knew.
  const seenFingerprints: Record<string, string> = { ...known };
  let attempted = 0;

  for (const group of ordered) {
    if (now() >= deadline - WORK_RESERVE_MS || attempted >= maxWorks) break;
    result.visited++;
    const fingerprint = fingerprintOf(group, options.workspaceId);
    seenFingerprints[group.name] = fingerprint;
    try {
      const outcome = await syncWork(group, fingerprint, options, result, log);
      if (outcome === "worked") attempted++;
    } catch (error) {
      // A token problem is not this book's fault and will not fix itself.
      if (error instanceof NotionAuthError) throw error;
      const failure = error instanceof WorkFailure ? error : null;
      result.failed.push({
        workId: group.name,
        ...(failure?.notionId ? { notionId: failure.notionId } : {}),
        error: safeMessage(error),
      });
      attempted++;
    }
    // The cursor advances past failures too, so one broken cover cannot starve
    // the rest of the catalog. A lost cursor write only repeats work.
    if (options.apply) {
      await options.store.putCatalog({
        cursor: group.key,
        fingerprints: seenFingerprints,
        snapshotAt: new Date(started).toISOString(),
        result,
      });
    }
  }
  result.deferred = groups.length - result.visited;
  return result;
}

/**
 * One book. An unchanged book costs one cheap store read and does not consume
 * a slot in the run's budget; anything else downloads and renders.
 */
async function syncWork(
  group: CoverGroup,
  fingerprint: string,
  options: PipelineOptions,
  result: PipelineResult,
  log: (line: string) => void,
): Promise<"unchanged" | "worked"> {
  const now = options.now ?? Date.now;
  const store = options.store;
  const source = (await store.getSource(group.name))?.value ?? null;
  const pageIds = group.rows.map((row) => row.notionId);

  const settled = new Set(source?.settled ?? []);
  const everySettled = pageIds.every((id) => settled.has(id));
  if (
    source?.fingerprint === fingerprint &&
    everySettled &&
    now() - source.checkedAt < RECHECK_MS
  ) {
    result.unchanged++;
    return "unchanged";
  }

  if (!group.coverUrl) throw new WorkFailure("missing cover");

  const fetched = await (options.fetchCover ?? fetchCover)(group.coverUrl, {
    attempts: 2,
    timeoutMs: 12_000,
  });
  if (!fetched.ok) throw new WorkFailure("cover download failed");
  const { png } = await (options.render ?? renderCoverEmoji)(fetched.bytes);
  const sha256 = hash(png);
  result.rendered++;

  // Reuse the existing upload when the artwork has not moved. An attached
  // upload is permanent and can be attached again, which is what lets a reread
  // share one upload and what stops a retry creating a duplicate file.
  let uploadId = source?.sha256 === sha256 ? source.uploadId : null;
  let targetIcon = uploadId ? (source?.icon ?? null) : null;

  if (!options.apply) {
    log(
      `${group.name}: would ${uploadId ? "reuse upload" : "upload"} (${png.length} bytes, sha ${sha256.slice(0, 12)})`,
    );
  }

  const nextSettled = new Set<string>();

  for (const notionId of pageIds) {
    const existing = (await store.getPage(notionId))?.value ?? null;

    if (
      existing?.sha256 === sha256 &&
      existing.state === "failed" &&
      existing.attempts >= MAX_PAGE_ATTEMPTS
    ) {
      // Out of attempts at this artwork. Settled so it stops taking a slot;
      // new artwork reopens it.
      nextSettled.add(notionId);
      result.failed.push({
        workId: group.name,
        notionId,
        error: `gave up after ${existing.attempts} attempts`,
      });
      continue;
    }

    const page = await getPage(notionId, options.notion);
    const guard = checkBookPage(page);
    if (!guard.ok) throw new WorkFailure(guard.reason, notionId);

    const current = decodePageIcon(page.icon);
    const owned = existing?.state === "applied" ? existing.owned : null;

    // A crash between the PATCH and its record leaves an intent. Re-attaching
    // the recorded upload is the recovery: the same upload always resolves to
    // the same attachment, so this either confirms what already landed or
    // completes what did not, without a guess about whose icon is showing.
    const recovering =
      existing?.state === "intent" &&
      existing.sha256 === sha256 &&
      existing.uploadId !== null;

    /**
     * If the source record is gone but this page already wears a file icon
     * this automation owns at this very artwork, that icon is the target.
     * Without this the pipeline would upload a fresh copy of every jacket it
     * has already uploaded, which is the duplicate it is supposed to avoid;
     * losing one small S3 object should not cost 320 new files in Notion.
     */
    const adopted =
      targetIcon ??
      (existing?.state === "applied" &&
      existing.sha256 === sha256 &&
      existing.owned?.kind === "file"
        ? existing.owned
        : null);

    const decision = recovering
      ? ({ action: "apply", reason: "automation-owned" } as const)
      : decideIcon(current, adopted, owned);

    if (decision.action === "skip") {
      if (decision.reason === "already-correct") {
        result.pagesAlreadyCorrect++;
        nextSettled.add(notionId);
        // Adopting also repairs the source record for the rest of the run.
        targetIcon ??= adopted;
        uploadId ??= existing?.uploadId ?? null;
        if (options.apply && existing?.sha256 !== sha256) {
          await store.putPage({
            ...baseRecord(existing, notionId, group.name, current),
            state: "applied",
            sha256,
            owned: iconIdentity(current),
            target: targetIcon,
            uploadId,
            attempts: 0,
            at: new Date(now()).toISOString(),
          });
        }
        continue;
      }
      // Somebody's own icon. Settle it so it is not retried every run.
      result.pagesStoodDown++;
      nextSettled.add(notionId);
      log(`${notionId}: stand down (${decision.reason})`);
      if (options.apply) {
        await store.putPage({
          ...baseRecord(existing, notionId, group.name, current),
          state: "manual",
          sha256,
          owned: null,
          target: null,
          uploadId: null,
          attempts: existing?.attempts ?? 0,
          at: new Date(now()).toISOString(),
        });
      }
      continue;
    }

    if (!options.apply) {
      log(`${notionId}: would apply (${decision.reason}, was ${describeIcon(current)})`);
      result.pagesApplied++;
      continue;
    }

    // A recovering page names the upload its intent was about to attach. Reuse
    // it even when the source record is gone too, or the crash would be paid
    // for with a duplicate file. `recovering` already required a matching
    // artwork digest, so this can never attach the wrong jacket.
    if (recovering && !uploadId) uploadId = existing.uploadId;

    // Upload lazily: only once a page is actually going to be changed, so a
    // run that turns out to be a no-op never creates an upload that expires
    // unattached an hour later.
    if (!uploadId) {
      const created = await createFileUpload(
        `${group.name}.png`,
        "image/png",
        options.notion,
      );
      await sendFileUpload(
        created.id,
        png,
        `${group.name}.png`,
        "image/png",
        options.notion,
      );
      uploadId = created.id;
      result.uploaded++;
    }

    const base = baseRecord(existing, notionId, group.name, current);
    // Written before the PATCH. This is the crash window's only witness.
    await store.putPage({
      ...base,
      state: "intent",
      sha256,
      owned: existing?.state === "applied" ? existing.owned : null,
      target: targetIcon,
      uploadId,
      attempts: (existing?.attempts ?? 0) + 1,
      at: new Date(now()).toISOString(),
    });

    try {
      const patched = await setPageFileIcon(notionId, uploadId, options.notion);
      const applied = decodePageIcon(patched.icon);
      const identity = iconIdentity(applied);
      if (!identity) {
        throw new WorkFailure("page icon did not read back as a file", notionId);
      }
      targetIcon = identity;
      await store.putPage({
        ...base,
        state: "applied",
        sha256,
        owned: identity,
        target: identity,
        uploadId,
        attempts: 0,
        at: new Date(now()).toISOString(),
      });
      result.pagesApplied++;
      nextSettled.add(notionId);
      log(`${notionId}: applied ${group.name}`);
    } catch (error) {
      if (error instanceof NotionAuthError) throw error;
      const message = safeMessage(error);
      await store.putPage({
        ...base,
        state: "failed",
        sha256,
        owned: existing?.state === "applied" ? existing.owned : null,
        target: targetIcon,
        uploadId,
        attempts: (existing?.attempts ?? 0) + 1,
        at: new Date(now()).toISOString(),
        error: message,
      });
      result.failed.push({ workId: group.name, notionId, error: message });
    }
  }

  if (options.apply) {
    const next: SourceRecord = {
      workId: group.name,
      fingerprint,
      sha256,
      uploadId,
      icon: targetIcon,
      settled: [...nextSettled].sort(),
      checkedAt: now(),
    };
    await store.putSource(next);
  }
  return "worked";
}

/**
 * The half of a page record that must survive every later write.
 *
 * `originalIcon` is captured the first time this page is seen and never
 * rewritten. Recomputing it from the live icon on a second pass would record
 * the automation's own icon as the thing to restore, which quietly destroys
 * the only route back.
 */
function baseRecord(
  existing: PageRecord | null,
  notionId: string,
  workId: string,
  current: ReturnType<typeof decodePageIcon>,
): Pick<
  PageRecord,
  "notionId" | "workId" | "originalIcon" | "originalIconDescribed"
> {
  if (existing) {
    return {
      notionId,
      workId,
      originalIcon: existing.originalIcon,
      originalIconDescribed: existing.originalIconDescribed,
    };
  }
  return {
    notionId,
    workId,
    originalIcon: current,
    originalIconDescribed: describeIcon(current),
  };
}
