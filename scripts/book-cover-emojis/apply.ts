/**
 * Local driver for the book icon pipeline.
 *
 * The recurring path is the Vercel cron and nothing else. This exists for the
 * two jobs a 300-second serverless function is the wrong shape for: the
 * one-time backfill of a catalog that already exists, and reading back what
 * happened. It calls the same `runPipeline` the cron calls, so a pilot here is
 * evidence about the thing that actually runs rather than about a sibling.
 *
 *   pnpm book-emoji preflight              token, workspace, store, catalog
 *   pnpm book-emoji migrate [--apply]      carry the browser era's receipts over
 *   pnpm book-emoji run [--apply]          dry run unless --apply is given
 *   pnpm book-emoji status                 what the store thinks is done
 *
 * Writes to Notion happen only under `run --apply`.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  type OwnedIcon,
  decodePageIcon,
  describeIcon,
  fileUrlKey,
} from "../../src/lib/bookCoverEmojis/iconPolicy";
import { getPage, whoAmI } from "../../src/lib/bookCoverEmojis/notionApi";
import { BOOK_WORKSPACE_ID } from "../../src/lib/bookCoverEmojis/pageGuard";
import { runPipeline } from "../../src/lib/bookCoverEmojis/pipeline";
import {
  EmojiStore,
  type PageRecord,
} from "../../src/lib/bookCoverEmojis/store";
import { readCatalog, resolveDatabaseUrl } from "./catalog";
import { groupCatalog } from "./grouping";
import { safeMessage } from "./redact";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/** Where the retired local worker kept its receipts. Read, never written. */
const LEGACY_APPLIED = join(
  homedir(),
  "Desktop",
  "Agents",
  "book-cover-emojis",
  "applied.json",
);

function readToken(): string {
  const fromEnv = process.env.NOTION_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(join(homedir(), ".config", "notion", "api_key"), "utf8").trim();
  } catch {
    throw new Error(
      "no Notion token: set NOTION_API_KEY or create ~/.config/notion/api_key",
    );
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function makeStore(): EmojiStore {
  return new EmojiStore({
    bucket: required("AWS_BUCKET_NAME"),
    region: required("AWS_REGION"),
  });
}

/** A flag's value as a positive integer, or undefined. Rejects 0 and -1. */
function intFlag(argv: readonly string[], name: string): number | undefined {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const raw = argv[index + 1];
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} needs a positive integer, got ${raw ?? "nothing"}`);
  }
  return value;
}

function listFlag(argv: readonly string[], name: string): string[] | undefined {
  const values = argv.flatMap((arg, index) =>
    arg === `--${name}` ? [argv[index + 1]] : [],
  );
  const present = values.filter((value): value is string => Boolean(value));
  return present.length > 0 ? present : undefined;
}

async function preflight(): Promise<number> {
  const token = readToken();
  const me = await whoAmI({ token });
  console.log(
    `token: ${me.name ?? "unknown bot"} in ${me.workspace_name ?? "?"} (${me.workspace_id ?? "?"})`,
  );
  if (me.workspace_id !== BOOK_WORKSPACE_ID) {
    console.error(`workspace mismatch: expected ${BOOK_WORKSPACE_ID}`);
    return 3;
  }
  const rows = await readCatalog(resolveDatabaseUrl(REPO_ROOT));
  const groups = groupCatalog(rows);
  console.log(`catalog: ${rows.length} rows, ${groups.length} works`);
  console.log(`covers missing: ${groups.filter((g) => !g.coverUrl).length}`);
  const pages = await makeStore().listPageIds();
  console.log(`store: ${pages.length} page record(s)`);
  console.log("preflight made no writes.");
  return 0;
}

/**
 * Carry the retired browser path's receipts into the store.
 *
 * Those 328 pages wear custom emoji this automation set, and the only proof of
 * that is the local receipt file. Without it every one of them reads as an
 * image icon of unknown provenance, the policy stands down, and the backfill
 * does nothing. The original pre-automation icon comes across too, so the
 * route back survives the change of mechanism.
 *
 * Ownership is confirmed against the live page rather than trusted: the
 * receipt names the emoji it set, and the page has to still be wearing it. The
 * one other accepted shape is a file icon this pipeline already applied, which
 * is what makes the migration safe to re-run after a partial backfill.
 */
async function migrate(apply: boolean): Promise<number> {
  const token = readToken();
  const store = makeStore();
  let legacy: {
    pages: Record<
      string,
      {
        state: string;
        emojiId?: string;
        workId: string;
        sha256: string;
        at?: string;
        previousIcon?: string;
        previousIconRaw?: unknown;
      }
    >;
  };
  try {
    legacy = JSON.parse(readFileSync(LEGACY_APPLIED, "utf8")) as typeof legacy;
  } catch {
    console.error(`no legacy receipts at ${LEGACY_APPLIED}`);
    return 1;
  }

  const entries = Object.entries(legacy.pages);
  const counts = { migrated: 0, present: 0, converted: 0, standDown: 0, skipped: 0 };
  for (const [notionId, record] of entries) {
    if (await store.getPage(notionId)) {
      counts.present++;
      continue;
    }
    if (record.state !== "applied" || !record.emojiId) {
      counts.skipped++;
      continue;
    }
    const live = decodePageIcon((await getPage(notionId, { token })).icon);
    let owned: OwnedIcon | null = null;
    if (live?.type === "custom_emoji" && live.id === record.emojiId) {
      owned = { kind: "custom_emoji", id: record.emojiId };
    } else if (live?.type === "file") {
      // Already converted by this pipeline. The receipt proves the automation
      // owned this page, and the attachment is named after the work, so this
      // reconciles rather than infers.
      const key = fileUrlKey(live.url);
      if (key?.endsWith(`/${record.workId}.png`) && key.includes(BOOK_WORKSPACE_ID)) {
        owned = { kind: "file", urlKey: key };
        counts.converted++;
      }
    }
    if (!owned) {
      counts.standDown++;
      console.log(`${notionId}: live icon ${describeIcon(live)} is not the receipt's; leaving alone`);
      continue;
    }
    const next: PageRecord = {
      notionId,
      workId: record.workId,
      state: "applied",
      sha256: record.sha256,
      owned,
      target: owned,
      uploadId: null,
      originalIcon: "previousIconRaw" in record ? record.previousIconRaw : null,
      originalIconDescribed: record.previousIcon ?? "unknown",
      attempts: 0,
      at: record.at ?? new Date().toISOString(),
    };
    if (apply) await store.putPage(next);
    counts.migrated++;
  }
  console.log(
    `${apply ? "migrated" : "would migrate"} ${counts.migrated} of ${entries.length} receipt(s); ` +
      `${counts.converted} already converted, ${counts.present} already in the store, ` +
      `${counts.standDown} left alone, ${counts.skipped} not applied`,
  );
  if (!apply) console.log("dry run: pass --apply to write.");
  return 0;
}

