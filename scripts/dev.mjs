#!/usr/bin/env node
// `pnpm dev`, but it takes the tree.
//
// Next refuses to start while another `next dev` holds .next/dev/lock, and in
// this repo the other instance is usually an agent session's server left
// running in the same worktree on a side port. The owner's terminal wins:
// whoever holds the lock is stopped, a lock nobody holds is cleared, and only
// then does `next dev --turbo` start. Extra arguments pass through, so
// `pnpm dev -p 3011` still works.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = path.join(root, ".next", "dev", "lock");
const nextBin = path.join(root, "node_modules", ".bin", "next");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** PIDs with the lock file open. Next's server keeps it open for its whole
 * life, so this is the honest answer to "is someone running". lsof exits 1
 * when the answer is nobody. */
function holders() {
  if (!existsSync(lock)) return [];
  try {
    return execFileSync("lsof", ["-t", "--", lock], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\s+/)
      .filter(Boolean)
      .map(Number);
  } catch {
    return [];
  }
}

function ps(pid, column) {
  try {
    return execFileSync("ps", ["-o", `${column}=`, "-p", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signal(pids, name) {
  for (const pid of pids) {
    try {
      process.kill(pid, name);
    } catch {
      // Already gone.
    }
  }
}

const held = holders();
if (held.length > 0) {
  // The lock belongs to next-server, a child of the `next dev` CLI. Stopping
  // only the child leaves the CLI to notice and exit on its own, but taking
  // both is faster and certain. The parent is only included when it is
  // itself a Next process, never the shell that launched it.
  const targets = new Set(held);
  for (const pid of held) {
    const parent = Number(ps(pid, "ppid"));
    if (parent > 1 && /next/.test(ps(parent, "command"))) targets.add(parent);
  }
  console.log(
    `[dev] stopping ${[...targets].join(", ")}, which holds .next/dev/lock`,
  );
  signal(targets, "SIGTERM");
  for (let i = 0; i < 20 && [...targets].some(alive); i++) await sleep(250);
  const stubborn = [...targets].filter(alive);
  if (stubborn.length > 0) {
    signal(stubborn, "SIGKILL");
    await sleep(300);
  }
}
// A lock file nobody holds is what a crashed server leaves behind.
if (existsSync(lock) && holders().length === 0) rmSync(lock, { force: true });

const child = spawn(nextBin, ["dev", "--turbo", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code, exitSignal) => {
  process.exit(code ?? (exitSignal ? 1 : 0));
});
for (const name of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(name, () => child.kill(name));
}
