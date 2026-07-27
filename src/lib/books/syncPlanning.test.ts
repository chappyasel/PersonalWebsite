import { describe, expect, it } from "vitest";

import {
  mergeAudibleMetadata,
  shouldFetchBookContent,
  shouldLookupAudibleMetadata,
} from "./syncPlanning";

const EDITED_AT = new Date("2026-07-26T23:43:00.000Z");
const DIRECT_COVER = "https://m.media-amazon.com/images/I/712TbrMYeDL.jpg";

describe("book sync planning", () => {
  it("reprocesses an unchanged book with a manual runtime but no Audible URL", () => {
    expect(
      shouldFetchBookContent(EDITED_AT, EDITED_AT, {
        audioLengthMin: 385,
        audibleUrl: null,
        coverUrl: DIRECT_COVER,
      }),
    ).toBe(true);
  });

  it("does not reprocess complete Audible metadata", () => {
    expect(
      shouldFetchBookContent(EDITED_AT, EDITED_AT, {
        audioLengthMin: 385,
        audibleUrl: "https://www.audible.com/pd/B07R7DY9YM",
        coverUrl: DIRECT_COVER,
      }),
    ).toBe(false);
  });

  it("still reprocesses an unchanged book with an invalid cover", () => {
    expect(
      shouldFetchBookContent(EDITED_AT, EDITED_AT, {
        audioLengthMin: 385,
        audibleUrl: "https://www.audible.com/pd/B07R7DY9YM",
        coverUrl:
          "https://www.amazon.com/Right-Many-Ideas-Yours-Succeed/dp/0062958232",
      }),
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
