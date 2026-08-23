import { describe, expect, it, vi } from "vitest";

import { runCommandAction } from "./actions";

describe("Universal Search actions", () => {
  it.each([
    ["theme-light", "light"],
    ["theme-dark", "dark"],
    ["theme-system", "system"],
  ] as const)("dispatches %s", (actionId, expected) => {
    const setTheme = vi.fn();

    runCommandAction(actionId, {
      setTheme,
      setFont: vi.fn(),
      clearRecents: vi.fn(),
    });

    expect(setTheme).toHaveBeenCalledWith(expected);
  });

  it.each([
    ["font-georgia", "georgia"],
    ["font-literata", "literata"],
    ["font-system", "system"],
  ] as const)("dispatches %s", (actionId, expected) => {
    const setFont = vi.fn();

    runCommandAction(actionId, {
      setTheme: vi.fn(),
      setFont,
      clearRecents: vi.fn(),
    });

    expect(setFont).toHaveBeenCalledWith(expected);
  });

  it("clears Recent results", () => {
    const clearRecents = vi.fn();

    runCommandAction("recents-clear", {
      setTheme: vi.fn(),
      setFont: vi.fn(),
      clearRecents,
    });

    expect(clearRecents).toHaveBeenCalledOnce();
  });
});
