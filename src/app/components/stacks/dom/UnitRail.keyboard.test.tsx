// @vitest-environment jsdom
import { useStacks } from "../store";
import { cleanup, render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import UnitRail from "./UnitRail";

const navigate = vi.hoisted(() => vi.fn(() => true));
vi.mock("../input/RoomNavigation", () => ({
  useRoomNavigation: () => navigate,
}));

afterEach(() => {
  cleanup();
  useStacks.setState(useStacks.getInitialState());
  navigate.mockClear();
});

it.each([0, 3, 6])(
  "tabs through every desktop section in both directions with section %s selected",
  async (activeUnit) => {
    useStacks.setState({ activeUnit });
    const user = userEvent.setup();
    const { container, getByText } = render(
      <>
        {/* jsdom does not apply Tailwind's responsive visibility utilities. */}
        <style>{`.stacks-unit-rail-mobile { display: none; }`}</style>
        <button>Before navigation</button>
        <UnitRail />
        <button>After navigation</button>
      </>,
    );
    const rail = container.querySelector<HTMLElement>(
      ".stacks-unit-rail-desktop",
    )!;
    const buttons = within(rail).getAllByRole("button");
    const before = getByText("Before navigation");
    const after = getByText("After navigation");
    before.focus();
    for (const button of [...buttons, after]) {
      await user.tab();
      expect(document.activeElement).toBe(button);
    }
    for (const button of [...buttons]
      .reverse()
      .concat(before as HTMLButtonElement)) {
      await user.tab({ shift: true });
      expect(document.activeElement).toBe(button);
    }
    expect(navigate).not.toHaveBeenCalled();
    expect(useStacks.getState().activeUnit).toBe(activeUnit);
    buttons[1]!.focus();
    await user.keyboard("{Enter}");
    expect(navigate).toHaveBeenCalledWith(1);
  },
);
