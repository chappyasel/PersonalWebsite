#!/usr/bin/env tsx
/**
 * Local worker: register real Notion custom emoji, then apply them by id.
 *
 *   pnpm book-emoji-worker preflight
 *   pnpm book-emoji-worker status
 *   pnpm book-emoji-worker once --limit 2            # dry run, no writes
 *   pnpm book-emoji-worker once --limit 2 --apply    # the real thing
 *
 * Dry run is the default and covers everything: no browser is launched, no
 * Notion request is sent, no receipt is written. Nothing external happens
 * without --apply.
 *
 * The order per book matters. The emoji is registered in the browser, then
 * confirmed through the API before anything else happens, because the API is
 * bound to the pinned workspace and so will not see an emoji that landed in
 * the wrong one. Only after that do page icons move, and each page is read
 * back to prove the icon stuck.
 */
import { EmojiStore } from "../../../src/lib/bookCoverEmojis/store";
import { decideIcon, decodePageIcon, describeIcon } from "../../../src/lib/bookCoverEmojis/iconPolicy";
import { checkBookPage } from "../../../src/lib/bookCoverEmojis/pageGuard";
import {
  type CustomEmoji,
  type EmojiApiOptions,
  NotionAuthError,
  getPage,
  listCustomEmojis,
  setPageCustomEmoji,
  whoAmI,
} from "../../../src/lib/bookCoverEmojis/notionEmojiApi";
import type { WorkHead, WorkRevision } from "../../../src/lib/bookCoverEmojis/work";
import { DEFAULT_MAX_NAME_LENGTH as MAX_EMOJI_NAME_LENGTH } from "../../../src/lib/bookCoverEmojis/emojiNames";
import { positiveInt, flagValue as readFlag } from "../cli";
import { safeMessage } from "../redact";
import { BrowserSessionError, BrowserSetupError, NotionLoginRequired, WorkspaceMismatch, closeSession, ensureEmojiPanel, openEmojiSettings, openSession, uploadEmoji, withWatchdog, type Session } from "./browser";
import { COOKIE_QUERY, arcCookieKey, shapeCookies, type CookieRow } from "./cookies";
import { EmojiImageMismatch, ensureEmoji } from "./ensureEmoji";
import { fetchImage, imagesMatch } from "./imageMatch";
import { exhaustedPages, outstandingPages } from "./pending";
import { Lock, LockHeldError } from "./lock";
import {
  type AppliedIndex,
  MAX_PAGE_ATTEMPTS,
  assetCachePath,
  ensureDirs,
  paths,
  readApplied,
  readNotionToken,
  writeApplied,
} from "./state";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

/** Pinned by the coordinator. Never inferred from whichever workspace opens. */
export const WORKSPACE_ID = "859fbc85-7644-4498-88d8-e0229d8cea32";
export const WORKSPACE_NAME = "Personal";

const argv = process.argv.slice(2);
const flag = (name: string) => readFlag(argv, name);
const options = {
  apply: argv.includes("--apply"),
  limit: positiveInt(flag("limit"), 1, "limit"),
  bucket: process.env.AWS_BUCKET_NAME ?? "",
  region: process.env.AWS_REGION ?? "us-east-1",
};

const log = (message: string) => console.log(safeMessage(message));

function api(): EmojiApiOptions {
  return { token: readNotionToken() };
}

function store(): EmojiStore {
  if (!options.bucket) throw new Error("AWS_BUCKET_NAME is not set");
  return new EmojiStore({ bucket: options.bucket, region: options.region });
}

/** Confirm the token really is the pinned workspace before anything else. */
async function assertPinnedWorkspace(): Promise<void> {
  const me = await whoAmI(api());
  if (me.workspace_id !== WORKSPACE_ID) {
    throw new Error(
      `token belongs to workspace ${me.workspace_id ?? "unknown"}, expected the pinned ${WORKSPACE_ID}`,
    );
  }
  log(`workspace verified: ${me.workspace_name ?? "?"} (${WORKSPACE_ID})`);
}

