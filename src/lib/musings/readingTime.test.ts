import blog from "../../../public/data/blog-posts.json";
import { describe, expect, it } from "vitest";

import { musings } from "./content";
import { musingReadingMinutes } from "./readingTime";

describe("Musing reading times", () => {
  it("provides a reading time for every published card", () => {
    for (const post of blog.items) {
      expect(musingReadingMinutes(post)).toBeGreaterThan(0);
    }
  });

  it("keeps each local card consistent with its full article", () => {
    for (const article of musings) {
      const post = blog.items.find((item) => item.link === `/musings/${article.slug}`);
      expect(post).toBeDefined();
      expect(musingReadingMinutes(post!)).toBe(
        musingReadingMinutes({ searchText: article.text }),
      );
    }
  });

  it("does not invent a reading time when the full text is unavailable", () => {
    expect(musingReadingMinutes({})).toBeNull();
    expect(musingReadingMinutes({ searchText: " \n " })).toBeNull();
  });
});
