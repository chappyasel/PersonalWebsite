import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A same-page section reference ("See ☕ Caffeine", the TL;DR's "read more"
 * arrows) must not be a `next/link`. Routing to the page's own path matches
 * the root-level `(.)routine` / `(.)manual` interceptors, which mounted the
 * document a second time in a sheet over itself; inside a sheet it pushed a
 * hash entry that the first Escape spent. SectionLink scrolls and replaces
 * the hash instead. Source assertion: the renderer pulls in the library's
 * book links and the site cards, and the invariant is which element the
 * `#` branch renders.
 */
const SOURCE = readFileSync(
  new URL("./RichTextRenderer.tsx", import.meta.url),
  "utf8",
);

describe("section references in running text", () => {
  const start = SOURCE.indexOf("if (XrefIcon) {");
  const end = SOURCE.indexOf("} else if (page) {", start);
  const branch = SOURCE.slice(start, end);

  it("render through SectionLink, never next/link", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(branch.match(/<SectionLink\b/g)).toHaveLength(2);
    expect(branch).not.toMatch(/<Link\b/);
  });

  it("hand SectionLink the section id, not the raw href", () => {
    expect(branch.match(/id=\{sectionId\}/g)).toHaveLength(2);
  });
});