async function loadPending(
  s3: EmojiStore,
  applied: AppliedIndex,
  limit: number,
): Promise<Array<{ head: WorkHead; revision: WorkRevision }>> {
  const workIds = await s3.listWorkIds();
  const pending: Array<{ head: WorkHead; revision: WorkRevision }> = [];
  for (const workId of workIds) {
    if (pending.length >= limit) break;
    const head = await s3.getHead(workId);
    if (!head) continue;
    const revision = await s3.getRevision(workId, head.value.revision);
    if (!revision) continue;
    const outstanding =
      outstandingPages(revision.value.pages, applied.pages, {
        workId: revision.value.workId,
        sha256: revision.value.sha256,
        emojiName: revision.value.emojiName,
      }).length > 0;
    if (outstanding) pending.push({ head: head.value, revision: revision.value });
  }
  return pending;
}

async function ensureAsset(s3: EmojiStore, revision: WorkRevision): Promise<string> {
  const path = assetCachePath(revision.sha256);
  if (existsSync(path)) {
    const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (digest === revision.sha256) return path;
  }
  const bytes = await s3.getBytes(revision.assetKey);
  if (!bytes) throw new Error(`asset missing in S3: ${revision.assetKey}`);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== revision.sha256) {
    throw new Error(`asset digest mismatch for ${revision.workId}`);
  }
  ensureDirs();
  writeFileSync(path, bytes);
  return path;
}

async function ensureEmojiForRevision(
  revision: WorkRevision,
  library: Map<string, CustomEmoji>,
  session: () => Promise<Session>,
  assetPath: string,
  onUploaded: () => void = () => undefined,
): Promise<CustomEmoji> {
  const result = await ensureEmoji(revision.emojiName, assetPath, {
    library,
    expectedBytes: readFileSync(assetPath),
    fetchImage,
    imagesMatch: (expected, actual) => imagesMatch(expected, actual),
    refresh: () => listCustomEmojis(api()),
    upload: async (name, path) => {
      const page = (await session()).page;
      const panel = await ensureEmojiPanel(page, WORKSPACE_ID);
      if (panel === "reopened") log("  re-opened the emoji panel");
      await uploadEmoji(page, name, path);
      onUploaded();
    },
  });
  log(`  emoji ${revision.emojiName} ${result.source} (${result.emoji.id})`);
  return result.emoji;
}

