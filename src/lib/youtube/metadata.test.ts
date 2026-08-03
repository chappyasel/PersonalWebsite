import { describe, expect, it } from "vitest";

import {
  isBareYouTubeUrl,
  parseDuration,
  parseYouTubeVideoMetadata,
  preferCanonicalMetadata,
} from "./metadata";

describe("YouTube metadata", () => {
  it("parses full ISO durations without silently capping long videos", () => {
    expect(parseDuration("PT1H2M10S")).toBe(3730);
    expect(parseDuration("PT43S")).toBe(43);
    expect(
      parseYouTubeVideoMetadata({
        id: "abcdefghijk",
        contentDetails: { duration: "PT2H" },
      }).durationSeconds,
    ).toBe(7200);
  });

  it("keeps rich snippet metadata and prefers the largest thumbnail", () => {
    expect(
      parseYouTubeVideoMetadata({
        id: "abcdefghijk",
        snippet: {
          title: "A cheerful build",
          channelId: "UC-builder",
          channelTitle: "Builder",
          description: "A friendly description",
          categoryId: "20",
          tags: ["minecraft", "building"],
          thumbnails: {
            default: { url: "small.jpg", width: 120, height: 90 },
            maxres: { url: "large.jpg", width: 1280, height: 720 },
          },
        },
        contentDetails: {
          duration: "PT10M",
          caption: "true",
          definition: "hd",
        },
        statistics: { viewCount: "123", likeCount: "12" },
        topicDetails: { topicCategories: ["https://example.com/Gaming"] },
      }),
    ).toEqual({
      youtubeChannelId: "UC-builder",
      title: "A cheerful build",
      channelName: "Builder",
      description: "A friendly description",
      thumbnailUrl: "large.jpg",
      durationSeconds: 600,
      categoryId: 20,
      topicCategories: '["https://example.com/Gaming"]',
      tags: '["minecraft","building"]',
      viewCount: 123,
      likeCount: 12,
      hasCaptions: true,
      definition: "hd",
    });
  });

  it("repairs only missing or unusable stored labels", () => {
    expect(
      isBareYouTubeUrl("https://www.youtube.com/watch?v=abcdefghijk"),
    ).toBe(true);
    expect(preferCanonicalMetadata(null, "Canonical title")).toBe(
      "Canonical title",
    );
    expect(
      preferCanonicalMetadata(
        "https://www.youtube.com/watch?v=abcdefghijk",
        "Canonical title",
      ),
    ).toBe("Canonical title");
    expect(preferCanonicalMetadata("Historical title", "Canonical title")).toBe(
      "Historical title",
    );
  });
});
