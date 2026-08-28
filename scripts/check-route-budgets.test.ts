import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import {
  extractChunkPaths,
  formatRouteBudget,
  measureRouteBudget,
} from "./check-route-budgets.mjs";

const chunk = (name: string) => `static/chunks/${name}.js`;
const manifestFor = (...chunks: string[]) => chunks.join("\n");

describe("route budget checks", () => {
  it("deduplicates chunks before reading and accounting for them", () => {
    const readChunk = vi.fn(() => Buffer.from("shared source"));
    const shared = chunk("shared-123");

    const result = measureRouteBudget({
      manifest: manifestFor(shared, shared),
      budget: Number.MAX_SAFE_INTEGER,
      readChunk,
    });

    expect(extractChunkPaths(manifestFor(shared, shared))).toEqual([shared]);
    expect(readChunk).toHaveBeenCalledOnce();
    expect(result.largestChunks).toHaveLength(1);
  });

  it("accounts for the gzip-compressed size of every unique chunk", () => {
    const sources = new Map([
      [chunk("alpha-123"), Buffer.from("alpha".repeat(100))],
      [chunk("beta-456"), Buffer.from("beta".repeat(80))],
    ]);

    const result = measureRouteBudget({
      manifest: manifestFor(...sources.keys()),
      budget: Number.MAX_SAFE_INTEGER,
      readChunk: (path) => sources.get(path)!,
    });

    const expected = [...sources.values()].reduce(
      (total, source) => total + gzipSync(source).byteLength,
      0,
    );
    expect(result.gzipBytes).toBe(expected);
  });

  it("reports the five largest chunks in descending gzip order", () => {
    const sources = new Map(
      [1, 2, 3, 4, 5, 6].map((size) => [
        chunk(`chunk-${size}`),
        Buffer.from(Array.from({ length: size * 100 }, (_, i) => i % 251)),
      ]),
    );
    const result = measureRouteBudget({
      manifest: manifestFor(...sources.keys()),
      budget: 0,
      readChunk: (path) => sources.get(path)!,
    });

    const output = formatRouteBudget(
      { name: "test" },
      result,
    );
    const reported = output
      .split("\n")
      .filter((line) => line.includes("static/chunks/"))
      .map((line) => line.trim().split(/\s+/).at(-1));
    const gzipSizes = result.largestChunks.map(({ gzipBytes }) => gzipBytes);

    expect(gzipSizes).toEqual([...gzipSizes].sort((a, b) => b - a));
    expect(reported).toEqual(
      result.largestChunks.slice(0, 5).map(({ path }) => path),
    );
    expect(reported).toHaveLength(5);
  });

  it("passes at the exact byte budget", () => {
    const source = Buffer.from("exact budget source");
    const gzipBytes = gzipSync(source).byteLength;

    expect(
      measureRouteBudget({
        manifest: chunk("exact-123"),
        budget: gzipBytes,
        readChunk: () => source,
      }).passed,
    ).toBe(true);
  });

  it("fails when usage is one byte over budget", () => {
    const source = Buffer.from("one byte over source");
    const gzipBytes = gzipSync(source).byteLength;

    expect(
      measureRouteBudget({
        manifest: chunk("over-123"),
        budget: gzipBytes - 1,
        readChunk: () => source,
      }).passed,
    ).toBe(false);
  });
});
