#!/usr/bin/env tsx
/**
 * Fill the S3 queue from the covers already rendered locally.
 *
 *   pnpm book-emoji-seed                 # dry run
 *   pnpm book-emoji-seed --apply         # upload assets and write jobs
 *   pnpm book-emoji-seed --apply --limit 3
 *
 * The cloud producer does the same thing from the database on a schedule. This
 * exists so a pilot does not have to wait on a deploy, and so the first batch
 * uses the exact bytes that were already audited rather than a fresh render.
 */
import { publishWorkItems } from "../../src/server/bookCoverEmojis/producer";
import { EmojiStore } from "../../src/lib/bookCoverEmojis/store";
import type { WorkInput } from "../../src/lib/bookCoverEmojis/work";
import { positiveInt, flagValue as readFlag } from "./cli";
import { MANIFEST_FILENAME, type Manifest } from "./manifest";
import { safeMessage } from "./redact";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const WORKSPACE_ID = "859fbc85-7644-4498-88d8-e0229d8cea32";
const DEFAULT_OUT = join(homedir(), "Desktop", "Agents", "research", "book-cover-emojis");

const argv = process.argv.slice(2);
const flag = (name: string) => readFlag(argv, name);
const options = {
  out: flag("out") ?? DEFAULT_OUT,
  apply: argv.includes("--apply"),
  limit: positiveInt(flag("limit"), 0, "limit"),
  bucket: process.env.AWS_BUCKET_NAME ?? "",
  region: process.env.AWS_REGION ?? "us-east-1",
};

const log = (message: string) => console.log(safeMessage(message));

/** One work item per book, carrying every page that shares the jacket. */
export function workInputsFromManifest(manifest: Manifest): WorkInput[] {
  const pagesByAsset = new Map<string, Array<{ notionId: string; bookId: string }>>();
  for (const row of manifest.rows) {
    if (row.status !== "success") continue;
    const list = pagesByAsset.get(row.asset) ?? [];
    list.push({ notionId: row.notionId, bookId: row.bookId });
    pagesByAsset.set(row.asset, list);
  }

  const inputs: WorkInput[] = [];
  for (const asset of manifest.assets) {
    if (asset.status !== "success" || !asset.png) continue;
    const pages = pagesByAsset.get(asset.name);
    if (!pages?.length) continue;
    inputs.push({
      workId: asset.name,
      sha256: asset.png.sha256,
      bytes: asset.png.bytes,
      title: asset.title,
      author: asset.author,
      pages,
    });
  }
  return inputs.sort((a, b) => a.workId.localeCompare(b.workId));
}

async function main(): Promise<void> {
  if (!options.bucket) throw new Error("AWS_BUCKET_NAME is not set");
  const manifest = JSON.parse(
    readFileSync(join(options.out, MANIFEST_FILENAME), "utf8"),
  ) as Manifest;
  if (!manifest.complete) {
    throw new Error("the manifest is a checkpoint or subset, not a full catalog");
  }

  const all = workInputsFromManifest(manifest);
  const inputs = options.limit ? all.slice(0, options.limit) : all;
  const pages = inputs.reduce((total, input) => total + input.pages.length, 0);
  log(`seeding ${inputs.length} book(s) covering ${pages} page(s) from ${options.out}`);

  const store = new EmojiStore({ bucket: options.bucket, region: options.region });
  const result = await publishWorkItems(store, inputs, {
    workspaceId: WORKSPACE_ID,
    apply: options.apply,
    loadAsset: async (input) => {
      const asset = manifest.assets.find((candidate) => candidate.name === input.workId);
      if (!asset?.file) throw new Error(`no file for ${input.workId}`);
      return readFileSync(join(options.out, asset.file));
    },
  });

  log(
    `created ${result.created}, artwork changed ${result.artworkChanged}, pages changed ${result.pagesChanged}, name changed ${result.nameChanged}, unchanged ${result.unchanged}, contended ${result.contended}, failed ${result.failed.length}`,
  );
  for (const failure of result.failed.slice(0, 10)) {
    log(`  ! ${failure.workId}: ${failure.error}`);
  }
  if (!options.apply) log("dry run: nothing uploaded. Pass --apply.");
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
