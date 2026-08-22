#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const desiredHooksPath = ".githooks";

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

try {
  if (git(["rev-parse", "--is-inside-work-tree"]) !== "true") process.exit(0);
} catch {
  process.exit(0);
}

let currentHooksPath = "";
try {
  currentHooksPath = git(["config", "--get", "core.hooksPath"]);
} catch {
  // No repository hook path has been configured yet.
}

if (currentHooksPath && currentHooksPath !== desiredHooksPath) {
  console.warn(
    `Git hooks were not installed because core.hooksPath is already ${JSON.stringify(currentHooksPath)}.`,
  );
  process.exit(0);
}

if (!currentHooksPath) {
  execFileSync("git", ["config", "core.hooksPath", desiredHooksPath], {
    stdio: "ignore",
  });
  console.log(`Configured repository Git hooks from ${desiredHooksPath}.`);
}
