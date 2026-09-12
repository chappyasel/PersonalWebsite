// Explicit review receipt, not a replacement for capture or geometry validation.
import fs from "node:fs/promises";
import path from "node:path";

import { ROOT, generate, sha256 } from "./room-artwork.mjs";

const args = process.argv.slice(2);
const reason = args.find((a) => a.startsWith("--reason="))?.slice(9);
const dryRun = args.includes("--dry-run");
const reviewed = new Set(args.filter((a) => !a.startsWith("--")));
if (
  !reason ||
  !reviewed.size ||
  args.some(
    (a) =>
      a.startsWith("--") && a !== "--dry-run" && !a.startsWith("--reason="),
  )
) {
  throw Error(
    'Usage: node scripts/generate/review-room-artwork-source.mjs --reason="Reviewed identity-only edits; no geometry change" [--dry-run] path/to/reviewed-source.ts ...',
  );
}
const input = path.join(ROOT, "scripts/generate/room-artwork-inputs");
const manifest = JSON.parse(
  await fs.readFile(path.join(input, "manifest.json"), "utf8"),
);
for (const file of reviewed)
  if (!manifest.dependencies.some((d) => d.path === file))
    throw Error(`Not a recorded dependency: ${file}`);
const changes = [];
for (const dependency of manifest.dependencies) {
  const next = sha256(await fs.readFile(path.join(ROOT, dependency.path)));
  if (next !== dependency.sha256) {
    if (!reviewed.has(dependency.path))
      throw Error(`Unreviewed dependency change: ${dependency.path}`);
    changes.push({
      path: dependency.path,
      previousSha256: dependency.sha256,
      sha256: next,
    });
  }
}
// A source review cannot approve altered drawing inputs.
for (const entry of manifest.cases) {
  for (const [file, expected] of [
    [entry.inputSvg, entry.svgSha256],
    [entry.inputCapture, entry.captureSha256],
    ...entry.details.map((d) => [d.file, d.sha256]),
  ]) {
    if (sha256(await fs.readFile(path.join(input, file))) !== expected)
      throw Error(`Approved input changed: ${file}`);
  }
}
console.log(JSON.stringify({ dryRun, reason, changes }, null, 2));
if (!dryRun && changes.length) {
  for (const change of changes)
    manifest.dependencies.find((d) => d.path === change.path).sha256 =
      change.sha256;
  const previousFingerprint = manifest.sourceFingerprint;
  manifest.sourceFingerprint = sha256(
    JSON.stringify(
      manifest.dependencies.map(({ path, sha256 }) => ({ path, sha256 })),
    ),
  );
  manifest.reviewedSourceChanges ??= [];
  manifest.reviewedSourceChanges.push({
    reason,
    previousFingerprint,
    sourceFingerprint: manifest.sourceFingerprint,
    changes,
  });
  await fs.writeFile(
    path.join(input, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(await generate());
}
