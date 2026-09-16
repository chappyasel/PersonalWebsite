#!/usr/bin/env tsx
/**
 * Generate one reusable emoji asset per book from the covers the site already
 * stores, plus a manifest an upload step can read later.
 *
 *   pnpm generate:book-cover-emojis                 # render everything missing
 *   pnpm generate:book-cover-emojis --dry-run       # plan only, write nothing
 *   pnpm generate:book-cover-emojis --force         # refetch and re-render all
 *   pnpm generate:book-cover-emojis --limit 12      # smoke test
 *   pnpm generate:book-cover-emojis --out DIR       # somewhere else
 *
 * Reads Postgres read-only. Writes nothing to Notion, nothing to the
 * database, and nothing inside the repository: assets land in
 * ~/Desktop/Agents/research/book-cover-emojis by default.
 *
 * A --limit run writes to <out>/subsets/limit-N/ rather than <out>, so a
 * slice can never overwrite the full catalog's manifest, and its manifest
 * carries complete:false with a subset field naming the slice.
 *
 * Reruns are cheap: an asset whose cover URL has not moved and whose file on
 * disk still hashes to the manifest's digest keeps its PNG. Every other field
 * on that entry is refreshed from the current catalog, so a reused asset
 * never reports a stale cover row, publication year, color, or reread set.
 */
import { readCatalog, resolveDatabaseUrl } from "./catalog";
import { flagValue as cliFlagValue, positiveInt, resolveOutDir } from "./cli";
import { fetchCover } from "./fetch";
import { NAME_PREFIX, type CoverGroup, groupCatalog, slugify } from "./grouping";
import {
  type AssetEntry,
  COVERAGE_CAVEAT,
  MANIFEST_FILENAME,
  MANIFEST_SCHEMA_VERSION,
  type Manifest,
  assetIndex,
  buildRowEntries,
  countManifest,
  planWork,
  refreshReusedAsset,
} from "./manifest";
import { catalogHtml, pickContactSheetAssets, renderContactSheet } from "./preview";
import { EMOJI_SIZE, renderCoverEmoji } from "./render";
import { enhanceCoverUrl } from "../../src/lib/books/coverUtils";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_OUT = join(
  homedir(),
  "Desktop",
  "Agents",
  "research",
  "book-cover-emojis",
);

const argv = process.argv.slice(2);
const flagValue = (name: string) => cliFlagValue(argv, name);

const options = {
  out: flagValue("out") ?? DEFAULT_OUT,
  force: argv.includes("--force"),
  dryRun: argv.includes("--dry-run"),
  noPreview: argv.includes("--no-preview"),
  limit: positiveInt(flagValue("limit"), 0, "limit"),
  concurrency: positiveInt(flagValue("concurrency"), 6, "concurrency"),
  timeoutMs: positiveInt(flagValue("timeout"), 15_000, "timeout"),
};

/** How often a mid-batch snapshot lands. Twenty covers is a few seconds of
 * work, small enough that an interruption costs little and large enough that
 * the manifest is not rewritten on every image. */
const CHECKPOINT_EVERY = 20;

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Write through a sibling temp file so a manifest is never half-written. */
function writeAtomic(path: string, contents: string | Buffer): void {
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, contents);
  renameSync(temp, path);
}

function digestOnDisk(emojiDir: string) {
  return (name: string): string | null => {
    try {
      return sha256(readFileSync(join(emojiDir, `${name}.png`)));
    } catch {
      return null;
    }
  };
}

function missingCoverAsset(group: CoverGroup): AssetEntry {
  return {
    name: group.name,
    file: null,
    status: "missing-cover",
    title: group.title,
    author: group.author,
    publicationYear: group.publicationYear,
    coverUrl: null,
    coverRowId: null,
    coverColor: group.coverColor,
    sourceRowIds: group.rows.map((row) => row.id),
    notionIds: group.rows.map((row) => row.notionId),
    readings: group.rows.length,
    error: "no cover_url on any row of this group",
  };
}

