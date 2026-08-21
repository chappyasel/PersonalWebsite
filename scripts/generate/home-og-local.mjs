#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { homeOgInputManifest } from "./home-og-inputs.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const port = 3319;
const sourceUrl = `http://127.0.0.1:${port}`;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      ...options,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(child);
      } else {
        reject(
          new Error(
            `${command} ${args.join(" ")} exited with ${signal ?? code}`,
          ),
        );
      }
    });
  });
}

async function waitForServer(child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("The local production server exited before it was ready.");
    }
    try {
      const response = await fetch(sourceUrl);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${sourceUrl}.`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

console.log("Building the local production site for OG capture...");
const inputsBeforeBuild = await homeOgInputManifest({ root });
await run("yarn", ["next", "build"]);
const inputsAfterBuild = await homeOgInputManifest({ root });
if (inputsAfterBuild.digest !== inputsBeforeBuild.digest) {
  throw new Error(
    "Homepage OG inputs changed during the production build. Run the generator again.",
  );
}

const server = spawn(
  "yarn",
  ["next", "start", "--hostname", "127.0.0.1", "--port", String(port)],
  { cwd: root, stdio: "inherit" },
);

try {
  await waitForServer(server);
  await run(process.execPath, [
    "scripts/generate/home-og-scene.mjs",
    "--url",
    sourceUrl,
  ]);
} finally {
  await stopServer(server);
}