async function processWork(
  entry: { head: WorkHead; revision: WorkRevision },
  s3: EmojiStore,
  library: Map<string, CustomEmoji>,
  session: () => Promise<Session>,
  applied: AppliedIndex,
  onUploaded: () => void = () => undefined,
): Promise<{ applied: number; skipped: number; failed: number }> {
  const { revision } = entry;
  log(`${revision.workId} rev ${revision.revision} (${revision.pages.length} page(s))`);
  // Fail fast rather than hanging on a Save button Notion will never enable.
  if (revision.emojiName.length > MAX_EMOJI_NAME_LENGTH) {
    throw new Error(
      `${revision.workId}: emoji name "${revision.emojiName}" is ${revision.emojiName.length} characters; Notion accepts at most ${MAX_EMOJI_NAME_LENGTH}. Re-run the producer so the job carries a corrected name.`,
    );
  }
  // Check the head before registering anything. An obsolete job would
  // otherwise create an emoji in the workspace before the per-page check
  // noticed the producer had moved on, leaving a stray emoji behind.
  const headBefore = await s3.getHead(revision.workId);
  if (headBefore && headBefore.value.revision !== revision.revision) {
    log(
      `  skipping ${revision.workId}: head already moved to revision ${headBefore.value.revision}`,
    );
    return { applied: 0, skipped: revision.pages.length, failed: 0 };
  }

  const assetPath = await ensureAsset(s3, revision);
  const emoji = await ensureEmojiForRevision(
    revision,
    library,
    session,
    assetPath,
    onUploaded,
  );

  let appliedCount = 0;
  let skipped = 0;
  let failed = 0;
  const outcomes: unknown[] = [];

  for (const target of revision.pages) {
    try {
      // The queue can move while a batch runs. Applying a job the producer has
      // already superseded would put last week's jacket on a page.
      const currentHead = await s3.getHead(revision.workId);
      if (currentHead && currentHead.value.revision !== revision.revision) {
        log(
          `  stopping ${revision.workId}: head moved to revision ${currentHead.value.revision}`,
        );
        break;
      }

      const before = await getPage(target.notionId, api());
      const guard = checkBookPage(before);
      if (!guard.ok) {
        skipped += 1;
        // Terminal: a page that is not a book row, or is trashed, will not
        // become one on the next run. Record it as spent so it stops taking a
        // slot, and let status surface it.
        applied.pages[target.notionId] = {
          state: "failed",
          emojiId: "",
          emojiName: revision.emojiName,
          workId: revision.workId,
          sha256: revision.sha256,
          revision: revision.revision,
          at: new Date().toISOString(),
          previousIcon: "unknown",
          attempts: MAX_PAGE_ATTEMPTS,
          error: guard.reason,
        };
        writeApplied(applied);
        log(`  skip ${target.notionId}: ${guard.reason}`);
        outcomes.push({ page: target.notionId, skipped: guard.reason });
        continue;
      }

      const current = decodePageIcon(before.icon);
      const record = applied.pages[target.notionId] ?? null;

      // Replay an unfinished intent against the live icon before doing
      // anything else. This is the only way to tell "the PATCH landed and we
      // died" from "the PATCH never happened", and it keeps the original icon
      // the intent recorded rather than reading back what we just set.
      if (record?.state === "intent") {
        if (current?.type === "custom_emoji" && current.id === record.targetEmojiId) {
          applied.pages[target.notionId] = {
            ...record,
            state: "applied",
            emojiId: record.targetEmojiId,
            at: new Date().toISOString(),
          };
          writeApplied(applied);
          appliedCount += 1;
          log(`  finalized ${target.notionId}: the interrupted write had landed`);
          outcomes.push({ page: target.notionId, recovered: "intent-landed" });
          continue;
        }
        log(`  replaying ${target.notionId}: the interrupted write never landed`);
      }

      // Ownership comes only from a page we actually applied. A failed or
      // guard-skipped record carries an empty emojiId, and `?? null` let that
      // empty string through, so one transient failure made a page look
      // manually changed and it was never retried again.
      const ownedEmojiId =
        record?.state === "applied" && record.emojiId ? record.emojiId : null;
      const decision =
        record?.state === "intent"
          ? ({ action: "apply", reason: "automation-owned" } as const)
          : decideIcon(current, emoji.id, ownedEmojiId);

      if (decision.action === "skip") {
        skipped += 1;
        // Record the stand-down against this artwork, so the page is settled
        // rather than retried on every run from here to the end of time.
        applied.pages[target.notionId] = {
          state: decision.reason === "already-correct" ? "applied" : "manual",
          emojiId: decision.reason === "already-correct" ? emoji.id : (ownedEmojiId ?? ""),
          emojiName: emoji.name,
          workId: revision.workId,
          sha256: revision.sha256,
          revision: revision.revision,
          at: new Date().toISOString(),
          previousIcon: record ? record.previousIcon : describeIcon(current),
          previousIconRaw: record ? record.previousIconRaw : before.icon,
        };
        writeApplied(applied);
        log(`  skip ${target.notionId}: ${decision.reason}`);
        outcomes.push({ page: target.notionId, decision, previous: describeIcon(current) });
        continue;
      }

      // Journal the original and the target before touching Notion, so a
      // crash in the next few milliseconds is recoverable.
      const originalIcon = record ? record.previousIcon : describeIcon(current);
      const originalIconRaw = record ? record.previousIconRaw : before.icon;
      applied.pages[target.notionId] = {
        state: "intent",
        emojiId: ownedEmojiId ?? "",
        targetEmojiId: emoji.id,
        emojiName: emoji.name,
        workId: revision.workId,
        sha256: revision.sha256,
        revision: revision.revision,
        at: new Date().toISOString(),
        previousIcon: originalIcon,
        previousIconRaw: originalIconRaw,
      };
      writeApplied(applied);

      await setPageCustomEmoji(target.notionId, emoji.id, api());
      const after = await getPage(target.notionId, api());
      const readback = decodePageIcon(after.icon);
      if (!(readback?.type === "custom_emoji" && readback.id === emoji.id)) {
        throw new Error("readback did not show the new custom emoji");
      }

      applied.pages[target.notionId] = {
        state: "applied",
        emojiId: emoji.id,
        emojiName: emoji.name,
        workId: revision.workId,
        sha256: revision.sha256,
        revision: revision.revision,
        at: new Date().toISOString(),
        // Straight from the intent, never re-derived from the page we just
        // changed. 327 of the 328 pages had no icon, so the original is
        // legitimately null and must survive as null.
        previousIcon: originalIcon,
        previousIconRaw: originalIconRaw,
      };
      writeApplied(applied);
      appliedCount += 1;
      log(`  set ${target.notionId} (${decision.reason}, was ${describeIcon(current)})`);
      outcomes.push({
        page: target.notionId,
        decision,
        previous: describeIcon(current),
        previousRaw: before.icon,
        emojiId: emoji.id,
      });
    } catch (error) {
      if (error instanceof NotionAuthError || error instanceof EmojiImageMismatch) throw error;
      failed += 1;
      const reason = safeMessage(error);
      // Count the attempt against this page and artwork, so a page that can
      // never succeed stops taking a slot in every future batch.
      const prior = applied.pages[target.notionId];
      const attempts =
        prior?.state === "failed" &&
        prior.workId === revision.workId &&
        prior.sha256 === revision.sha256
          ? (prior.attempts ?? 0) + 1
          : 1;
      applied.pages[target.notionId] = {
        state: "failed",
        emojiId: prior?.emojiId ?? "",
        emojiName: revision.emojiName,
        workId: revision.workId,
        sha256: revision.sha256,
        revision: revision.revision,
        at: new Date().toISOString(),
        previousIcon: prior?.previousIcon ?? "unknown",
        previousIconRaw: prior?.previousIconRaw,
        attempts,
        error: reason,
      };
      writeApplied(applied);
      log(`  ! ${target.notionId}: ${reason} (attempt ${attempts}/${MAX_PAGE_ATTEMPTS})`);
      outcomes.push({ page: target.notionId, error: reason, attempts });
    }
  }

  // Receipts are create-only, so an attempt number keeps a retry honest.
  for (let attempt = 1; attempt <= 50; attempt++) {
    const result = await s3.putReceipt(revision.workId, revision.revision, attempt, {
      workId: revision.workId,
      revision: revision.revision,
      emoji: { id: emoji.id, name: emoji.name },
      workspaceId: WORKSPACE_ID,
      at: new Date().toISOString(),
      outcomes,
    });
    if (result === "written") break;
  }

  return { applied: appliedCount, skipped, failed };
}


