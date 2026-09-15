import { decideIcon, describeIcon } from "./iconPolicy";
import { describe, expect, it } from "vitest";

const TARGET = "emoji-new";
const OURS = "emoji-ours";

describe("decideIcon", () => {
  it("replaces an ordinary icon on the first pass", () => {
    expect(decideIcon({ type: "emoji", emoji: "📕" }, TARGET, null)).toEqual({
      action: "apply",
      reason: "backfill",
    });
    expect(decideIcon(null, TARGET, null)).toEqual({
      action: "apply",
      reason: "backfill",
    });
  });

  it("does nothing when the page already carries the right emoji", () => {
    expect(
      decideIcon({ type: "custom_emoji", id: TARGET }, TARGET, OURS),
    ).toEqual({ action: "skip", reason: "already-correct" });
  });

  it("updates its own earlier emoji when the artwork moves", () => {
    expect(
      decideIcon({ type: "custom_emoji", id: OURS }, TARGET, OURS),
    ).toEqual({ action: "apply", reason: "automation-owned" });
  });

  it("leaves an icon a person changed by hand", () => {
    // We set OURS last time; the page now shows something else entirely.
    expect(decideIcon({ type: "emoji", emoji: "🔥" }, TARGET, OURS)).toEqual({
      action: "skip",
      reason: "changed-by-hand",
    });
    expect(
      decideIcon({ type: "custom_emoji", id: "someone-elses" }, TARGET, OURS),
    ).toEqual({ action: "skip", reason: "changed-by-hand" });
    expect(decideIcon(null, TARGET, OURS)).toEqual({
      action: "skip",
      reason: "changed-by-hand",
    });
  });

  it("treats an uploaded image icon as somebody else's once we own a page", () => {
    expect(
      decideIcon({ type: "file_upload", id: "f1" }, TARGET, OURS),
    ).toEqual({ action: "skip", reason: "changed-by-hand" });
  });

  it("records what was there before, for the receipt", () => {
    expect(describeIcon(null)).toBe("none");
    expect(describeIcon({ type: "emoji", emoji: "📕" })).toBe("emoji:📕");
    expect(describeIcon({ type: "custom_emoji", id: "abc" })).toBe("custom_emoji:abc");
    expect(describeIcon({ type: "external", url: "https://x" })).toBe("external");
  });
});

describe("ownership after local state is lost", () => {
  // The library holds every custom emoji in the workspace, 38 of which are
  // personal and nothing to do with books. Treating any of them as ours was
  // the bug: a page wearing one read as automation-owned and would have been
  // overwritten. Ownership now comes only from this page's own record.

  it("stands down on a custom emoji it has no record of setting", () => {
    expect(decideIcon({ type: "custom_emoji", id: "hermes" }, "ours-new", null)).toEqual({
      action: "skip",
      reason: "unknown-custom-icon",
    });
  });

  it("stands down even on an emoji whose name looks like ours", () => {
    // A name prefix proves nothing about who set the icon.
    expect(
      decideIcon(
        { type: "custom_emoji", id: "x1", name: "book-the-body" },
        "ours-new",
        null,
      ),
    ).toEqual({ action: "skip", reason: "unknown-custom-icon" });
  });

  it("still backfills the pages the snapshot showed: none, or an ordinary emoji", () => {
    expect(decideIcon(null, "ours-new", null)).toEqual({
      action: "apply",
      reason: "backfill",
    });
    expect(decideIcon({ type: "emoji", emoji: "🎓" }, "ours-new", null)).toEqual({
      action: "apply",
      reason: "backfill",
    });
  });

  it("recognizes its own emoji when the record survives", () => {
    expect(
      decideIcon({ type: "custom_emoji", id: "ours-old" }, "ours-new", "ours-old"),
    ).toEqual({ action: "apply", reason: "automation-owned" });
  });

  it("leaves a page alone once someone has changed it", () => {
    expect(
      decideIcon({ type: "custom_emoji", id: "someone-else" }, "ours-new", "ours-old"),
    ).toEqual({ action: "skip", reason: "changed-by-hand" });
  });
});

describe("a page that merely failed", () => {
  // A failed record carries an empty emojiId. Passing that through
  // `record?.emojiId ?? null` yielded "" rather than null, which is not
  // nullish, so decideIcon took the "we own this" branch, saw a different
  // icon, and concluded a person had changed it. One transient 500 and the
  // page was never touched again.
  it("is not mistaken for a manual edit when ownership is absent", () => {
    expect(decideIcon(null, "ours-new", null)).toEqual({
      action: "apply",
      reason: "backfill",
    });
  });

  it("would have been misread had an empty id been treated as ownership", () => {
    // Documents the shape of the old bug: "" must never reach this argument.
    expect(decideIcon(null, "ours-new", "")).toEqual({
      action: "skip",
      reason: "changed-by-hand",
    });
  });
});