async function run(argv: readonly string[]): Promise<number> {
  const apply = argv.includes("--apply");
  const limit = intFlag(argv, "limit");
  const only = listFlag(argv, "only");
  const token = readToken();
  const store = makeStore();
  const databaseUrl = resolveDatabaseUrl(REPO_ROOT);

  const result = await runPipeline({
    store,
    notion: { token },
    workspaceId: BOOK_WORKSPACE_ID,
    readCatalog: () => readCatalog(databaseUrl),
    apply,
    maxWorks: limit ?? 1_000,
    budgetMs: intFlag(argv, "budget-ms") ?? 6 * 60 * 60 * 1000,
    ...(only ? { onlyWorkIds: only } : {}),
    log: (line) => console.log(line),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!apply) console.log("dry run: nothing was written. Pass --apply to write.");
  return result.failed.length === 0 ? 0 : 1;
}

async function status(): Promise<number> {
  const store = makeStore();
  const ids = await store.listPageIds();
  const tally: Record<string, number> = {};
  const works = new Set<string>();
  for (const id of ids) {
    const record = (await store.getPage(id))?.value;
    if (!record) continue;
    tally[record.state] = (tally[record.state] ?? 0) + 1;
    works.add(record.workId);
  }
  console.log(
    JSON.stringify(
      { pages: ids.length, works: works.size, byState: tally },
      null,
      2,
    ),
  );
  return 0;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? "run";
  switch (command) {
    case "preflight":
      return preflight();
    case "migrate":
      return migrate(argv.includes("--apply"));
    case "run":
      return run(argv);
    case "status":
      return status();
    default:
      console.error(`unknown command: ${command}`);
      console.error("usage: preflight | migrate | run | status");
      return 2;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(safeMessage(error));
    process.exitCode = 1;
  });