/**
 * Count a work-item failure against every page it covers, so the bounded
 * retry that protects individual pages protects whole books too.
 */
function recordWorkFailure(
  applied: AppliedIndex,
  revision: WorkRevision,
  reason: string,
): number {
  for (const page of revision.pages) {
    const prior = applied.pages[page.notionId];
    // An applied or intent record must not be downgraded by a later failure.
    if (prior?.state === "applied" || prior?.state === "intent") continue;
    const attempts =
      prior?.state === "failed" &&
      prior.workId === revision.workId &&
      prior.sha256 === revision.sha256
        ? (prior.attempts ?? 0) + 1
        : 1;
    applied.pages[page.notionId] = {
      state: "failed",
      emojiId: prior?.emojiId ?? "",
      emojiName: revision.emojiName,
      workId: revision.workId,
      sha256: revision.sha256,
      revision: revision.revision,
      at: new Date().toISOString(),
      previousIcon: prior?.previousIcon ?? "unknown",
      previousIconRaw: prior?.previousIconRaw,
      attempts,
      error: reason,
    };
  }
  writeApplied(applied);
  return revision.pages.length;
}

async function commandOnce(): Promise<void> {
  ensureDirs();
  const s3 = store();
  const applied = readApplied();
  const pending = await loadPending(s3, applied, options.limit);

  log(`worker once: ${pending.length} work item(s), limit ${options.limit}`);
  if (pending.length === 0) {
    log("queue empty, nothing to do.");
    return;
  }

  if (!options.apply) {
    for (const entry of pending) {
      log(
        `  would register ${entry.revision.emojiName} and set ${entry.revision.pages.length} page icon(s)`,
      );
      for (const page of entry.revision.pages) log(`    page ${page.notionId}`);
    }
    log("dry run: no browser launched, no Notion request sent, no receipt written.");
    return;
  }

  await assertPinnedWorkspace();
  const library = await listCustomEmojis(api());
  log(`workspace library has ${library.size} custom emoji`);

  /**
   * How many emoji one browser registers before it is replaced.
   *
   * Chromium's renderer grows steadily through this work: measured at 9.2 GB
   * resident and 101.8% CPU after 35 uploads, at which point it stopped making
   * progress entirely. Recycling happens inside the loop rather than by
   * re-running the command, so the S3 scan that picks the work is not repeated
   * every five books.
   */
  const UPLOADS_PER_SESSION = 5;
  /** Whole-book deadline, generous enough for five bounded browser steps. */
  const BOOK_BUDGET_MS = 300_000;
  /** Fresh browsers failing this many times running means stop, not retry. */
  const MAX_CONSECUTIVE_SESSION_FAULTS = 3;

  let session: Session | null = null;
  let uploadsThisSession = 0;
  let consecutiveSessionFaults = 0;

  const recycleIfSpent = async (): Promise<void> => {
    if (!session || uploadsThisSession < UPLOADS_PER_SESSION) return;
    log(`  recycling the browser after ${uploadsThisSession} uploads`);
    await closeSession(session);
    session = null;
    uploadsThisSession = 0;
  };

  const getSession = async (): Promise<Session> => {
    if (session) return session;
    // Build into a local first. Assigning before setup finished meant a
    // browser that never reached the emoji settings was cached and handed to
    // every later book, which then timed out waiting for "Add emoji". One
    // failed setup poisoned the whole batch.
    const opened = await openSession(shapeCookies(loadCookieRows(), arcCookieKey()));
    try {
      const { space, route } = await openEmojiSettings(opened.page, WORKSPACE_ID);
      log(`headless session open in ${space.name} (${space.id}) via ${route}`);
    } catch (error) {
      await closeSession(opened);
      throw error instanceof BrowserSetupError ||
        error instanceof NotionLoginRequired ||
        error instanceof WorkspaceMismatch
        ? error
        : new BrowserSetupError(safeMessage(error), { cause: error });
    }
    session = opened;
    return session;
  };

  const totals = { applied: 0, skipped: 0, failed: 0 };
  try {
    for (const entry of pending) {
      try {
        // Recycle before the work item, never in the middle of one.
        await recycleIfSpent();
        const startedBook = Date.now();
        // Backstop. Every browser call is bounded individually, but a book is
        // also bounded as a whole so no combination of them can stall the run
        // silently again.
        const result = await withWatchdog(
          processWork(entry, s3, library, getSession, applied, () => {
            uploadsThisSession += 1;
          }),
          BOOK_BUDGET_MS,
          `${entry.revision.workId} as a whole`,
        );
        totals.applied += result.applied;
        totals.skipped += result.skipped;
        totals.failed += result.failed;
        consecutiveSessionFaults = 0;
        log(`  (${((Date.now() - startedBook) / 1000).toFixed(1)}s)`);
      } catch (error) {
        // A download, render, or registration that fails takes down one book,
        // not the batch. Without this, the sorted queue put the same broken
        // work first on every run and nothing behind it ever ran. Credentials
        // and workspace problems still stop everything, because continuing
        // past those would just repeat the same failure 300 more times.
        if (
          error instanceof NotionAuthError ||
          error instanceof NotionLoginRequired ||
          error instanceof WorkspaceMismatch
        ) {
          // Credentials and workspace are not going to fix themselves.
          throw error;
        }
        if (error instanceof BrowserSessionError) {
          // The browser is the problem, not the book. Throw the session away
          // so nothing downstream inherits it, charge this one book, and carry
          // on with a fresh browser. Marking every remaining book failed was
          // the old behaviour and it burned the catalog's retry budget; giving
          // up entirely would mean one wedged renderer ends a two-hour run.
          consecutiveSessionFaults += 1;
          if (session) {
            await closeSession(session);
            session = null;
            uploadsThisSession = 0;
          }
          log(
            `  ! ${entry.revision.workId}: browser fault (${consecutiveSessionFaults} in a row) ${safeMessage(error)}`,
          );
          totals.failed += recordWorkFailure(applied, entry.revision, safeMessage(error));
          if (consecutiveSessionFaults >= MAX_CONSECUTIVE_SESSION_FAULTS) {
            // Three fresh browsers in a row failing is not bad luck.
            throw error;
          }
          continue;
        }
        const reason = safeMessage(error);
        totals.failed += recordWorkFailure(applied, entry.revision, reason);
        log(`  ! ${entry.revision.workId}: ${reason}`);
      }
    }
  } catch (error) {
    if (session && error instanceof BrowserSessionError) {
      // Diagnostics were already captured at the point of failure; this just
      // makes sure the poisoned session cannot be handed to anything else.
      await closeSession(session);
      session = null;
    }
    throw error;
  } finally {
    if (session) await closeSession(session);
  }
  log(
    `batch done: ${totals.applied} icon(s) set, ${totals.skipped} skipped, ${totals.failed} failed`,
  );
  if (totals.failed > 0) {
    // A batch that failed pages must not look like a clean run to launchd or
    // to whoever reads the exit status.
    process.exitCode = 5;
  }
}

