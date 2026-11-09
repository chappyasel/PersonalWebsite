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

// The chart reads the database on each request. A prerendered page would
// freeze measurements into build output.
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

// The workbook stays in iCloud as the archive. A copy must never ship.
const tracked = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
}).split("\0");
if (tracked.some((path) => /weight.log.*\.(xlsx|csv)$/i.test(path))) {
  throw new Error("A Weight Log workbook entered the Git index");
}

for (const path of files(".next/server")) {
  if (!path.endsWith(".nft.json")) continue;
  const trace = JSON.parse(readFileSync(path, "utf8"));
  if (trace.files.some((/** @type {string} */ file) => file.endsWith(".xlsx")))
    throw new Error("A workbook entered a production file trace");
}

for (const path of [...files(".next/static"), ...files("public")]) {
  if (/weight.log.*\.(xlsx|csv)$/i.test(path))
    throw new Error("A Weight Log workbook entered public assets");
  if (!/\.(json|js|html|txt|map)$/.test(path)) continue;
  // Detect the chart DTO, including JSON escaped inside another document.
  if (
    /sourceModifiedAt\\?"\s*:\s*\\?"\d{4}-/.test(readFileSync(path, "utf8"))
  ) {
    throw new Error("Weight Log chart data entered public assets");
  }
}
console.log(
  "Weight log privacy boundary passed: dynamic route, no workbook in Git, public assets, or file traces, and no chart data in public assets.",
);
