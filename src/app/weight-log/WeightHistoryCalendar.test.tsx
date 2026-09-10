// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { buildWeightChart } from "~/lib/weight-log/chart";
import type { WeightLog } from "~/lib/weight-log/schema";

import { WeightHistoryCalendar } from "./WeightHistoryCalendar";

afterEach(cleanup);
beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

it("shows a full year and preserves historical colors and exact readings when navigating", async () => {
  const log: WeightLog = {
    version: 1,
    importedAt: "2021-01-01",
    sourceModifiedAt: "2021-01-01",
    phases: [],
    scans: [],
    setPoints: [],
    weeks: [
      {
        date: "2020-02-24",
        phaseId: "test",
        weights: [100, 150, null, null, null, 125, null],
        averageDays: [0, 1, 2, 3, 4, 5, 6],
        target: 900,
        originalTarget: null,
      },
      {
        date: "2021-01-04",
        phaseId: "test",
        weights: [150, 200, null, null, null, null, null],
        averageDays: [0, 1, 2, 3, 4, 5, 6],
        target: 900,
        originalTarget: null,
      },
    ],
  };
  render(<WeightHistoryCalendar points={buildWeightChart(log)} />);
  expect(screen.getByRole("region", { name: "January 2021" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "December 2021" })).toBeTruthy();
  const current = screen.getByRole("button", {
    name: "January 4, 2021: 150.0 lb",
  });
  const background = current.style.backgroundColor;
  expect(background).toBe("rgb(248, 250, 252)");
  expect(screen.queryByRole("button", { name: /January 6, 2021/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Previous year" }));
  expect(
    screen.getByRole("button", { name: "February 25, 2020: 150.0 lb" }).style
      .backgroundColor,
  ).toBe(background);
  const leapDay = screen.getByRole("button", {
    name: "February 29, 2020: 125.0 lb",
  });
  expect(screen.queryByText("Weigh-in")).toBeNull();
  expect(screen.queryByText(/Blue is lower weight/)).toBeNull();
  fireEvent.focus(leapDay);
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip.textContent).toContain("February 29, 2020");
  expect(
    within(tooltip).getByText("Weigh-in").nextElementSibling?.textContent,
  ).toBe("125.0 lb");
  expect(
    within(tooltip).getByText("Target").nextElementSibling?.textContent,
  ).toBe("900.0 lb");
  expect(within(tooltip).getByText("Weekly average")).toBeTruthy();
  expect(within(tooltip).getByText("12-month average")).toBeTruthy();
  fireEvent.keyDown(leapDay, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  const tap = () => {
    for (const type of ["pointerdown", "pointerup"]) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "pointerType", { value: "touch" });
      fireEvent(leapDay, event);
    }
    fireEvent.click(leapDay);
  };
  tap();
  expect(await screen.findByRole("tooltip")).toBeTruthy();
  tap();
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  fireEvent.keyDown(screen.getByRole("combobox", { name: "History year" }), {
    key: "Enter",
  });
  fireEvent.click(screen.getByRole("option", { name: "2021" }));
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  expect(screen.queryByText("Weigh-in")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Next year" }).hasAttribute("disabled"),
  ).toBe(true);
});

it("handles a snapshot with no measured weights", () => {
  render(<WeightHistoryCalendar points={[]} />);
  expect(screen.getByText("No weigh-ins to display.")).toBeTruthy();
});

it("shows daily future targets across years without treating them as weigh-ins or filling past gaps", async () => {
  const log: WeightLog = {
    version: 1,
    importedAt: "2020-12-28",
    sourceModifiedAt: "2020-12-28",
    scans: [],
    setPoints: [],
    phases: [
      {
        id: "plan",
        label: "Plan",
        kind: "bulk",
        start: "2020-12-21",
        end: "2021-01-17",
      },
    ],
    weeks: [
      {
        date: "2020-12-21",
        phaseId: "plan",
        weights: [150, null, null, null, null, null, null],
        averageDays: [0],
        target: 100,
        originalTarget: null,
      },
      {
        date: "2020-12-28",
        phaseId: "plan",
        weights: [155, null, null, null, null, null, null],
        averageDays: [0],
        target: 160,
        originalTarget: null,
      },
      {
        date: "2021-01-04",
        phaseId: "plan",
        weights: [null, null, null, null, null, null, null],
        averageDays: [],
        target: 167,
        originalTarget: null,
      },
      {
        date: "2021-01-11",
        phaseId: "plan",
        weights: [null, null, null, null, null, null, null],
        averageDays: [],
        target: null,
        originalTarget: null,
      },
    ],
  };
  const points = buildWeightChart(log);
  render(<WeightHistoryCalendar points={points} />);
  expect(screen.getByText("2 weigh-ins")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /December 22, 2020/ }),
  ).toBeNull();
  const observed = screen.getByRole("button", {
    name: "December 28, 2020: 155.0 lb",
  });
  expect(observed.style.backgroundColor).toBe("rgb(220, 38, 38)");
  const planned = screen.getByRole("button", {
    name: "December 29, 2020: Planned weight 161.0 lb",
  });
  expect(planned.className).toContain("text-neutral-400/60");
  expect(planned.style.backgroundColor).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Next year" }));
  expect(screen.getByText("0 weigh-ins")).toBeTruthy();
  const january = screen.getByRole("button", {
    name: "January 1, 2021: Planned weight 164.0 lb",
  });
  expect(january.textContent).toBe(
    points
      .find((point) => point.date === "2021-01-01")!
      .projectedWeight!.toFixed(1),
  );
  expect(screen.queryByRole("button", { name: /January 11, 2021/ })).toBeNull();
  fireEvent.focus(january);
  const tooltip = await screen.findByRole("tooltip");
  expect(
    within(tooltip).getByText("Planned weight").nextElementSibling?.textContent,
  ).toBe("164.0 lb");
  expect(within(tooltip).queryByText("Weigh-in")).toBeNull();
});
