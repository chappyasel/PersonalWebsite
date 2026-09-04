import { describe, expect, it } from "vitest";

import { isBareUrl, SITE_PAGES, sitePageForHref } from "./pages";

describe("sitePageForHref", () => {
  it("recognises each page by its production host", () => {
    expect(sitePageForHref("https://manual.chappyasel.com/")).toBe("manual");
    expect(sitePageForHref("https://routine.chappyasel.com")).toBe("routine");
    expect(sitePageForHref("https://weightlifting.chappyasel.com/")).toBe(
      "weightlifting",
    );
    expect(sitePageForHref("https://weightlifting.chappyasel.com/squat")).toBe(
      "weightlifting",
    );
    expect(sitePageForHref("https://books.chappyasel.com/")).toBe("books");
  });

  it("recognises each page by its path on the main domain", () => {
    expect(sitePageForHref("https://chappyasel.com/manual")).toBe("manual");
    expect(sitePageForHref("https://www.chappyasel.com/routine/")).toBe(
      "routine",
    );
  });

  it("leaves a book's own page to BookLink", () => {
    expect(sitePageForHref("https://books.chappyasel.com/range")).toBeNull();
  });

  it("ignores everything else", () => {
    expect(sitePageForHref("https://www.chappyasel.com/")).toBeNull();
    expect(sitePageForHref("https://example.com/manual")).toBeNull();
    expect(sitePageForHref("#caffeine")).toBeNull();
  });
});

describe("SITE_PAGES", () => {
  it("names every page as its owner does", () => {
    for (const page of Object.values(SITE_PAGES)) {
      expect(page.title).toBe(`Chappy's ${page.label}`);
      expect(page.description.length).toBeGreaterThan(0);
    }
  });
});

describe("isBareUrl", () => {
  it("is true only for text that is nothing but a URL", () => {
    expect(isBareUrl("https://weightlifting.chappyasel.com/")).toBe(true);
    expect(isBareUrl("  https://books.chappyasel.com/ ")).toBe(true);
    expect(isBareUrl("Weightlifting ~ Chappy Asel")).toBe(false);
    expect(isBareUrl("see https://example.com")).toBe(false);
  });
});
