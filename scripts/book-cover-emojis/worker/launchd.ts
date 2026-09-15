#!/usr/bin/env tsx
/**
 * launchd scheduling for the worker. Writes a plist; never loads one.
 *
 *   pnpm book-emoji-launchd print       # the plist, to stdout
 *   pnpm book-emoji-launchd stage       # write it under the state root
 *   pnpm book-emoji-launchd install     # copy into LaunchAgents, still not loaded
 *   pnpm book-emoji-launchd status
 *   pnpm book-emoji-launchd uninstall   # unload if loaded, then remove
 *
 * Two steps on purpose. ~/Library/LaunchAgents is an auto-load directory: a
 * plist sitting there may be started by launchd at the next login, whether or
 * not anyone ran `launchctl load`. Staging keeps the file under the state root,
 * where nothing can pick it up, until someone deliberately installs it. Install
 * itself does not load the job, but it does hand it to launchd's directory,
 * and the output says so.
 *
 * The plist carries no secrets. The worker reads its own credentials from the
 * environment or ~/.config/notion/api_key at run time, so nothing sensitive is
 * ever written into a file launchd parses.
 */
import { paths } from "./state";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

export const LABEL = "com.chappyasel.book-cover-emojis.worker";
/** Every 30 minutes. Bounded batches mean a quiet queue costs one API read. */
export const INTERVAL_SECONDS = 1800;
export const BATCH_LIMIT = 5;

/**
 * Staged first, installed only on request.
 *
 * Writing straight into ~/Library/LaunchAgents is not inert: a later login can
 * load whatever is sitting there, which would start a mutating job without the
 * explicit activation this is supposed to require. The plist lives under the
 * local state root until someone asks for it to be installed.
 */
const stagedPath = join(paths.root, "launchd", `${LABEL}.plist`);
const installedPath = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);

/**
 * Absolute paths only. launchd runs with a minimal environment and no shell,
 * so a relative path or a bare `pnpm` would simply fail at 3am with no one
 * watching.
 */
export function buildPlist(options: {
  repoRoot: string;
  pnpmPath: string;
  nodeDir: string;
  limit?: number;
  intervalSeconds?: number;
}): string {
  const limit = options.limit ?? BATCH_LIMIT;
  const interval = options.intervalSeconds ?? INTERVAL_SECONDS;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${options.pnpmPath}</string>
    <string>book-emoji-worker</string>
    <string>once</string>
    <string>--limit</string>
    <string>${limit}</string>
    <string>--apply</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${options.repoRoot}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${options.nodeDir}:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StartInterval</key>
  <integer>${interval}</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${join(paths.logs, "worker.out.log")}</string>
  <key>StandardErrorPath</key>
  <string>${join(paths.logs, "worker.err.log")}</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
`;
}

function currentPlist(): string {
  const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "..", "..", "..");
  const pnpmPath = process.env.PNPM_PATH ?? "/opt/homebrew/bin/pnpm";
  const nodeDir = process.env.NODE_DIR ?? "/opt/homebrew/bin";
  return buildPlist({ repoRoot, pnpmPath, nodeDir });
}

/** Best-effort unload. launchctl is absent in some environments; say so. */
function unload(): string {
  for (const args of [
    ["bootout", `gui/${process.getuid?.() ?? 501}/${LABEL}`],
    ["unload", "-w", installedPath],
  ]) {
    try {
      execFileSync("/bin/launchctl", args, { stdio: "pipe" });
      return `launchctl ${args[0]} succeeded`;
    } catch {
      continue;
    }
  }
  return "launchctl reported nothing to unload";
}

function isLoaded(): boolean {
  try {
    const listed = execFileSync("/bin/launchctl", ["list"], { encoding: "utf8" });
    return listed.includes(LABEL);
  } catch {
    return false;
  }
}

function main(): void {
  const command = process.argv[2] ?? "print";
  switch (command) {
    case "print":
      process.stdout.write(currentPlist());
      return;
    case "stage": {
      mkdirSync(dirname(stagedPath), { recursive: true });
      mkdirSync(paths.logs, { recursive: true });
      writeFileSync(stagedPath, currentPlist());
      console.log(`staged ${stagedPath}`);
      console.log("Not in any auto-load directory, so nothing can start it.");
      console.log("To install it for real: pnpm book-emoji-launchd install");
      return;
    }
    case "install": {
      // Only ever reached deliberately. Still does not load the job.
      mkdirSync(dirname(installedPath), { recursive: true });
      mkdirSync(paths.logs, { recursive: true });
      writeFileSync(installedPath, currentPlist());
      console.log(`installed ${installedPath}`);
      console.log(
        "That is launchd's auto-load directory, so this job may start on its",
      );
      console.log("own at your next login. To activate it now instead:");
      console.log(`  launchctl load -w ${installedPath}`);
      console.log("To undo both: pnpm book-emoji-launchd uninstall");
      return;
    }
    case "uninstall": {
      const staged = existsSync(stagedPath);
      const installed = existsSync(installedPath);
      if (!staged && !installed) {
        console.log("nothing staged or installed");
        return;
      }
      if (installed) {
        console.log(unload());
        rmSync(installedPath, { force: true });
        console.log(`removed ${installedPath}`);
        console.log(
          isLoaded()
            ? "WARNING: launchctl still lists the job; unload it by hand"
            : "verified: launchctl no longer lists the job",
        );
      }
      if (staged) {
        rmSync(stagedPath, { force: true });
        console.log(`removed ${stagedPath}`);
      }
      return;
    }
    case "status": {
      console.log(`label: ${LABEL}`);
      console.log(`staged:    ${stagedPath} ${existsSync(stagedPath) ? "(present)" : "(absent)"}`);
      console.log(`installed: ${installedPath} ${existsSync(installedPath) ? "(present)" : "(absent)"}`);
      console.log(`loaded by launchd: ${isLoaded() ? "YES" : "no"}`);
      console.log(`logs:  ${paths.logs}`);
      console.log(`every ${INTERVAL_SECONDS}s, ${BATCH_LIMIT} book(s) per run`);
      return;
    }
    default:
      throw new Error("usage: launchd <print|stage|install|status|uninstall>");
  }
}

// Importing buildPlist in a test must not dump a plist to stdout.
if (process.argv[1]?.endsWith("launchd.ts")) {
  main();
}
