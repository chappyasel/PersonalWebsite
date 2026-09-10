import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** @param {string} directory @returns {string[]} */
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const manifest = JSON.parse(
  readFileSync(".next/prerender-manifest.json", "utf8"),
);
if (
  Object.keys(manifest.routes).some(
    (route) => route === "/weight-log" || route.startsWith("/weight-log/"),
  )
) {
  throw new Error("Weight log must never be prerendered");
}

const tracked = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
}).split("\0");
if (
  tracked.some(
    (path) =>
      path.startsWith("data/weight-log/") ||
      /weight.log.*\.(xlsx|csv|enc)$/i.test(path),
  )
) {
  throw new Error("Private weight data entered the Git index");
}

for (const path of files(".next/server")) {
  if (!path.endsWith(".nft.json")) continue;
  const trace = JSON.parse(readFileSync(path, "utf8"));
  if (
    trace.files.some(
      (/** @type {string} */ file) =>
        file.includes("data/weight-log/") || file.endsWith(".xlsx"),
    )
  ) {
    throw new Error("Private local data entered a production file trace");
  }
}

for (const path of [...files(".next/static"), ...files("public")]) {
  if (/weight.log.*\.(xlsx|csv|enc)$/i.test(path))
    throw new Error("Private snapshot entered public assets");
  if (!/\.(json|js|html|txt|map)$/.test(path)) continue;
  // Detect the snapshot document, including JSON escaped inside another document.
  if (
    /sourceModifiedAt\\?"\s*:\s*\\?"\d{4}-/.test(readFileSync(path, "utf8"))
  ) {
    throw new Error("Weight snapshot contents entered public assets");
  }
}
console.log(
  "Weight log privacy boundary passed: dynamic route, no private data in Git, public assets, or file traces.",
);
