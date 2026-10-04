import { describe, expect, it, vi } from "vitest";

import { musings } from "~/lib/musings/content";
import { musingMetadata } from "~/lib/musings/metadata";

import manualSitemap from "./manual/sitemap";
import routineSitemap from "./routine/sitemap";
import sitemap from "./sitemap";

describe("public sitemap", () => {
  it("lists public entry documents on the main host", () => {
    const urls = sitemap().map((entry) => entry.url);
    for (const path of [
      "/",
      "/manual",
      "/routine",
      "/systems",
      "/musings",
      "/projects",
      "/talks",
    ]) {
      expect(urls).toContain(`https://www.chappyasel.com${path}`);
    }
    expect(
      urls.every((url) => new URL(url).hostname === "www.chappyasel.com"),
    ).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("keeps article URLs consistent with their canonical metadata", () => {
    const urls = sitemap().map((entry) => entry.url);
    for (const article of musings) {
      expect(urls).toContain(musingMetadata(article).alternates?.canonical);
    }
  });

  it("keeps document sitemaps consistent with the main sitemap", () => {
    for (const entry of [...manualSitemap(), ...routineSitemap()]) {
      expect(
        sitemap().find(({ url }) => url === entry.url)?.lastModified,
      ).toEqual(entry.lastModified);
    }
  });

  it("does not report a content edit just because the sitemap regenerated", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const first = sitemap();
      vi.setSystemTime(new Date("2026-02-01T00:00:00Z"));
      expect(sitemap()).toEqual(first);
      for (const entry of first) {
        if (entry.lastModified)
          expect(new Date(entry.lastModified).getTime()).not.toBeNaN();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("excludes private, duplicate, hidden, and unimplemented destinations", () => {
    const urls = sitemap().map((entry) => entry.url);
    for (const path of [
      "/books",
      "/weightlifting",
      "/golf",
      "/about",
      "/dad",
      "/youtube",
      "/personalities",
      "/weight-log",
      "/site-index",
      "/friends",
      "/now",
    ]) {
      expect(urls.some((url) => new URL(url).pathname === path)).toBe(false);
    }
  });
});
