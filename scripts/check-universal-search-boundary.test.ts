import { describe, expect, it } from "vitest";

import {
  assertDadSearchTrace,
  assertUniversalSearchBoundary,
  extractEntryChunks,
} from "./check-universal-search-boundary.mjs";

function manifest(...entryChunks: string[]) {
  return `globalThis.__RSC_MANIFEST["/page"] = ${JSON.stringify({
    entryJSFiles: { layout: entryChunks },
  })}`;
}

describe("universal search build boundary", () => {
  it("extracts initial entry chunks from a client manifest", () => {
    expect(
      extractEntryChunks(
        manifest("static/chunks/controller.js", "/_next/static/chunks/page.js"),
      ),
    ).toEqual(["static/chunks/controller.js", "static/chunks/page.js"]);
  });

  it("accepts a palette isolated from every initial route entry", () => {
    expect(() =>
      assertUniversalSearchBoundary({
        chunks: new Map([
          ["static/chunks/controller.js", "OPEN_UNIVERSAL_SEARCH_EVENT"],
          ["static/chunks/palette.js", "cmdk-root universal_search_opened"],
        ]),
        manifests: [manifest("static/chunks/controller.js")],
        publicSourceDigest: "digest-only-in-the-json-asset",
      }),
    ).not.toThrow();
  });

  it("fails if the palette or generated content enters an initial chunk", () => {
    expect(() =>
      assertUniversalSearchBoundary({
        chunks: new Map([
          [
            "static/chunks/initial.js",
            "cmdk-root universal_search_opened digest-leak",
          ],
        ]),
        manifests: [manifest("static/chunks/initial.js")],
        publicSourceDigest: "digest-leak",
      }),
    ).toThrow(/initial route/i);
  });

  it("requires private Dad Markdown in the server search trace", () => {
    expect(
      assertDadSearchTrace([
        "../../../../content/dad-search-index.json",
        "../../../../node_modules/gray-matter/index.js",
      ]),
    ).toBe(1);
    expect(() => assertDadSearchTrace(["route.js"])).toThrow(/Dad index/);
  });
});
