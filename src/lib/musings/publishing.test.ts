import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { musingsFeed } from "./feed";
import { musingMetadata, musingStructuredData } from "./metadata";
import { type MusingArticle, safeMusingLink, validMusingSlug } from "./types";

const article: MusingArticle = {
  slug: "an-essay",
  title: "An essay & a thought",
  description: 'A <thought> with "quotes"',
  author: "Paul Asel and Chappy Asel",
  publishedAt: "2023-04-02T23:10:00.400Z",
  updatedAt: "2023-04-02T23:10:00.400Z",
  mediumUrl: null,
  cover: null,
  blocks: [],
  text: "Essay body",
  contentHash: "test",
};
describe("Musing publishing outputs", () => {
  it("uses the website canonical and original publication date", () => {
    const metadata = musingMetadata(article);
    expect(metadata.alternates?.canonical).toBe(
      "https://www.chappyasel.com/musings/an-essay",
    );
    const structured = JSON.parse(musingStructuredData(article)) as {
      datePublished: string;
      author: { name: string }[];
    };
    expect(structured.datePublished).toBe(article.publishedAt);
    expect(structured.author.map((p: { name: string }) => p.name)).toEqual([
      "Paul Asel",
      "Chappy Asel",
    ]);
    expect(
      musingStructuredData({
        ...article,
        title: "</script><script>bad</script>",
      }),
    ).not.toContain("</script>");
  });
  it("emits valid RSS even when text contains XML syntax", () => {
    const xml = new JSDOM(musingsFeed([article]), { contentType: "text/xml" })
      .window.document;
    expect(xml.querySelector("item title")?.textContent).toBe(article.title);
    expect(xml.querySelector("item description")?.textContent).toBe(
      article.description,
    );
    expect(xml.querySelector("item guid")?.textContent).toBe(
      "https://www.chappyasel.com/musings/an-essay",
    );
  });
  it("rejects unsafe slugs and link protocols", () => {
    for (const slug of ["../private", "An Essay", "", "feed.xml"])
      expect(validMusingSlug(slug)).toBe(false);
    expect(validMusingSlug("the-apple-way")).toBe(true);
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,bad",
      "//evil.example",
    ])
      expect(safeMusingLink(url)).toBeUndefined();
    expect(safeMusingLink("/musings/the-apple-way")).toBe(
      "/musings/the-apple-way",
    );
  });
});
