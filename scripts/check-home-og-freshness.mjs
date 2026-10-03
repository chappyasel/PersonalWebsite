#!/usr/bin/env node
// Room OG cards against their capture provenance: the homepage card and one
// card per room path (scripts/generate/room-og-config.mjs). The file keeps its
// homepage name because `.github/workflows/refresh-home-og.yml` calls it.
//
// Two questions, asked by different callers:
//
// - Default (`pnpm check:home-og`, `verify:artifacts`, CI): have any of the
//   files a card watches changed since it was captured? That is a proxy. A
//   watched file changing does not mean the picture changed, and most of the
//   time it has not. The pixel answer comes from `room-og-postbuild.mjs`
//   after a local production build.
// - `--integrity` (the pre-commit hook): is each committed card still the
//   capture its manifest describes? This is not a proxy. A card replaced by
//   hand, or committed without its manifest, fails it.
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ROOM_OG_SLUGS, roomOgCard } from "./generate/room-og-config.mjs";
import {
  roomOgArtifactIntegrity,
  roomOgArtifactStatus,
} from "./generate/room-og-inputs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const usage =
  "Usage: node scripts/check-home-og-freshness.mjs [--staged] [--integrity] [--unit <slug>]...";
const units = [];
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--staged" || arg === "--integrity") continue;
  if (arg === "--unit" && args[index + 1]) {
    units.push(args[(index += 1)]);
    continue;
  }
  console.error(usage);
  process.exit(2);
}
const staged = args.includes("--staged");
const integrityOnly = args.includes("--integrity");
const snapshot = staged ? "index" : "workingTree";
const where = staged ? "staged commit" : "working tree";
for (const slug of units) roomOgCard(slug);
const cards = units.length > 0 ? units : [...ROOM_OG_SLUGS];

/** @param {string} card */
function printRemediation(card) {
  const { image, manifest } = roomOgCard(card);
  console.error(
    `Run: pnpm generate:room-og:local --unit ${card}\nThen stage: ${image} ${manifest}`,
  );
}

let failed = false;

if (integrityOnly) {
  for (const card of cards) {
    let result;
    try {
      result = await roomOgArtifactIntegrity({ root, snapshot, card });
    } catch (error) {
      result = { card, missing: false, intact: false, error };
    }
    if (result.intact) continue;
    failed = true;
    console.error(
      result.missing
        ? `The ${card} OG card or its manifest is missing from the ${where}.`
        : `The ${card} OG card in the ${where} is not the capture its manifest describes; it was edited or replaced by hand.`,
    );
    printRemediation(card);
  }
  process.exit(failed ? 1 : 0);
}

for (const card of cards) {
  let status;
  try {
    status = await roomOgArtifactStatus({ root, snapshot, card });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `The ${card} OG inputs are missing or invalid in the ${where}: ${reason}`,
    );
    printRemediation(card);
    failed = true;
    continue;
  }

  if (status.fresh) {
    console.log(
      `The ${card} OG card matches ${status.files.length} ${staged ? "staged" : "working-tree"} source files.`,
    );
    continue;
  }

  failed = true;
  if (status.missing) {
    console.error(
      `The ${card} OG card has not been generated in the ${where}.`,
    );
    printRemediation(card);
    continue;
  }
  console.error(`The ${card} OG card is stale for the ${where}.`);
  // Say which files moved. "Stale" on its own sends the reader to a
  // three-minute production build to learn something the manifest already
  // knows, and most of the time the answer is that nothing on the card moved.
  if (status.changed === null) {
    console.error(
      "The committed manifest predates per-file digests, so the changed files cannot be listed.",
    );
  } else if (status.changed.length > 0) {
    const shown = status.changed.slice(0, 20);
    console.error(
      `\n${status.changed.length} watched source file(s) changed since the capture:`,
    );
    for (const { file, change } of shown) {
      console.error(`  ${change.padEnd(7)} ${file}`);
    }
    if (status.changed.length > shown.length) {
      console.error(`  ... and ${status.changed.length - shown.length} more`);
    }
    console.error(
      "\nA watched file changing does not mean the card changed. A local\n`pnpm build` compares a fresh render against the committed pixels and\nrestamps the card when the picture is the same.",
    );
  }
  if (status.imageDrifted) {
    console.error(
      "\nThe committed JPEG does not match its own capture provenance; it was edited or replaced by hand.",
    );
  }
  printRemediation(card);
  console.error("");
}

process.exit(failed ? 1 : 0);
