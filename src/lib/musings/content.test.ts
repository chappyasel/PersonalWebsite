import blog from "../../../public/data/blog-posts.json";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { musings } from "./content";
import { musingPath, validMusingSlug } from "./types";

describe("published Musing snapshot", () => {
  it("contains complete articles with unique URLs and local image assets", () => {
    expect(musings.length).toBeGreaterThan(0);
    expect(new Set(musings.map((a) => a.slug)).size).toBe(musings.length);
    for (const article of musings) {
      expect(validMusingSlug(article.slug)).toBe(true);
      expect(article.text.trim().length).toBeGreaterThan(0);
      expect(blog.items.some((p) => p.link === musingPath(article.slug))).toBe(
        true,
      );
      expect(JSON.stringify(article.blocks)).not.toMatch(
        /cdn-images-\d\.medium\.com|X-Amz-Signature|secure\.notion-static/,
      );
      for (const block of article.blocks)
        if (block.type === "image") {
          expect(block.image.width).toBeGreaterThan(0);
          expect(block.image.height).toBeGreaterThan(0);
          expect(
            existsSync(join(process.cwd(), "public", block.image.src)),
          ).toBe(true);
        }
    }
  });
});
