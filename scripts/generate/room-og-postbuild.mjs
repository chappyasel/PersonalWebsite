#!/usr/bin/env node
// The room OG pixel check, run by `postbuild` after a local `pnpm build`.
//
// The freshness manifests hash the files each card watches, and a watched
// file changing almost never changes the picture. So for every card whose
// files moved, this serves the build that just finished, renders the card
// again, and compares the pixels with the committed JPEG:
//
// - Same picture: restamp the card's provenance and manifest. That is the
//   false-alarm case, and it stops existing rather than being reported.
// - Different picture: leave the committed card alone, keep the new render
//   under .next/cache/room-og/ for review, and say how to adopt it.
//
// Agreed with the owner on 2026-08-30 as local-only. It never runs on Vercel
// or in CI, and it never fails the build: every outcome, including a crash,
// exits 0. Set ROOM_OG_POSTBUILD=0 to skip it for one build.
//
// Only node builtins are imported statically, so a broken generator module
// is caught below instead of failing the build at import time.
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const CANDIDATE_DIR = ".next/cache/room-og";

/** Why this build skips the check, or null to run it.
 * @param {Readonly<Record<string, string | undefined>>} env */
export function roomOgPostbuildSkipReason(env) {
  if (env.ROOM_OG_POSTBUILD === "0") return "ROOM_OG_POSTBUILD=0";
  if (env.VERCEL) return "Vercel build";
  if (env.CI) return "CI";
  return null;
}

/** Run the generator for one card, keeping its output to show only when
 * something goes wrong.
 * @param {string[]} args */
function capture(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.once("error", (error) =>
      resolve({ code: null, output: `${output}\n${String(error)}` }),
    );
    child.once("exit", (code) => resolve({ code, output }));
  });
}

/** @param {string} output */
function meanDifference(output) {
  return /mean difference ([\d.]+)/.exec(output)?.[1] ?? null;
}

async function main() {
  const skip = roomOgPostbuildSkipReason(process.env);
  if (skip) {
    console.log(`Room OG pixel check skipped (${skip}).`);
    return;
  }

  const { ROOM_OG_RENDER_CHANGED_EXIT, ROOM_OG_SLUGS } = await import(
    "./room-og-config.mjs"
  );
  const { roomOgArtifactStatus } = await import("./room-og-inputs.mjs");
  const { freeLocalPort, startProductionServer } = await import(
    "./room-og-server.mjs"
  );

  /** @type {string[]} */
  const stale = [];
  for (const card of ROOM_OG_SLUGS) {
    const status = await roomOgArtifactStatus({ root, card });
    if (!status.fresh) stale.push(card);
  }
  if (stale.length === 0) {
    console.log("Room OG cards match their sources.");
    return;
  }

  console.log(
    `Room OG: rendering ${stale.join(", ")} to compare with the committed cards. ` +
      "Each takes a few minutes; ROOM_OG_POSTBUILD=0 skips this.",
  );
  const server = await startProductionServer({
    root,
    port: await freeLocalPort(3319),
    quiet: true,
  });
  /** @type {string[]} */
  const restamped = [];
  try {
    for (const card of stale) {
      const candidate = path.join(CANDIDATE_DIR, `${card}.jpg`);
      const { code, output } = await capture([
        "scripts/generate/room-og-scene.mjs",
        "--unit",
        card,
        "--url",
        server.url,
        "--verify",
        "--candidate",
        candidate,
      ]);
      if (code === 0) {
        restamped.push(card);
      } else if (code === ROOM_OG_RENDER_CHANGED_EXIT) {
        const difference = meanDifference(output);
        console.log(
          `Room OG: the ${card} card looks different now` +
            (difference ? ` (mean difference ${difference}).` : ".") +
            ` The new render is ${candidate}. To adopt it, run ` +
            `\`pnpm generate:room-og:local --unit ${card}\` and commit the card and its manifest.`,
        );
      } else {
        console.log(
          `Room OG: could not render the ${card} card, so it was not checked. ` +
            `\`pnpm generate:room-og:local --unit ${card}\` reproduces the capture.\n` +
            output.trim().split("\n").slice(-8).join("\n"),
        );
      }
    }
  } finally {
    await server.stop();
  }
  if (restamped.length > 0) {
    console.log(
      `Room OG: ${restamped.join(", ")} unchanged; restamped the card provenance and manifests.`,
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    console.log(
      `Room OG pixel check did not run: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  process.exitCode = 0;
}
