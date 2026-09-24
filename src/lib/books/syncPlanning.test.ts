import { describe, expect, it } from "vitest";

import {
  bookWebsiteUrl,
  mergeAudibleMetadata,
  shouldFetchBookContent,
  shouldLookupAudibleMetadata,
  websiteUrlToWrite,
} from "./syncPlanning";

const EDITED_AT = new Date("2026-07-26T23:43:00.000Z");

describe("book sync planning", () => {
  it("downloads notes only when their edit watermark advances", () => {
    expect(shouldFetchBookContent(EDITED_AT, EDITED_AT)).toBe(false);
    expect(
      shouldFetchBookContent(new Date(EDITED_AT.getTime() + 1000), EDITED_AT),
    ).toBe(true);
  });

  it("looks up Audible when either half of its metadata is missing", () => {
    expect(shouldLookupAudibleMetadata(385, null)).toBe(true);
    expect(shouldLookupAudibleMetadata(null, null)).toBe(true);
    expect(
      shouldLookupAudibleMetadata(385, "https://www.audible.com/pd/B07R7DY9YM"),
    ).toBe(false);
  });

  it("adds the Audible URL without overwriting a manual runtime", () => {
    expect(
      mergeAudibleMetadata(385, {
        asin: "B07R7DY9YM",
        matchedTitle: "The Right It",
        runtimeMin: 400,
      }),
    ).toEqual({
      audioLengthMin: 385,
      audibleUrl: "https://www.audible.com/pd/B07R7DY9YM",
      fetchedAudioLengthMin: undefined,
    });
  });
});

describe("website URL write-back", () => {
  it("writes the production page URL when Notion has nothing yet", () => {
    expect(
      websiteUrlToWrite({ id: "thinking-fast-and-slow", websiteUrl: null }),
    ).toBe("https://books.chappyasel.com/thinking-fast-and-slow");
  });

  it("leaves a property that already names the current page alone", () => {
    expect(
      websiteUrlToWrite({
        id: "thinking-fast-and-slow",
        websiteUrl: "https://books.chappyasel.com/thinking-fast-and-slow",
      }),
    ).toBeNull();
  });

  it("rewrites a URL left behind by a slug change", () => {
    expect(
      websiteUrlToWrite({
        id: "thinking-fast-and-slow",
        websiteUrl: "https://books.chappyasel.com/thinking-fast-and-slow-2011",
      }),
    ).toBe("https://books.chappyasel.com/thinking-fast-and-slow");
  });

  it("replaces a hand-pasted main-domain link with the canonical one", () => {
    expect(
      websiteUrlToWrite({
        id: "thinking-fast-and-slow",
        websiteUrl: "https://chappyasel.com/books/thinking-fast-and-slow",
      }),
    ).toBe("https://books.chappyasel.com/thinking-fast-and-slow");
  });

  it("builds the URL on the production books host regardless of NODE_ENV", () => {
    expect(bookWebsiteUrl("dune")).toBe("https://books.chappyasel.com/dune");
  });
});
