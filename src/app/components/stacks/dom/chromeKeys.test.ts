import { describe, expect, it } from "vitest";

import { chromeKeyIntent, shortcutGroups } from "./chromeKeys";

const base = {
  key: "h",
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  repeat: false,
  defaultPrevented: false,
  editableTarget: false,
} as const;

describe("chrome keyboard", () => {
  it("reads H as hide-all, backslash as the details switch, ? as the sheet", () => {
    expect(chromeKeyIntent(base, false)).toBe("hide-all");
    expect(chromeKeyIntent({ ...base, key: "H" }, true)).toBe("hide-all");
    expect(chromeKeyIntent({ ...base, key: "\\" }, false)).toBe("details");
    expect(chromeKeyIntent({ ...base, key: "?", shiftKey: true }, false)).toBe(
      "sheet",
    );
  });

  it("brings everything back on Escape only while it is all hidden", () => {
    expect(chromeKeyIntent({ ...base, key: "Escape" }, true)).toBe("show-all");
    expect(chromeKeyIntent({ ...base, key: "Escape" }, false)).toBeNull();
  });

  it("stays out of modifiers, repeats, handled events and text fields", () => {
    expect(chromeKeyIntent({ ...base, shiftKey: true }, false)).toBeNull();
    expect(chromeKeyIntent({ ...base, metaKey: true }, false)).toBeNull();
    expect(chromeKeyIntent({ ...base, ctrlKey: true }, false)).toBeNull();
    expect(chromeKeyIntent({ ...base, altKey: true }, false)).toBeNull();
    expect(chromeKeyIntent({ ...base, repeat: true }, false)).toBeNull();
    expect(
      chromeKeyIntent({ ...base, defaultPrevented: true }, false),
    ).toBeNull();
    expect(
      chromeKeyIntent({ ...base, editableTarget: true }, false),
    ).toBeNull();
    expect(chromeKeyIntent({ ...base, key: "u" }, false)).toBeNull();
  });

  it("lists every visitor key the handlers answer to, owner keys only in dev", () => {
    const visitor = shortcutGroups(false);
    expect(visitor).toHaveLength(1);
    const keys = visitor[0]!.rows.flatMap((row) => row.keys);
    expect(keys).toEqual(expect.arrayContaining(["\\", "H", "?", "Esc", "←"]));
    expect(shortcutGroups(true).map((group) => group.title)).toEqual([
      "Keyboard",
      "Owner",
    ]);
  });
});
