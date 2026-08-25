import { describe, expect, it } from "vitest";

import { fieldNotesShortcutIntent } from "./shortcut";

const press = (
  overrides: Partial<Parameters<typeof fieldNotesShortcutIntent>[0]> = {},
) => ({
  key: "f",
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  repeat: false,
  defaultPrevented: false,
  editableTarget: false,
  ...overrides,
});

describe("the F shortcut", () => {
  it("toggles the collection on a bare press", () => {
    expect(fieldNotesShortcutIntent(press())).toBe("toggle");
  });

  it("accepts an uppercase key from a stuck caps lock", () => {
    expect(fieldNotesShortcutIntent(press({ key: "F" }))).toBe("toggle");
  });

  it.each([
    ["a held key repeating at the OS rate", { repeat: true }],
    ["another handler already claimed it", { defaultPrevented: true }],
    ["it is a browser shortcut", { metaKey: true }],
    ["it is a browser shortcut", { ctrlKey: true }],
    ["it is a browser shortcut", { altKey: true }],
    ["Shift means something else is being asked for", { shiftKey: true }],
    ["someone is typing the letter f", { editableTarget: true }],
    ["it is not the f key", { key: "g" }],
  ])("ignores the keystroke when %s", (_reason, overrides) => {
    expect(fieldNotesShortcutIntent(press(overrides))).toBeNull();
  });
});