/**
 * Read Arc's cookie database through a snapshot copy.
 *
 * Arc keeps the database open, and a live read can hit a lock or a partially
 * written WAL. Copying first is cheap and removes the whole class of problem.
 * The copy is deleted before this returns, and no cookie value is ever logged
 * or written anywhere.
 */
function loadCookieRows(): CookieRow[] {
  const source = join(
    homedir(),
    "Library",
    "Application Support",
    "Arc",
    "User Data",
    "Default",
    "Cookies",
  );
  const snapshot = join(tmpdir(), `book-emoji-cookies-${process.pid}.sqlite`);
  copyFileSync(source, snapshot);
  try {
    const db = new DatabaseSync(snapshot, { readOnly: true });
    try {
      const statement = db.prepare(COOKIE_QUERY);
      // Chromium's expires_utc exceeds Number.MAX_SAFE_INTEGER.
      statement.setReadBigInts(true);
      return statement.all() as unknown as CookieRow[];
    } finally {
      db.close();
    }
  } finally {
    rmSync(snapshot, { force: true });
  }
}

async function commandStatus(): Promise<void> {
  const s3 = store();
  const applied = readApplied();
  const workIds = await s3.listWorkIds();
  let pages = 0;
  let current = 0;
  for (const workId of workIds) {
    const head = await s3.getHead(workId);
    if (!head) continue;
    const revision = await s3.getRevision(workId, head.value.revision);
    if (!revision) continue;
    for (const page of revision.value.pages) {
      pages += 1;
      const record = applied.pages[page.notionId];
      // Revision numbers restart per work item, so matching one proves
      // nothing. Only a record that actually applied this work's current
      // emoji counts as current.
      if (
        record?.state === "applied" &&
        record.workId === revision.value.workId &&
        record.sha256 === revision.value.sha256 &&
        record.emojiName === revision.value.emojiName
      ) {
        current += 1;
      }
    }
  }
  log(`work items: ${workIds.length}`);
  log(`pages: ${current} of ${pages} carrying the current revision`);
  const exhausted = exhaustedPages(applied.pages);
  if (exhausted.length > 0) {
    log(`pages that gave up after ${MAX_PAGE_ATTEMPTS} attempts: ${exhausted.length}`);
    for (const item of exhausted.slice(0, 10)) {
      log(`  ! ${item.notionId} (${item.record.workId}): ${item.record.error ?? "unknown"}`);
    }
    process.exitCode = 5;
  }
  log(`state root: ${paths.root}`);
}

