// @vitest-environment jsdom
import { HashIcon } from "@phosphor-icons/react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import Link from "next/link";
import { afterEach, expect, it, vi } from "vitest";

import { TAP_FIRST_POINTER_QUERY } from "~/lib/useTapFirstCapability";

import { PlacardStatsCard } from "./PlacardStatsCard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(unit: string, tapFirst = false) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === TAP_FIRST_POINTER_QUERY && tapFirst,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const navigate = vi.fn();
  const view = render(
    <Link
      href="/destination"
      onClick={(event) => {
        event.preventDefault();
        navigate();
      }}
    >
      <PlacardStatsCard
        headline="250"
        headlineIcon={HashIcon}
        headlineLabel={unit}
        years={[
          { year: 2019, value: 231, projectedRemainder: 0 },
          { year: 2026, value: 19, projectedRemainder: 6 },
        ]}
        yearUnit={unit}
        stats={[]}
      />
    </Link>,
  );
  return { ...view, navigate };
}

it.each(["workouts", "books"])(
  "portals %s year details outside the card on focus",
  async (unit) => {
    const { container } = setup(unit);
    fireEvent.focus(screen.getByLabelText(`2026: 19 ${unit}`));
    const tooltip = await screen.findByRole("tooltip", {
      name: /~25 projected/,
    });
    expect(tooltip.textContent).toContain("~25 projected");
    expect(container.contains(tooltip)).toBe(false);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  },
);

function tap(element: HTMLElement) {
  const event = new Event("pointerup", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  fireEvent(element, event);
  fireEvent.click(element);
}

it("inspects one year at a time on touch without following the card link", async () => {
  const { container, navigate } = setup("workouts", true);
  const first = screen.getByLabelText("2019: 231 workouts");
  const second = screen.getByLabelText("2026: 19 workouts");
  tap(first);
  const tooltip = await screen.findByRole("tooltip", { name: /231 workouts/ });
  expect(tooltip.textContent).toContain("231 workouts");
  expect(container.contains(tooltip)).toBe(false);
  tap(second);
  await waitFor(() => expect(screen.getAllByRole("tooltip")).toHaveLength(1));
  expect(screen.getByRole("tooltip").textContent).toContain("19 workouts");
  tap(second);
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  expect(navigate).not.toHaveBeenCalled();
});
