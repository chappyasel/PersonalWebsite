import { decideIcon, decodePageIcon, describeIcon } from "./iconPolicy";
import { describe, expect, it } from "vitest";

/**
 * Captured from the live API on 2026-09-15 with notion-version 2026-03-11.
 * These are the real wire shapes, not hand-written approximations: the bug
 * this file exists to prevent was a decoder written against a flattened
 * fixture that the API never sends.
 */
const REAL_CUSTOM_EMOJI_ICON = {
  type: "custom_emoji",
  custom_emoji: {
    id: "3d4c5ab0-d88d-810f-8d95-007add269d1a",
    name: "hermes",
    url: "https://s3-us-west-2.amazonaws.com/public.notion-static.com/0ee72101-5a9f-4a71-a4d2-3604a605b625/ff5c5acf-48f7-4e63-9432-5bb944fb84de.png",
  },
};

const REAL_EMOJI_ICON = { type: "emoji", emoji: "🎓" };

describe("decoding real API icons", () => {
  it("lifts the id out of the nested custom_emoji object", () => {
    const decoded = decodePageIcon(REAL_CUSTOM_EMOJI_ICON);
    expect(decoded).toEqual({
      type: "custom_emoji",
      id: "3d4c5ab0-d88d-810f-8d95-007add269d1a",
      name: "hermes",
      url: REAL_CUSTOM_EMOJI_ICON.custom_emoji.url,
    });
  });

  it("decodes the ordinary emoji icon the book database actually carries", () => {
    expect(decodePageIcon(REAL_EMOJI_ICON)).toEqual({ type: "emoji", emoji: "🎓" });
  });

  it("treats a null icon as no icon, which is 327 of the 328 book pages", () => {
    expect(decodePageIcon(null)).toBeNull();
    expect(decodePageIcon(undefined)).toBeNull();
  });

  it("decodes external and file_upload icons", () => {
    expect(decodePageIcon({ type: "external", external: { url: "https://x/y.png" } })).toEqual({
      type: "external",
      url: "https://x/y.png",
    });
    expect(decodePageIcon({ type: "file_upload", file_upload: { id: "fu1" } })).toEqual({
      type: "file_upload",
      id: "fu1",
    });
  });

  it("returns null rather than a half-decoded icon when the shape is wrong", () => {
    expect(decodePageIcon({ type: "custom_emoji" })).toBeNull();
    expect(decodePageIcon({ type: "custom_emoji", custom_emoji: {} })).toBeNull();
    expect(decodePageIcon({ type: "something_new" })).toBeNull();
    expect(decodePageIcon("emoji")).toBeNull();
  });

  it("never yields an undefined id, which is what broke every readback", () => {
    const decoded = decodePageIcon(REAL_CUSTOM_EMOJI_ICON);
    expect(decoded?.type).toBe("custom_emoji");
    if (decoded?.type === "custom_emoji") expect(decoded.id).toBeTruthy();
  });
});

describe("the policy running on real decoded icons", () => {
  const ours = "3d4c5ab0-d88d-810f-8d95-007add269d1a";

  it("recognizes its own emoji on a readback instead of always failing", () => {
    const decoded = decodePageIcon(REAL_CUSTOM_EMOJI_ICON);
    expect(decideIcon(decoded, ours, ours)).toEqual({
      action: "skip",
      reason: "already-correct",
    });
  });

  it("backfills the 327 pages that have no icon at all", () => {
    expect(decideIcon(decodePageIcon(null), "target", null)).toEqual({
      action: "apply",
      reason: "backfill",
    });
  });

  it("backfills the one page carrying an ordinary emoji", () => {
    expect(decideIcon(decodePageIcon(REAL_EMOJI_ICON), "target", null)).toEqual({
      action: "apply",
      reason: "backfill",
    });
  });

  it("records the real previous icon for the receipt", () => {
    expect(describeIcon(decodePageIcon(REAL_EMOJI_ICON))).toBe("emoji:🎓");
    expect(describeIcon(decodePageIcon(REAL_CUSTOM_EMOJI_ICON))).toBe(
      `custom_emoji:${ours}`,
    );
  });
});
