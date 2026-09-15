/**
 * Local state root, per the spec: ~/Desktop/Agents/book-cover-emojis/.
 *
 * Holds the singleton lock, a content-addressed asset cache, logs, and the
 * index of what the automation last applied to each page. That index is what
 * lets a later run tell its own work from an icon somebody changed by hand.
 *
 * It is a local file rather than an S3 object because the worker is
 * single-machine by construction: it needs a browser session that exists on
 * one Mac. Receipts still go to S3, so the durable record of what happened
 * does not depend on this directory surviving.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const STATE_ROOT = join(homedir(), "Desktop", "Agents", "book-cover-emojis");

export const paths = {
  root: STATE_ROOT,
  lock: join(STATE_ROOT, "worker.lock"),
  assets: join(STATE_ROOT, "cache", "assets"),
  logs: join(STATE_ROOT, "logs"),
  applied: join(STATE_ROOT, "applied.json"),
  receipts: join(STATE_ROOT, "receipts"),
};

export type AppliedRecord = {
  /**
   * "applied" means this page carries our emoji. "manual" means a person owns
   * the icon and we stood down. Recording the artifact fingerprint against
   * either one is what stops a skipped page being retried on every run: the
   * page is settled for this artwork, and only new artwork reopens it.
   */
  /**
   * "intent" is written before the Notion PATCH and carries the original
   * icon. It is the crash window's only witness: if the process dies between
   * the PATCH and the record, the next run finds the intent, compares the live
   * icon, and either finalizes it or re-applies, without ever mistaking the
   * icon it just set for the original.
   */
  state: "intent" | "applied" | "manual" | "failed";
  emojiId: string;
  emojiName: string;
  workId: string;
  /** Artifact fingerprint. Revision numbers repeat across different books. */
  sha256: string;
  revision: number;
  at: string;
  /** What the icon was before the automation first touched this page. */
  previousIcon: string;
  /** The original icon JSON, kept verbatim so the change can be undone. */
  previousIconRaw?: unknown;
  /** Intent only: the emoji the PATCH was about to set. */
  targetEmojiId?: string;
  /** Failures only: how many runs have tried this page at this artwork. */
  attempts?: number;
  /** Failures only: the last reason, already redacted. */
  error?: string;
};

/**
 * How many runs may try one page before it stops taking a slot in the batch.
 * A page that fails forever would otherwise be picked first on every run and
 * never let the rest of the catalog through.
 */
export const MAX_PAGE_ATTEMPTS = 3;

export type AppliedIndex = {
  schemaVersion: number;
  /** Keyed by Notion page id. */
  pages: Record<string, AppliedRecord>;
};

const EMPTY: AppliedIndex = { schemaVersion: 1, pages: {} };

export function ensureDirs(): void {
  for (const dir of [paths.root, paths.assets, paths.logs, paths.receipts]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function readApplied(): AppliedIndex {
  try {
    return JSON.parse(readFileSync(paths.applied, "utf8")) as AppliedIndex;
  } catch {
    return { ...EMPTY, pages: {} };
  }
}

export function writeApplied(index: AppliedIndex): void {
  ensureDirs();
  const temp = `${paths.applied}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(index, null, 2)}\n`);
  renameSync(temp, paths.applied);
}

export const assetCachePath = (sha256: string) => join(paths.assets, `${sha256}.png`);

/** The integration token, from the environment or the operator's config file. */
export function readNotionToken(): string {
  const fromEnv = process.env.NOTION_API_KEY;
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(join(homedir(), ".config", "notion", "api_key"), "utf8").trim();
  } catch {
    throw new Error(
      "no Notion token: set NOTION_API_KEY or create ~/.config/notion/api_key",
    );
  }
}
