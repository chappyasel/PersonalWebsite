#!/usr/bin/env node
// One command for every check that is honest without a production build.
//
// Deliberately absent: `yarn check:budgets`. It measures gzipped chunk sizes
// from `.next/server/app/**/page_client-reference-manifest.js`, so it reports
// whatever the last build left on disk — or nothing at all in a fresh
// checkout. Running it here would let a stale or missing `.next` masquerade as
// a passing budget, so it stays attached to `postbuild` where a fresh build
// produced its input.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binary = (name) => path.join(root, "node_modules", ".bin", name);

if (!existsSync(path.join(root, "node_modules"))) {
  console.error("Dependencies are missing. Run `yarn install` first.");
  process.exit(1);
}

/**
 * `next-env.d.ts` and `.next/types` are both gitignored, and TypeScript needs
 * them to know that `import image from "public/images/..."` resolves. Without
 * them `tsc` reports eight phantom TS2307 errors and the type-aware lint rules
 * turn the same imports into `no-unsafe-assignment` errors — in a fresh
 * worktree only, which is exactly where nobody expects it. `next typegen` is
 * the supported way to write both without a full build. It loads next.config,
 * which validates env, so skip that: this generates types, it does not deploy.
 */
const STEPS = [
  {
    name: "next typegen",
    detail: "writes next-env.d.ts and .next/types (both gitignored)",
    command: binary("next"),
    args: ["typegen"],
    env: { SKIP_ENV_VALIDATION: "1" },
  },
  {
    name: "tsc",
    detail: "type check, no emit",
    command: binary("tsc"),
    args: ["--noEmit"],
  },
  {
    name: "eslint",
    detail: "src, warnings are failures",
    command: binary("eslint"),
    args: ["--max-warnings", "0", "src/**/*.{js,jsx,ts,tsx}"],
  },
  {
    name: "vitest",
    detail: "unit suite, Playwright specs excluded",
    command: binary("vitest"),
    args: ["run", "--exclude", "tests/e2e/**"],
  },
  {
    name: "home-og freshness",
    detail: "committed JPEG still matches its visual inputs",
    command: process.execPath,
    args: ["scripts/check-home-og-freshness.mjs"],
  },
];

/** @param {(typeof STEPS)[number]} step */
function run(step) {
  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...step.env },
    });
    child.once("error", (error) => {
      console.error(`${step.name} could not start: ${error.message}`);
      resolve(false);
    });
    child.once("exit", (code, signal) => resolve(code === 0 && !signal));
  });
}

const results = [];
for (const step of STEPS) {
  console.log(`\n── ${step.name} — ${step.detail}`);
  const passed = await run(step);
  results.push({ name: step.name, passed });
  // Everything after typegen reads what it wrote, so a failure there makes the
  // remaining results meaningless rather than merely red.
  if (!passed && step.name === "next typegen") break;
}

const width = Math.max(...results.map((result) => result.name.length));
console.log("\n── summary");
for (const result of results) {
  console.log(
    `${result.passed ? "pass" : "FAIL"}  ${result.name.padEnd(width)}`,
  );
}
for (const step of STEPS.slice(results.length)) {
  console.log(`skip  ${step.name.padEnd(width)}`);
}
console.log(
  "n/a   route budgets — needs a fresh `yarn build`; `yarn check:budgets` runs on postbuild",
);

process.exit(results.every((result) => result.passed) ? 0 : 1);
