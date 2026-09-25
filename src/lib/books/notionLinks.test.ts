import { describe, expect, it } from "vitest";

import {
  notionPageIdFromUrl,
  notionPageIdsIn,
  rewriteNotionBookLinks,
} from "./notionLinks";

const CHATTER = "4a509375-7643-463b-b69c-a064165ba73a";
const DILEMMAS = "c6e7a26a-119a-4db0-88db-faa4059ac81f";

describe("notionPageIdFromUrl", () => {
  it("reads a page mention's app.notion.com address", () => {
    expect(
      notionPageIdFromUrl(
        "https://app.notion.com/p/4a5093757643463bb69ca064165ba73a",
      ),
    ).toBe(CHATTER);
  });

  it("reads a titled notion.so address and ignores its query", () => {
    expect(
      notionPageIdFromUrl(
        "https://www.notion.so/Chatter-4a5093757643463bb69ca064165ba73a?pvs=21",
      ),
    ).toBe(CHATTER);
  });

  it("reads a dashed ID on a notion.site address", () => {
    expect(notionPageIdFromUrl(`https://chappy.notion.site/${CHATTER}`)).toBe(
      CHATTER,
    );
  });

  it("does not mistake a database view for the page", () => {
    expect(
      notionPageIdFromUrl(
        "https://www.notion.so/workspace?v=4a5093757643463bb69ca064165ba73a",
      ),
    ).toBeNull();
  });
});

describe("notionPageIdsIn", () => {
  it("collects each linked page once", () => {
    const notes = [
      "- See [Chatter](https://app.notion.com/p/4a5093757643463bb69ca064165ba73a)",
      "- And [again](https://app.notion.com/p/4a5093757643463bb69ca064165ba73a)",
      "- [The Founder’s Dilemmas](https://app.notion.com/p/c6e7a26a119a4db088dbfaa4059ac81f)",
    ].join("\n");
    expect(notionPageIdsIn(notes)).toEqual([CHATTER, DILEMMAS]);
  });

  it("finds nothing in notes without Notion links", () => {
    expect(notionPageIdsIn("[Site](https://chappyasel.com)")).toEqual([]);
  });
});

describe("rewriteNotionBookLinks", () => {
  const slugs = new Map([[CHATTER, "chatter"]]);

  it("points a mirrored book at its page on the site", () => {
    expect(
      rewriteNotionBookLinks(
        "Read [Chatter](https://app.notion.com/p/4a5093757643463bb69ca064165ba73a).",
        slugs,
      ),
    ).toBe("Read [Chatter](https://books.chappyasel.com/chatter).");
  });

  it("leaves a page the library does not mirror on Notion", () => {
    const notes =
      "[Dilemmas](https://app.notion.com/p/c6e7a26a119a4db088dbfaa4059ac81f)";
    expect(rewriteNotionBookLinks(notes, slugs)).toBe(notes);
  });
});
