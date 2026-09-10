// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { buildWeightChart } from "~/lib/weight-log/chart";
import type { WeightLog } from "~/lib/weight-log/schema";

import { WeightHistoryCalendar } from "./WeightHistoryCalendar";

afterEach(cleanup);

it("shows a full year and preserves historical colors and exact readings when navigating", () => {
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
  fireEvent.click(leapDay);
  expect(leapDay.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("February 29, 2020")).toBeTruthy();
  expect(screen.getByText("Weigh-in").nextElementSibling?.textContent).toBe(
    "125.0 lb",
  );
  fireEvent.change(screen.getByRole("combobox", { name: "History year" }), {
    target: { value: "2021" },
  });
  expect(screen.queryByText("February 29, 2020")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Next year" }).hasAttribute("disabled"),
  ).toBe(true);
});

it("handles a snapshot with no measured weights", () => {
  render(<WeightHistoryCalendar points={[]} />);
  expect(screen.getByText("No weigh-ins to display.")).toBeTruthy();
});
