import { describe, expect, it } from "vitest";

import {
  FOCUS_SESSION_KEY,
  ignoresFocusShortcut,
  readFocusMode,
  writeFocusMode,
} from "./focusMode";

describe("desktop focus mode", () => {
  it("round-trips through session-shaped storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(readFocusMode(storage)).toBe(false);
    writeFocusMode(storage, true);
    expect(values.get(FOCUS_SESSION_KEY)).toBe("1");
    expect(readFocusMode(storage)).toBe(true);
  });

  it("guards form fields, buttons, and editable descendants", () => {
    let receivedSelector = "";
    const guarded = {
      closest: (selector: string) => {
        receivedSelector = selector;
        return {};
      },
    } as unknown as EventTarget;
    const ordinary = { closest: () => null } as unknown as EventTarget;
    expect(ignoresFocusShortcut(guarded)).toBe(true);
    expect(receivedSelector).toContain("input");
    expect(receivedSelector).toContain("[contenteditable]");
    expect(ignoresFocusShortcut(ordinary)).toBe(false);
    expect(ignoresFocusShortcut(null)).toBe(false);
  });
});
