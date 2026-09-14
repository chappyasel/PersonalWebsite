// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ChromeKeyboard from "./ChromeKeyboard";
import { chromeHidden, setChromeHidden } from "./chromeKeys";

afterEach(() => {
  cleanup();
  setChromeHidden(false);
});

describe("ChromeKeyboard", () => {
  it("opens shortcut help with ? without mounting an overlay", () => {
    const onOpenChange = vi.fn();
    const { container } = render(
      <ChromeKeyboard open={false} onOpenChange={onOpenChange} />,
    );
    fireEvent.keyDown(window, { key: "?" });
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(container.childElementCount).toBe(0);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dismisses help with Escape and retains the hide/show shortcuts", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <ChromeKeyboard open onOpenChange={onOpenChange} />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(<ChromeKeyboard open={false} onOpenChange={onOpenChange} />);
    fireEvent.keyDown(window, { key: "h" });
    expect(chromeHidden()).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(chromeHidden()).toBe(false);
  });
});
