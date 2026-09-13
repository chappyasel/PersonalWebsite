import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const root = "scripts/generate/room-artwork-inputs";
async function hashes() {
  const manifest = JSON.parse(await readFile(`${root}/manifest.json`, "utf8"));
  const files = new Set([
    `${root}/manifest.json`,
    "scripts/room-artwork-quality/capture-specs.json",
  ]);
  for (const c of manifest.cases) {
    files.add(`${root}/${c.inputSvg}`);
    files.add(`${root}/${c.inputCapture}`);
    files.add(
      `docs/reviews/room-artwork-quality-evidence/${c.unit}-${c.label}.json`,
    );
    for (const d of c.details) files.add(`${root}/${d.file}`);
  }
  return Object.fromEntries(
    await Promise.all(
      [...files].sort().map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(file))
          .digest("hex"),
      ]),
    ),
  );
}
const before = await hashes();
await new Promise((resolve, reject) => {
  const child = spawn(
    process.execPath,
    ["scripts/room-artwork-quality/repackage.mjs"],
    { stdio: "inherit" },
  );
  child.on("exit", (code) =>
    code ? reject(Error("Repackage failed")) : resolve(),
  );
});
const after = await hashes();
assert.deepEqual(after, before, "Frozen repackage changed bytes");
const report = {
  files: Object.keys(before).length,
  byteIdentical: true,
  included:
    "Input SVGs, details, immutable camera contracts, manifest, frozen specs and per-case receipts; two consecutive full frozen repackage runs",
  sha256: createHash("sha256").update(JSON.stringify(before)).digest("hex"),
};
await writeFile(
  "docs/reviews/room-artwork-quality-evidence/repackage-idempotence.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(report);
