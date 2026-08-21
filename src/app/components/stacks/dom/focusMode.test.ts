import { describe, expect, it } from "vitest";

import {
  FOCUS_SESSION_KEY,
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
});
