/**
 * Fixtures here are captures from the live API on 2026-09-15, not synthetic
 * shapes. An earlier version of this module was tested against flattened
 * objects that the API never sends, which is exactly why it shipped a decoder
 * that returned an undefined id for every real response.
 */
import { describe, expect, it } from "vitest";

import {
  type OwnedIcon,
  decideIcon,
  decodePageIcon,
  describeIcon,
  fileUrlKey,
  iconIdentity,
  sameOwnedIcon,
} from "./iconPolicy";

/** The same attachment, read twice. Only the signed query differs. */
const FILE_READ_ONE = {
  type: "file",
  file: {
    url: "https://prod-files-secure.s3.us-west-2.amazonaws.com/859fbc85-7644-4498-88d8-e0229d8cea32/aae80268-be21-484a-b080-7fb8dfc1dde9/book-the-mom-test.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIAZI2LB466UQDEDEOL%2F20260915%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260915T192438Z&X-Amz-Expires=3600&X-Amz-Signature=ce5b068b51324b7b625f506acd3a15f4cd567116c4a8a14635d4fb15a6817e30",
    expiry_time: "2026-09-15T20:24:38.368Z",
  },
};
const FILE_READ_TWO = {
  type: "file",
  file: {
    url: "https://prod-files-secure.s3.us-west-2.amazonaws.com/859fbc85-7644-4498-88d8-e0229d8cea32/aae80268-be21-484a-b080-7fb8dfc1dde9/book-the-mom-test.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIAZI2LB4663B4PCZJN%2F20260915%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260915T192440Z&X-Amz-Expires=3600&X-Amz-Signature=8b703504cafd4f251376819c336b1314d168cd2cdc071077c4f2643f9840825f",
    expiry_time: "2026-09-15T20:24:40.509Z",
  },
};
const CUSTOM_EMOJI = {
  type: "custom_emoji",
  custom_emoji: {
    id: "3dcc5ab0-d88d-8150-a95e-007aa6804025",
    name: "book-the-mom-test",
    url: "https://s3-us-west-2.amazonaws.com/public.notion-static.com/4dface10-7805-487a-b8d9-fb09c35d5898/1b63ab388443.png",
  },
};

const OURS: OwnedIcon = {
  kind: "file",
  urlKey:
    "https://prod-files-secure.s3.us-west-2.amazonaws.com/859fbc85-7644-4498-88d8-e0229d8cea32/aae80268-be21-484a-b080-7fb8dfc1dde9/book-the-mom-test.png",
};

describe("decoding the shapes the API really sends", () => {
  it("reads a file icon, a custom emoji, and a plain emoji", () => {
    expect(decodePageIcon(FILE_READ_ONE)).toEqual({
      type: "file",
      url: FILE_READ_ONE.file.url,
    });
    expect(decodePageIcon(CUSTOM_EMOJI)).toMatchObject({
      type: "custom_emoji",
      id: "3dcc5ab0-d88d-8150-a95e-007aa6804025",
    });
    expect(decodePageIcon({ type: "emoji", emoji: "📕" })).toEqual({
      type: "emoji",
      emoji: "📕",
    });
    expect(decodePageIcon(null)).toBeNull();
    // A nested object without the field that identifies it is not an icon.
    expect(decodePageIcon({ type: "custom_emoji", custom_emoji: {} })).toBeNull();
  });
});

describe("identity survives the signed URL rotating", () => {
  it("treats two reads of one attachment as the same icon", () => {
    const first = iconIdentity(decodePageIcon(FILE_READ_ONE));
    const second = iconIdentity(decodePageIcon(FILE_READ_TWO));
    expect(first).toEqual(OURS);
    expect(sameOwnedIcon(first, second)).toBe(true);
    // The whole URLs are genuinely different, so this is not a tautology.
    expect(FILE_READ_ONE.file.url).not.toBe(FILE_READ_TWO.file.url);
  });

  it("refuses to give an unparsable URL an identity", () => {
    expect(fileUrlKey("not a url")).toBeNull();
    expect(iconIdentity({ type: "file", url: "not a url" })).toBeNull();
    expect(sameOwnedIcon(null, null)).toBe(false);
  });

  it("never confuses a file with a custom emoji", () => {
    expect(
      sameOwnedIcon(OURS, { kind: "custom_emoji", id: OURS.urlKey }),
    ).toBe(false);
  });
});

describe("who is allowed to change an icon", () => {
  const target = OURS;

  it("leaves a page alone once it already wears the target", () => {
    expect(decideIcon(decodePageIcon(FILE_READ_TWO), target, target)).toEqual({
      action: "skip",
      reason: "already-correct",
    });
  });

  it("backfills a page with no icon or an ordinary one", () => {
    for (const icon of [
      null,
      { type: "emoji", emoji: "📗" },
      { type: "external", external: { url: "https://example.com/a.png" } },
      { type: "icon", icon: { name: "pizza", color: "blue" } },
    ]) {
      expect(decideIcon(decodePageIcon(icon), null, null).action).toBe("apply");
    }
  });

  it("stands down on an image icon it has no record of setting", () => {
    // The workspace being full of book emoji proves nothing about this page.
    expect(decideIcon(decodePageIcon(CUSTOM_EMOJI), null, null)).toEqual({
      action: "skip",
      reason: "unknown-image-icon",
    });
    expect(decideIcon(decodePageIcon(FILE_READ_ONE), null, null)).toEqual({
      action: "skip",
      reason: "unknown-image-icon",
    });
  });

  it("replaces an icon it set itself, including one from the browser era", () => {
    const legacy: OwnedIcon = {
      kind: "custom_emoji",
      id: "3dcc5ab0-d88d-8150-a95e-007aa6804025",
    };
    expect(decideIcon(decodePageIcon(CUSTOM_EMOJI), null, legacy)).toEqual({
      action: "apply",
      reason: "automation-owned",
    });
  });

  it("stops touching a page a person has changed", () => {
    const ourOldIcon: OwnedIcon = { kind: "file", urlKey: "https://x/y/old.png" };
    expect(decideIcon(decodePageIcon({ type: "emoji", emoji: "🔥" }), target, ourOldIcon)).toEqual({
      action: "skip",
      reason: "changed-by-hand",
    });
    expect(decideIcon(decodePageIcon(CUSTOM_EMOJI), target, ourOldIcon)).toEqual({
      action: "skip",
      reason: "changed-by-hand",
    });
  });
});

it("describes an icon without leaking a signed URL", () => {
  const described = describeIcon(decodePageIcon(FILE_READ_ONE));
  expect(described).toBe(`file:${OURS.urlKey}`);
  expect(described).not.toContain("X-Amz-Signature");
  expect(describeIcon(null)).toBe("none");
});
