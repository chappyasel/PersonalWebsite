/**
 * Print the end-to-end status as one JSON line. Reads files and nothing else:
 * no Drive call, no browser, no database, no request, no state writes.
 *
 * Run with: pnpm exec tsx scripts/takeout/status-cli.ts
 *   --pretty         Indent the JSON.
 *   --fail-on-stale  Exit 1 when freshness is anything but `fresh`.
 *
 * `drive_check` is reported as `unknown` here by design: this process does not
 * talk to Drive, so it cannot vouch for that check. `refresh.ts` emits the same
 * record with the real verdict once it has run the check.
 */
import * as fs from "fs";
import * as os from "os";

import { readRequestState } from "./request-state";
import { computeE2eStatus, freshnessMaxAgeHours } from "./status";
import { type RefreshState, stateFilePath } from "./state";

function readImporterState(): RefreshState | null {
  try {
    const file = stateFilePath();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as RefreshState;
  } catch {
    return null;
  }
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: tsx scripts/takeout/status-cli.ts [--pretty] [--fail-on-stale]\nRead-only: prints the end-to-end YouTube Takeout status as JSON.",
    );
    return;
  }
  const unknown = args.filter(
    (arg) => !["--pretty", "--fail-on-stale"].includes(arg),
  );
  if (unknown.length > 0) throw new Error("invalid_status_arguments");

  const status = computeE2eStatus({
    now: new Date(),
    importer: readImporterState(),
    request: readRequestState(),
    driveCheck: "unknown",
    hostname: os.hostname(),
    maxAgeHours: freshnessMaxAgeHours(process.env),
  });

  console.log(
    JSON.stringify(status, null, args.includes("--pretty") ? 2 : undefined),
  );
  if (args.includes("--fail-on-stale") && status.freshness !== "fresh") {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  // Paths and parse errors can name credential directories.
  console.log(
    JSON.stringify({
      event: "status_failed",
      reason:
        error instanceof Error && error.message === "invalid_status_arguments"
          ? "invalid_arguments"
          : "unreadable",
    }),
  );
  process.exitCode = 1;
}
