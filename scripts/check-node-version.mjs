#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const engine = packageJson.engines?.node;
const match = /^(\d+)\.x$/.exec(engine ?? "");
const packageManager = packageJson.packageManager;
const pnpmMatch = /^pnpm@(\d+\.\d+\.\d+)$/.exec(packageManager ?? "");
const pnpmEngine = packageJson.engines?.pnpm;

if (!match) {
  throw new Error(
    `Expected package.json engines.node to use a major-only range, received ${JSON.stringify(engine)}`,
  );
}

const nvmMajor = (await readFile(".nvmrc", "utf8")).trim().replace(/^v/, "");
if (nvmMajor !== match[1]) {
  throw new Error(
    `.nvmrc selects Node ${nvmMajor}, but package.json engines.node is ${engine}`,
  );
}

if (!pnpmMatch) {
  throw new Error(
    `Expected package.json packageManager to pin an exact pnpm version, received ${JSON.stringify(packageManager)}`,
  );
}

if (pnpmEngine !== pnpmMatch[1]) {
  throw new Error(
    `packageManager selects pnpm ${pnpmMatch[1]}, but package.json engines.pnpm is ${JSON.stringify(pnpmEngine)}`,
  );
}

console.log(
  `Node version declarations agree on ${match[1]}; pnpm declarations agree on ${pnpmMatch[1]}`,
);
