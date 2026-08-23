#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { homeOgArtifactStatus } from "./generate/home-og-inputs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--staged")) {
  console.error("Usage: node scripts/check-home-og-freshness.mjs [--staged]");
  process.exit(2);
}
const staged = args.includes("--staged");
const snapshot = staged ? "index" : "workingTree";

let status;
try {
  status = await homeOgArtifactStatus({ root, snapshot });
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(
    `Homepage OG inputs are missing or invalid in the ${staged ? "staged commit" : "working tree"}: ${reason}`,
  );
  printRemediation();
  process.exit(1);
}

function printRemediation() {
  console.error("Run: pnpm generate:home-og:local");
  console.error(
    "Then stage: public/images/stacks/home-og-scene.jpg public/images/stacks/home-og-scene.inputs.json",
  );
}

if (!status.fresh) {
  console.error(
    `Homepage OG image is stale for the ${staged ? "staged commit" : "working tree"}.`,
  );
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
      "\nA watched file changing does not mean the card changed. The generator\ncompares the new render against the committed pixels and keeps them when\nthe picture is the same.",
    );
  }
  if (status.imageDrifted) {
    console.error(
      "\nThe committed JPEG does not match its own capture provenance; it was edited or replaced by hand.",
    );
  }
  printRemediation();
  process.exit(1);
}

console.log(
  `Homepage OG image matches ${status.files.length} ${staged ? "staged" : "working-tree"} source files.`,
);
