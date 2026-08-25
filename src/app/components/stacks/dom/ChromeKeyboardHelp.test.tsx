// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ChromeKeyboardHelp from "./ChromeKeyboardHelp";

afterEach(cleanup);

describe("ChromeKeyboardHelp", () => {
  it("keeps the mobile wordmark non-interactive and omits shortcut help", () => {
    const onOpen = vi.fn();
    render(
      <ChromeKeyboardHelp
        open={false}
        onOpen={onOpen}
        tapFirst
        fieldNotes={<button type="button">Field Notes</button>}
      />,
    );

    expect(screen.getByText("Chappy Asel").tagName).toBe("SPAN");
    expect(
      screen.queryByRole("button", { name: "Open keyboard shortcuts" }),
    ).toBeNull();
    expect(screen.queryByText("Shortcuts")).toBeNull();
    fireEvent.click(screen.getByText("Chappy Asel"));
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Field Notes" })).toBeTruthy();
  });

  it("keeps both desktop help controls accessible and interactive", () => {
    const onOpen = vi.fn();
    render(
      <ChromeKeyboardHelp
        open
        onOpen={onOpen}
        tapFirst={false}
        fieldNotes={null}
      />,
    );

    const controls = screen.getAllByRole("button", {
      name: "Open keyboard shortcuts",
    });
    expect(controls).toHaveLength(2);
    expect(screen.getByText("Shortcuts")).toBeTruthy();
    expect(
      controls.every(
        (control) => control.getAttribute("aria-expanded") === "true",
      ),
    ).toBe(true);
    fireEvent.click(controls[0]!);
    fireEvent.click(controls[1]!);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
