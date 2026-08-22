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
  printRemediation();
  process.exit(1);
}

console.log(
  `Homepage OG image matches ${status.files.length} ${staged ? "staged" : "working-tree"} source files.`,
);
