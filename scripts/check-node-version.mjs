#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const engine = packageJson.engines?.node;
const match = /^(\d+)\.x$/.exec(engine ?? "");

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

console.log(`Node version declarations agree on ${match[1]}`);
