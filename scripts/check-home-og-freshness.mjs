#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  HOME_OG_MANIFEST,
  homeOgImageDigest,
  homeOgInputManifest,
} from "./generate/home-og-inputs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, HOME_OG_MANIFEST);

let committed;
try {
  committed = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`Homepage OG manifest is missing or invalid: ${reason}`);
  console.error("Run `yarn generate:home-og:local` and commit its outputs.");
  process.exit(1);
}

const current = await homeOgInputManifest({ root });
let imageDigest;
try {
  imageDigest = await homeOgImageDigest({ root });
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`Homepage OG image is missing or unreadable: ${reason}`);
  process.exit(1);
}

if (
  committed.version !== current.version ||
  committed.algorithm !== current.algorithm ||
  committed.digest !== current.digest ||
  committed.image?.digest !== imageDigest
) {
  console.error("Homepage OG image or its source fingerprint is stale.");
  console.error("Run `yarn generate:home-og:local` and commit its outputs.");
  process.exit(1);
}

console.log(`Homepage OG image matches ${current.files.length} source files.`);
