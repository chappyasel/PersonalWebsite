import { describe, expect, it } from "vitest";

import { shouldUseModalEnterShortcut } from "./modalKeyboard";

const event = (
  overrides: Partial<Parameters<typeof shouldUseModalEnterShortcut>[0]> = {},
) => ({
  key: "Enter",
  defaultPrevented: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  target: { closest: () => null } as unknown as EventTarget,
  ...overrides,
});

describe("modal Enter shortcut", () => {
  it("opens from non-interactive dialog content", () => {
    expect(shouldUseModalEnterShortcut(event())).toBe(true);
  });

  it("leaves Enter with focused controls and handled events", () => {
    const control = {
      closest: (selector: string) =>
        selector.includes("button") ? ({} as Element) : null,
    } as unknown as EventTarget;

    expect(shouldUseModalEnterShortcut(event({ target: control }))).toBe(false);
    expect(shouldUseModalEnterShortcut(event({ defaultPrevented: true }))).toBe(
      false,
    );
    expect(shouldUseModalEnterShortcut(event({ metaKey: true }))).toBe(false);
  });
});