/** Fetch, render, write. Returns the manifest entry either way. */
async function renderGroup(
  group: CoverGroup,
  emojiDir: string,
): Promise<AssetEntry> {
  const base: AssetEntry = {
    name: group.name,
    file: null,
    status: "success",
    title: group.title,
    author: group.author,
    publicationYear: group.publicationYear,
    coverUrl: group.coverUrl,
    coverRowId: group.coverRowId,
    coverColor: group.coverColor,
    sourceRowIds: group.rows.map((row) => row.id),
    notionIds: group.rows.map((row) => row.notionId),
    readings: group.rows.length,
  };

  // Ask Google Books for the clean high-resolution art the shelf renders,
  // rather than the stored thumbnail URL.
  const url = enhanceCoverUrl(group.coverUrl) ?? group.coverUrl!;
  const fetched = await fetchCover(url, { timeoutMs: options.timeoutMs });
  if (!fetched.ok) {
    return { ...base, status: "fetch-failed", error: fetched.reason };
  }

  try {
    const rendered = await renderCoverEmoji(fetched.bytes, EMOJI_SIZE);
    const file = `${group.name}.png`;
    writeFileSync(join(emojiDir, file), rendered.png);
    return {
      ...base,
      file: `emoji/${file}`,
      png: {
        width: EMOJI_SIZE,
        height: EMOJI_SIZE,
        bytes: rendered.png.length,
        sha256: sha256(rendered.png),
        art: rendered.art,
        source: rendered.source,
      },
    };
  } catch (error) {
    return {
      ...base,
      status: "render-failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runPool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
}

async function main() {
  // A --limit run renders a slice, so it gets its own directory. Writing a
  // slice into the full output would overwrite the manifest that the whole
  // catalog depends on for resume, and every asset it did not cover would
  // look like it had never been rendered.
  const outDir = resolveOutDir(options.out, options.limit);
  const emojiDir = join(outDir, "emoji");
  const previewDir = join(outDir, "preview");

  console.log("Reading the book mirror (read-only)...");
  const rows = await readCatalog(resolveDatabaseUrl(REPO_ROOT));
  const allGroups = groupCatalog(rows);
  const groups = options.limit ? allGroups.slice(0, options.limit) : allGroups;
  const rereads = allGroups.filter((group) => group.rows.length > 1).length;
  // Names that needed more than the title mean two books collided, which is
  // the one case where adding a book can move an existing name. Surface it.
  const escalated = allGroups.filter(
    (group) => group.name !== `${NAME_PREFIX}-${slugify(group.title)}`,
  ).length;
  console.log(
    `  ${rows.length} rows, ${allGroups.length} books, ${rereads} read more than once` +
      (escalated ? `, ${escalated} name(s) needed more than the title` : ""),
  );
  if (options.limit) {
    console.log(
      `  --limit ${options.limit}: a subset of ${allGroups.length}, written to ${outDir}`,
    );
  }

  const previousManifestPath = join(outDir, MANIFEST_FILENAME);
  let previous: Manifest | null = null;
  try {
    previous = JSON.parse(readFileSync(previousManifestPath, "utf8")) as Manifest;
  } catch {
    previous = null;
  }

  const plan = planWork(
    groups,
    assetIndex(previous),
    digestOnDisk(emojiDir),
    options.force,
  );
  const toRender = plan.filter((item) => item.action === "render").length;
  const toReuse = plan.filter((item) => item.action === "reuse").length;
  const noCover = plan.filter((item) => item.action === "skip-no-cover").length;
  console.log(
    `Plan: ${toRender} to render, ${toReuse} reused from a previous run, ${noCover} without a cover`,
  );

  if (options.dryRun) {
    console.log(`--dry-run: nothing written (would have written to ${outDir}).`);
    return;
  }

  mkdirSync(emojiDir, { recursive: true });
  mkdirSync(previewDir, { recursive: true });

  const assets = new Array<AssetEntry | undefined>(plan.length);

  /**
   * Snapshot whatever is finished. Written atomically every so often during
   * the batch so an interrupted run resumes from the covers it already
   * fetched instead of starting over. Only completed entries go in.
   */
  const compose = (complete: boolean): Manifest => {
    const finishedGroups: CoverGroup[] = [];
    const finishedAssets: AssetEntry[] = [];
    plan.forEach((item, index) => {
      const asset = assets[index];
      if (!asset) return;
      finishedGroups.push(item.group);
      finishedAssets.push(asset);
    });
    const statusByName = new Map(
      finishedAssets.map((asset) => [asset.name, asset.status]),
    );
    const rowEntries = buildRowEntries(finishedGroups, statusByName);
    return {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      generator: "scripts/book-cover-emojis/run.ts",
      complete: complete && !options.limit,
      subset: options.limit
        ? { limit: options.limit, of: allGroups.length }
        : null,
      source: {
        description:
          "Postgres mirror of the Notion Book Notes database, read-only",
        table: "books",
        rows: rows.length,
        groups: allGroups.length,
        coverageCaveat: COVERAGE_CAVEAT,
      },
      emoji: {
        size: EMOJI_SIZE,
        format: "png",
        channels: 4,
        fit: "contain (aspect preserved, no crop, no stretch, longer side fills the square)",
        background: "transparent",
      },
      counts: countManifest(finishedAssets, rowEntries),
      assets: finishedAssets,
      rows: rowEntries,
    };
  };

  const manifestPath = previousManifestPath;
  const checkpoint = (complete: boolean) =>
    writeAtomic(manifestPath, `${JSON.stringify(compose(complete), null, 2)}\n`);

  let done = 0;
  try {
    await runPool(plan, options.concurrency, async (item, index) => {
      if (item.action === "skip-no-cover") {
        assets[index] = missingCoverAsset(item.group);
      } else if (item.action === "reuse" && item.reuse) {
        // Keep the rendered PNG, take every other field from the live
        // catalog, so a reused entry never describes a stale row.
        assets[index] = refreshReusedAsset(item.reuse, item.group);
      } else {
        assets[index] = await renderGroup(item.group, emojiDir);
        const entry = assets[index];
        if (entry.status !== "success") {
          console.log(`  ! ${entry.name}: ${entry.status} — ${entry.error}`);
        }
      }
      done += 1;
      if (done % CHECKPOINT_EVERY === 0) {
        checkpoint(false);
        console.log(`  ${done}/${plan.length} (checkpointed)`);
      }
    });
  } catch (error) {
    checkpoint(false);
    console.error(
      `Interrupted after ${done}/${plan.length}. Checkpoint written; rerun to resume.`,
    );
    throw error;
  }

  const manifest = compose(true);
  writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Manifest: ${manifestPath}`);

  if (!options.noPreview) {
    const picks = pickContactSheetAssets(manifest.assets);
    const sheet = await renderContactSheet(picks, manifest, emojiDir);
    const sheetPath = join(previewDir, "contact-sheet.png");
    writeAtomic(sheetPath, sheet);
    const htmlPath = join(previewDir, "catalog.html");
    writeAtomic(htmlPath, catalogHtml(manifest));
    console.log(`Preview: ${sheetPath}`);
    console.log(`Catalog: ${htmlPath}`);
  }

  const counts = manifest.counts;
  console.log(
    `Assets: ${counts.assets.success} rendered, ${counts.assets["missing-cover"]} without a cover, ` +
      `${counts.assets["fetch-failed"]} fetch-failed, ${counts.assets["render-failed"]} render-failed ` +
      `(${counts.assets.total} books, ${counts.rows.total} source rows)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
