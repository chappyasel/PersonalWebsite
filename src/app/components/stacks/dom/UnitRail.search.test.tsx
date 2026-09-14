// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { OPEN_UNIVERSAL_SEARCH_EVENT } from "~/components/universal-search/UniversalSearchController";

import UnitRail from "./UnitRail";

const navigate = vi.hoisted(() => vi.fn(() => true));
vi.mock("../input/RoomNavigation", () => ({
  useRoomNavigation: () => navigate,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  navigate.mockClear();
});

it("opens search before About without starting a section swipe", () => {
  const onSearch = vi.fn();
  window.addEventListener(OPEN_UNIVERSAL_SEARCH_EVENT, onSearch);
  try {
    const { container } = render(<UnitRail />);
    const rail = container.querySelector<HTMLElement>(".stacks-unit-rail-mobile")!;
    const buttons = within(rail).getAllByRole("button");
    expect(buttons[0]?.getAttribute("aria-label")).toBe("Search the site");
    expect(buttons[1]?.getAttribute("aria-label")).toBe("About");
    const sections = buttons[1]!.parentElement!;
    const capture = vi.fn();
    sections.setPointerCapture = capture;
    fireEvent.pointerDown(buttons[0]!, { pointerType: "touch", pointerId: 1 });
    fireEvent.pointerUp(buttons[0]!, { pointerType: "touch", pointerId: 1 });
    fireEvent.click(buttons[0]!);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(sections.contains(buttons[0]!)).toBe(false);
  } finally {
    window.removeEventListener(OPEN_UNIVERSAL_SEARCH_EVENT, onSearch);
  }
});
