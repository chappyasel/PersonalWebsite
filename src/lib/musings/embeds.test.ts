import { describe, expect, it } from "vitest";

import { musingEmbed } from "./embeds";

describe("article embeds", () => {
  it.each([
    "https://x.com/karpathy/status/12345?s=20",
    "https://twitter.com/karpathy/status/12345/photo/1",
    "https://mobile.twitter.com/i/web/status/12345",
  ])("recognizes a post at %s", (url) => {
    expect(musingEmbed(url)).toEqual({
      provider: "x",
      id: "12345",
      url: "https://x.com/i/web/status/12345",
    });
  });

  it.each([
    "https://youtu.be/dQw4w9WgXcQ?t=42",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=42",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42",
  ])("uses a privacy-enhanced player for %s", (url) => {
    expect(musingEmbed(url)).toMatchObject({
      provider: "youtube",
      id: "dQw4w9WgXcQ",
      src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42",
    });
  });

  it.each([
    "javascript:alert(1)",
    "https://x.com.evil.test/person/status/123",
    "https://x.com@evil.test/person/status/123",
    "https://user:password@x.com/person/status/123",
    "https://x.com/person",
    "https://example.com/embed/123",
    "https://youtube.com/watch?v=invalid",
    "https://youtube.com/playlist?list=123",
  ])("leaves unsupported URLs as links: %s", (url) => {
    expect(musingEmbed(url)).toBeNull();
  });
});
