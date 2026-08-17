import { describe, expect, it } from "vitest";

import sitemap from "./sitemap";

describe("public sitemap", () => {
  it("keeps the shareable golf route hidden from discovery", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.some((url) => new URL(url).pathname === "/golf")).toBe(false);
  });
});
