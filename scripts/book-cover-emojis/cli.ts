/** Argument parsing, kept out of run.ts so it can be tested without the run. */
import { join } from "node:path";

export function flagValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return argv[index + 1];
}

/**
 * Numeric flags are validated rather than coerced. Number("-4") is a perfectly
 * good number, and a negative worker count starts no workers at all — a run
 * that would look like it finished instantly having rendered nothing.
 */
export function positiveInt(
  raw: string | undefined,
  fallback: number,
  flag: string,
): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${flag} needs a positive whole number, got "${raw}"`);
  }
  return value;
}

/**
 * Where a run writes. A --limit run renders a slice of the catalog, so it
 * gets its own directory: writing a slice into the full output would replace
 * the manifest the whole catalog resumes from, and every book outside the
 * slice would read as never rendered.
 */
export function resolveOutDir(out: string, limit: number): string {
  return limit ? join(out, "subsets", `limit-${limit}`) : out;
}
