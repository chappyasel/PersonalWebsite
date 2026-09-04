import { describe, expect, it } from "vitest";

import { siteIconFrame, siteIconImageMetadata } from "./siteIconSizes";

describe("site icon sizes", () => {
  it("map ids to pixels and fall back to the tab", () => {
    expect(siteIconFrame("tab")).toBe(64);
    expect(siteIconFrame("app")).toBe(180);
    expect(siteIconFrame("poster")).toBe(64);
  });

  it("list both PNG variants for generateImageMetadata", () => {
    expect(siteIconImageMetadata()).toEqual([
      { id: "tab", size: { width: 64, height: 64 }, contentType: "image/png" },
      { id: "app", size: { width: 180, height: 180 }, contentType: "image/png" },
    ]);
  });
});