async function commandPreflight(): Promise<void> {
  ensureDirs();
  log(`state root ready: ${paths.root}`);
  await assertPinnedWorkspace();
  const library = await listCustomEmojis(api());
  log(`custom emoji library readable: ${library.size} emoji`);
  log(
    `names already starting with "book-": ${[...library.keys()].filter((name) => name.startsWith("book-")).length}`,
  );
  const s3 = store();
  const workIds = await s3.listWorkIds();
  log(`S3 reachable: ${workIds.length} work item(s) under the prefix`);
  try {
    const rows = loadCookieRows();
    const cookies = shapeCookies(rows, arcCookieKey());
    log(`Arc cookie bridge: ${cookies.length} Notion cookie(s) available`);
  } catch (error) {
    log(`Arc cookie bridge unavailable: ${safeMessage(error)}`);
  }
  log("preflight made no writes.");
}

/**
 * Open the real headless session and prove which workspace it is in. Reads
 * only: it opens settings and observes, and uploads nothing.
 */
async function commandInspect(): Promise<void> {
  ensureDirs();
  await assertPinnedWorkspace();
  const rows = loadCookieRows();
  const cookies = shapeCookies(rows, arcCookieKey());
  log(`cookie bridge: ${cookies.length} Notion cookie(s)`);
  const hosts = [...new Set(cookies.map((cookie) => cookie.domain))].sort();
  log(`cookie hosts: ${hosts.join(", ")}`);

  const session = await openSession(cookies);
  try {
    const { space, route } = await openEmojiSettings(session.page, WORKSPACE_ID);
    log(`workspace confirmed: ${space.name} (${space.id})`);
    log(`emoji settings reached via ${route}`);
    const count = await session.page
      .getByRole("button", { name: "Add emoji", exact: true })
      .count();
    log(`"Add emoji" control present: ${count > 0 ? "yes" : "no"}`);
  } finally {
    await closeSession(session);
  }
  log("inspect made no writes.");
}

async function main(): Promise<void> {
  const positional: string[] = [];
  for (const token of argv) {
    if (token.startsWith("--")) break;
    positional.push(token);
  }
  const command = positional[0];
  const lock = new Lock(paths.lock);

  switch (command) {
    case "preflight":
      return commandPreflight();
    case "inspect":
      return commandInspect();
    case "status":
      return commandStatus();
    case "once":
      // Only the mutating path contends for the browser session.
      return options.apply ? lock.withLock(commandOnce) : commandOnce();
    default:
      throw new Error(
        "usage: worker <preflight|inspect|status|once> [--limit N] [--apply]",
      );
  }
}

main().catch((error) => {
  if (error instanceof LockHeldError) {
    console.error(safeMessage(error.message));
    process.exit(2);
  }
  if (
    error instanceof NotionLoginRequired ||
    error instanceof WorkspaceMismatch ||
    error instanceof BrowserSessionError
  ) {
    console.error(`stopped: ${safeMessage(error.message)}`);
    process.exit(3);
  }
  if (error instanceof NotionAuthError) {
    console.error(`stopped: ${safeMessage(error.message)}`);
    process.exit(4);
  }
  console.error(safeMessage(error));
  process.exit(1);
});
