// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Count, SwapText } from "./rolling-text";

/** The text a screen reader reaches: everything outside aria-hidden. */
function spoken(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  for (const hidden of clone.querySelectorAll("[aria-hidden]")) hidden.remove();
  return clone.textContent ?? "";
}

describe("SwapText", () => {
  afterEach(cleanup);

  it("paints still at first", () => {
    const { container } = render(<SwapText text="2:30 PM - 3:00 PM" />);
    expect(container.querySelector("[data-rolling]")).toBeNull();
    expect(spoken(container)).toBe("2:30 PM - 3:00 PM");
  });

  it("rolls a change, and a screen reader reads only the new text", () => {
    const { container, rerender } = render(<SwapText text="2:30 PM" />);
    rerender(<SwapText text="2:45 PM" />);
    const rolling = container.querySelector("[data-rolling]");
    expect(rolling?.getAttribute("aria-hidden")).toBe("true");
    expect(spoken(container)).toBe("2:45 PM");
  });

  it("only the characters that differ turn when the words stay", () => {
    const { container, rerender } = render(<SwapText text="Nov 3 - 9" />);
    rerender(<SwapText text="Nov 10 - 16" />);
    const turning = [
      ...container.querySelectorAll<HTMLElement>("[data-glyph]"),
    ].map((glyph) => glyph.textContent);
    // "3" leaves for "10" and "9" for "16"; "Nov ", " - " stay.
    expect(
      turning.filter((char) => char !== null && /^\d$/.test(char)).sort(),
    ).toEqual(["0", "1", "1", "3", "6", "9"]);
  });

  it("fades in from no text instead of rolling", () => {
    const { container, rerender } = render(<SwapText text="" />);
    rerender(<SwapText text="Nov 3 - 9" />);
    expect(container.querySelector("[data-rolling]")).toBeNull();
    expect(spoken(container)).toBe("Nov 3 - 9");
  });
});

describe("Count", () => {
  afterEach(cleanup);

  it("formats its value and rolls a change", () => {
    const { container, rerender } = render(<Count value={999} />);
    expect(spoken(container)).toBe("999");
    rerender(<Count value={1000} />);
    expect(container.querySelector("[data-rolling]")).not.toBeNull();
    expect(spoken(container)).toBe("1,000");
  });
});
