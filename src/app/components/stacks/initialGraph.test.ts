import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The homepage's first route load must not carry three.js. The 3D room
 * arrives through `dynamic(() => import("./StacksCanvas"))`, so three should
 * only ever live in that lazy chunk. Every module the page reaches
 * statically, through the boot screen, the placard, the chrome, the store,
 * is in the initial client chunk group, and one value import of three
 * anywhere on that graph ships the 98 KB core with the first paint. PR #45
 * did exactly that: a shelf-layout constant imported from the lamp pose
 * module, which computes with three.
 *
 * This walks the static import graph from the roots the page renders and
 * names the chain when it finds three, so the failure reads as a path, not
 * a size.
 */

const STACKS_DIR = path.dirname(new URL(import.meta.url).pathname);
const SRC_DIR = path.resolve(STACKS_DIR, "../../..");
const ROOTS = [
  path.join(STACKS_DIR, "StacksHome.tsx"),
  path.join(STACKS_DIR, "dom/BootScreen.tsx"),
];
const HEAVY = /^(three|three\/|@react-three\/)/;
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];
const IMPORT =
  /(?:^|\n)\s*(import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;

function resolveSpecifier(from: string, specifier: string) {
  const base = specifier.startsWith("~/")
    ? path.join(SRC_DIR, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.join(path.dirname(from), specifier)
      : null;
  if (!base) return null;
  for (const extension of ["", ...EXTENSIONS]) {
    const candidate = base + extension;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      return candidate;
  }
  return null;
}

function typeOnlyClause(clause: string) {
  const trimmed = clause.trim();
  if (!/^\{[\s\S]*\}$/.test(trimmed)) return false;
  return trimmed
    .replace(/[{}]/g, "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .every((part) => /^type\s/.test(part));
}

/** Static value-import chains from `roots` to any heavy module. */
export function heavyImportChains(roots: string[]) {
  const parent = new Map<string, string | null>();
  const queue: Array<[string, string | null]> = roots.map((root) => [
    root,
    null,
  ]);
  const chains: string[] = [];
  while (queue.length) {
    const [file, from] = queue.shift()!;
    if (parent.has(file)) continue;
    parent.set(file, from);
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT)) {
      const [, , typeKeyword, clause, specifier] = match;
      if (typeKeyword || typeOnlyClause(clause ?? "")) continue;
      if (HEAVY.test(specifier!)) {
        const chain: string[] = [];
        let cursor: string | null = file;
        while (cursor) {
          chain.push(path.relative(STACKS_DIR, cursor));
          cursor = parent.get(cursor) ?? null;
        }
        chains.push(`${specifier} <= ${chain.join(" <= ")}`);
        continue;
      }
      const resolved = resolveSpecifier(file, specifier!);
      if (resolved) queue.push([resolved, file]);
    }
  }
  return { chains, walked: parent.size };
}

describe("homepage initial client graph", () => {
  it("reaches three only through the lazy canvas", () => {
    const { chains, walked } = heavyImportChains(ROOTS);
    expect(walked).toBeGreaterThan(40);
    expect(chains, chains.join("\n")).toEqual([]);
  });
});
