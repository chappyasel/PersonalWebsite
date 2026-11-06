import { describe, expect, it } from "vitest";

import { meetPath, meetRedirects, meetRewrites } from "./meetRoutes";

describe("Booking link addresses", () => {
  it("puts each calendar's links under its own address", () => {
    expect(meetPath("meet")).toBe("/meet");
    expect(meetPath("15")).toBe("/meet/15");
    expect(meetPath("60")).toBe("/meet/60");
    expect(meetPath("aic")).toBe("/aic");
    expect(meetPath("aic-15")).toBe("/aic/15");
    expect(meetPath("personal-60")).toBe("/personal/60");
    expect(meetPath("aic-45")).toBe("/meet/aic-45");
  });

  it("serves each group address from /meet/[slug]", () => {
    expect(meetRewrites()).toEqual([
      { source: "/aic", destination: "/meet/aic" },
      { source: "/aic/15", destination: "/meet/aic-15" },
      { source: "/aic/60", destination: "/meet/aic-60" },
      { source: "/personal", destination: "/meet/personal" },
      { source: "/personal/15", destination: "/meet/personal-15" },
      { source: "/personal/60", destination: "/meet/personal-60" },
    ]);
  });

  it("sends the old /meet addresses to the new ones, never back", () => {
    const redirects = meetRedirects();
    expect(redirects).toContainEqual({
      source: "/meet/aic",
      destination: "/aic",
      permanent: false,
    });
    expect(redirects).toContainEqual({
      source: "/meet/cr",
      destination: "/meet",
      permanent: false,
    });
    // A rewrite's source is never a redirect's, so neither undoes the other.
    const sources = new Set(redirects.map((r) => r.source));
    for (const rewrite of meetRewrites()) {
      expect(sources.has(rewrite.source)).toBe(false);
      expect(redirects.some((r) => r.destination === rewrite.destination)).toBe(false);
    }
  });
});
