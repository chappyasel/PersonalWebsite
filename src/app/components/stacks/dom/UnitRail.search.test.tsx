// @vitest-environment jsdom
import { useStacks } from "../store";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { UNIVERSAL_SEARCH_OPEN_ATTRIBUTE } from "~/lib/universal-search/overlay";

import { OPEN_UNIVERSAL_SEARCH_EVENT } from "~/components/universal-search/UniversalSearchController";

import UnitRail from "./UnitRail";

const navigate = vi.hoisted(() => vi.fn(() => true));
vi.mock("../input/RoomNavigation", () => ({
  useRoomNavigation: () => navigate,
}));

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute(UNIVERSAL_SEARCH_OPEN_ATTRIBUTE);
  useStacks.setState(useStacks.getInitialState());
  vi.restoreAllMocks();
  navigate.mockClear();
});

it("moves only the mobile pill to Search while open and returns to the current shelf", async () => {
  useStacks.setState({
    activeUnit: 1,
    unitMapPreview: null,
    golfFocused: false,
  });
  const { container } = render(<UnitRail />);
  const mobile = container.querySelector<HTMLElement>(
    '[data-stacks-rail-indicator="mobile"]',
  )!;
  const desktop = container.querySelector<HTMLElement>(
    '[data-stacks-rail-indicator="desktop"]',
  )!;
  const desktopTop = desktop.style.top;
  const search = within(
    container.querySelector<HTMLElement>(".stacks-unit-rail-mobile")!,
  ).getByRole("button", { name: "Search the site" });
  const shelfLeft = mobile.style.left;

  await act(async () => {
    document.documentElement.setAttribute(UNIVERSAL_SEARCH_OPEN_ATTRIBUTE, "");
  });
  await waitFor(() => expect(parseFloat(mobile.style.left)).toBeCloseTo(-2, 1));
  expect(search.getAttribute("data-active")).toBe("true");
  expect(search.getAttribute("aria-expanded")).toBe("true");
  expect(desktop.style.top).toBe(desktopTop);
  expect(useStacks.getState().activeUnit).toBe(1);

  await act(async () => {
    document.documentElement.removeAttribute(UNIVERSAL_SEARCH_OPEN_ATTRIBUTE);
  });
  await waitFor(() =>
    expect(parseFloat(mobile.style.left)).toBeCloseTo(parseFloat(shelfLeft), 1),
  );
  expect(search.hasAttribute("data-active")).toBe(false);
  expect(search.getAttribute("aria-expanded")).toBe("false");
  expect(desktop.style.top).toBe(desktopTop);
});

it("opens search before About without starting a section swipe", () => {
  const onSearch = vi.fn();
  window.addEventListener(OPEN_UNIVERSAL_SEARCH_EVENT, onSearch);
  try {
    const { container } = render(<UnitRail />);
    const rail = container.querySelector<HTMLElement>(
      ".stacks-unit-rail-mobile",
    )!;
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
