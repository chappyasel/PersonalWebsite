import { describe, expect, it } from "vitest";

import { localizeMusingLinks } from "./links";
import type { MusingBlock } from "./types";

describe("links between migrated essays", () => {
  it("recognizes Medium URL variants and preserves unrelated or section links", () => {
    const urls = [
      "https://medium.com/@chappyasel/the-apple-way-013c1192be67",
      "https://chappyasel.medium.com/the-apple-way-013c1192be67?source=rss",
      "https://medium.com/p/013c1192be67",
      "https://medium.com/@chappyasel/the-apple-way-013c1192be67#section",
      "https://example.com/essay",
    ];
    const blocks: MusingBlock[] = urls.map((url) => ({
      type: "paragraph",
      content: [{ text: "essay", link: url }],
    }));
    const result = localizeMusingLinks(
      blocks,
      new Map([["013c1192be67", "apple-way"]]),
    );
    expect(
      result.map((b) => ("content" in b ? b.content[0]?.link : null)),
    ).toEqual([
      "/musings/apple-way",
      "/musings/apple-way",
      "/musings/apple-way",
      urls[3],
      urls[4],
    ]);
  });
});
