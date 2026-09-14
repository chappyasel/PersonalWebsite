// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStacks } from "../store";
import UnitRail from "./UnitRail";

vi.mock("../input/RoomNavigation", () => ({
  useRoomNavigation: () => () => true,
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/#books");
  useStacks.setState({
    activeUnit: 1,
    golfFocused: false,
    golfStop: false,
    unitMapPreview: null,
  });
});

afterEach(() => {
  cleanup();
  useStacks.setState(useStacks.getInitialState());
});

describe("golf navigation marker", () => {
  it.each(["desktop", "mobile"])(
    "shows the %s golf ball at the canonical /golf route",
    (layout) => {
      window.history.replaceState(null, "", "/golf");
      useStacks.setState({ golfFocused: true, golfStop: true });
      const { container } = render(<UnitRail />);
      const marker = container.querySelector<HTMLElement>(
        `[data-stacks-rail-indicator="${layout}"]`,
      )!;
      expect(marker.getAttribute("data-stacks-golf-ball")).toBe("true");
      expect(marker.style.width).toBe(
        layout === "desktop" ? "0.75rem" : "0.75em",
      );
      expect(marker.style.height).toBe(marker.style.width);

      act(() => useStacks.getState().setUnitMapPreview(2));
      expect(marker.hasAttribute("data-stacks-golf-ball")).toBe(false);
      act(() => useStacks.getState().setUnitMapPreview(null));
      expect(marker.getAttribute("data-stacks-golf-ball")).toBe("true");
    },
  );

  it.each(["desktop", "mobile"])(
    "morphs the %s pill when golf mode changes without changing the URL",
    (layout) => {
      const { container } = render(<UnitRail />);
      const marker = container.querySelector<HTMLElement>(
        `[data-stacks-rail-indicator="${layout}"]`,
      )!;
      expect(marker.hasAttribute("data-stacks-golf-ball")).toBe(false);

      act(() => useStacks.getState().setGolfFocused(true));
      expect(window.location.hash).toBe("#books");
      expect(marker.getAttribute("data-stacks-golf-ball")).toBe("true");

      act(() => useStacks.getState().setGolfFocused(false));
      expect(marker.hasAttribute("data-stacks-golf-ball")).toBe(false);
    },
  );
});
