#!/usr/bin/env node
// Inventory of tests that read source files instead of calling them.
//
// A test that reads a module's TEXT is pinned to how that module is written,
// not to what it does: it breaks on a rename and passes on a behaviour
// change. This script counts what is left, groups it into migration batches,
// and prints the same answer every run so a batch can be closed and the
// number checked.
//
//   node scripts/test-source-reads.mjs            markdown to stdout
//   node scripts/test-source-reads.mjs --json     machine-readable
//   node scripts/test-source-reads.mjs --total    one number, for a shell
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const SEARCH_ROOTS = ["src", "scripts", "tests"];
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** Anything read here is an artifact, not a module's own source text. */
const GENERATED_ARTIFACT =
  /\.(glb|gltf|png|jpe?g|webp|avif|svg|mp3|wav|json|txt|md)$/i;
const SOURCE_TEXT = /\.([cm]?[jt]sx?|css)$/i;
const ENCODING = /^utf-?8$/i;
const DYNAMIC_TARGET = "(resolved at run time)";

function walk(directory, found = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (TEST_FILE.test(entry.name)) found.push(full);
  }
  return found;
}

/** The first string literal in a call that is not an encoding argument. */
function firstPathLiteral(call) {
  for (const match of call.matchAll(/["'`]([^"'`]*)["'`]/g))
    if (!ENCODING.test(match[1])) return match[1];
  return null;
}

/**
 * Helpers that exist only to read a file, so `const x = source("./A.tsx")`
 * counts as a read. Both spellings in the tree are covered: a declared
 * function, and an arrow bound to a const.
 */
function readerNames(code) {
  const names = new Set();
  const declared =
    /function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{[\s\S]{0,400}?readFileSync/g;
  for (const match of code.matchAll(declared)) names.add(match[1]);
  const arrow =
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*[\s\S]{0,200}?readFileSync/g;
  for (const match of code.matchAll(arrow)) names.add(match[1]);
  return names;
}

/**
 * Bindings holding source text, and what each one reads.
 *
 * Three forms cover every case in the tree: a direct read, a read through a
 * helper, and a slice of another source binding (the "look only inside this
 * function" idiom).
 */
function sourceBindings(code) {
  const bindings = new Map();
  const readers = readerNames(code);

  const direct =
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:fs\.)?readFileSync\(([\s\S]{0,300}?)\)[;\n]/g;
  for (const match of code.matchAll(direct)) {
    const target = firstPathLiteral(match[2]);
    if (target) bindings.set(match[1], { target, derived: false });
  }

  if (readers.size > 0) {
    const viaHelper = new RegExp(
      `const\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:${[...readers].join("|")})\\(([^)]*)\\)`,
      "g",
    );
    for (const match of code.matchAll(viaHelper)) {
      if (bindings.has(match[1])) continue;
      const target = firstPathLiteral(match[2]);
      if (target) bindings.set(match[1], { target, derived: false });
    }
  }

  if (readers.size > 0) {
    // `const text = source(file)` inside a loop: still source text, just with
    // a target this script will not guess.
    const viaHelperDynamic = new RegExp(
      `(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:${[...readers].join("|")})\\(`,
      "g",
    );
    for (const match of code.matchAll(viaHelperDynamic))
      if (!bindings.has(match[1]))
        bindings.set(match[1], { target: DYNAMIC_TARGET, derived: false });
  }

  const sliced =
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.slice\(/g;
  for (const match of code.matchAll(sliced)) {
    const parent = bindings.get(match[2]);
    if (parent)
      bindings.set(match[1], { target: parent.target, derived: true });
  }
  return bindings;
}

/** `expect(source)`, `expect(source.match(...))`, `expect(source.indexOf(...))`. */
function countAssertions(code, bindings) {
  const perTarget = new Map();
  let total = 0;
  for (const match of code.matchAll(/expect\(\s*([A-Za-z_$][\w$]*)/g)) {
    const binding = bindings.get(match[1]);
    if (!binding) continue;
    total += 1;
    perTarget.set(binding.target, (perTarget.get(binding.target) ?? 0) + 1);
  }
  return { total, perTarget };
}

function inventory() {
  const files = SEARCH_ROOTS.flatMap((root) => {
    const full = path.join(ROOT, root);
    return fs.existsSync(full) ? walk(full) : [];
  })
    .map((file) => path.relative(ROOT, file))
    .sort();

  const entries = [];
  for (const file of files) {
    const code = fs.readFileSync(path.join(ROOT, file), "utf8");
    if (!code.includes("readFileSync") && !code.includes("readFile(")) continue;

    const bindings = sourceBindings(code);
    // Every literal handed to a read, whether or not it lands in a binding.
    // An object map of reads is common and never produces one.
    const readers = readerNames(code);
    const literalCalls = new RegExp(
      `(?:(?:fs\\.)?readFileSync${readers.size > 0 ? `|${[...readers].join("|")}` : ""})\\(([\\s\\S]{0,300}?)\\)`,
      "g",
    );
    const targets = [
      ...new Set(
        [
          ...[...bindings.values()].map((binding) => binding.target),
          ...[...code.matchAll(literalCalls)]
            .map((match) => firstPathLiteral(match[1]))
            .filter(Boolean),
        ].filter((target) => target !== DYNAMIC_TARGET),
      ),
    ];
    const { total, perTarget } = countAssertions(code, bindings);
    const ranked = [...perTarget.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );

    const readsSourceText =
      targets.some((target) => SOURCE_TEXT.test(target)) ||
      [...bindings.values()].some(
        (binding) => binding.target === DYNAMIC_TARGET,
      );
    const hashesWhatItReads = /createHash\(/.test(code);
    const kind = readsSourceText
      ? "source-text"
      : targets.length === 0 && !hashesWhatItReads
        ? "dynamic-path"
        : "generated-artifact";

    entries.push({
      file,
      kind,
      assertions: kind === "source-text" ? total : 0,
      attributable: !(kind === "source-text" && total === 0),
      targets: targets.sort(),
      primary:
        ranked.find(([target]) => SOURCE_TEXT.test(target))?.[0] ??
        targets.filter((target) => SOURCE_TEXT.test(target)).sort()[0] ??
        null,
    });
  }
  return entries;
}

/** A batch is one primary target and every test that leans on it. */
function batches(entries) {
  const grouped = new Map();
  for (const entry of entries.filter((e) => e.kind === "source-text")) {
    const key = entry.primary ? path.basename(entry.primary) : "unresolved";
    const batch = grouped.get(key) ?? { name: key, files: [], assertions: 0 };
    batch.files.push(entry.file);
    batch.assertions += entry.assertions;
    grouped.set(key, batch);
  }
  return [...grouped.values()].sort(
    (a, b) => b.assertions - a.assertions || a.name.localeCompare(b.name),
  );
}

const entries = inventory();
const sourceText = entries.filter((entry) => entry.kind === "source-text");
const artifacts = entries.filter(
  (entry) => entry.kind === "generated-artifact",
);
const dynamic = entries.filter((entry) => entry.kind === "dynamic-path");
const totals = {
  filesReadingAnything: entries.length,
  filesReadingSourceText: sourceText.length,
  sourceTextAssertions: sourceText.reduce((sum, e) => sum + e.assertions, 0),
  filesCheckingGeneratedArtifacts: artifacts.length,
  filesReadingDynamicPaths: dynamic.length,
};

if (process.argv.includes("--total")) {
  console.log(totals.sourceTextAssertions);
} else if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify({ totals, entries, batches: batches(entries) }, null, 2),
  );
} else {
  const lines = [];
  lines.push("| batch | assertions | test files |");
  lines.push("| --- | --- | --- |");
  for (const batch of batches(entries))
    lines.push(
      `| ${batch.name} | ${batch.assertions} | ${batch.files.join("<br>")} |`,
    );
  const unattributed = sourceText.filter((entry) => !entry.attributable);
  lines.push("");
  lines.push(
    `Test files that read a file at all: ${totals.filesReadingAnything}`,
  );
  lines.push(
    `Test files reading source text: ${totals.filesReadingSourceText}`,
  );
  lines.push(`Source-text assertions: ${totals.sourceTextAssertions}`);
  lines.push(
    `Test files checking generated artifacts (keep these): ${totals.filesCheckingGeneratedArtifacts}`,
  );
  if (unattributed.length > 0) {
    lines.push("");
    lines.push("Reads source text but the assertion count needs a hand check:");
    for (const entry of unattributed) lines.push(`- ${entry.file}`);
  }
  if (dynamic.length > 0) {
    lines.push("");
    lines.push("Reads a path this script cannot resolve, classify by hand:");
    for (const entry of dynamic) lines.push(`- ${entry.file}`);
  }
  console.log(lines.join("\n"));
}
