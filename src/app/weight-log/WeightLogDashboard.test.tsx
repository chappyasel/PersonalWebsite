// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ReactElement, cloneElement } from "react";
import type * as Recharts from "recharts";
import { afterEach, expect, it, vi } from "vitest";

import type { WeightLog } from "~/lib/weight-log/schema";

import { WeightLogDashboard } from "./WeightLogDashboard";

vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof Recharts>()),
  ResponsiveContainer: ({ children }: { children: ReactElement }) =>
    cloneElement(children as ReactElement<{ width: number; height: number }>, {
      width: 800,
      height: 450,
    }),
}));
vi.mock("./DexaChart", () => ({ DexaChart: () => null }));
vi.mock("./WeightHistoryCalendar", () => ({
  WeightHistoryCalendar: () => null,
}));
afterEach(cleanup);

const log: WeightLog = {
  version: 1,
  importedAt: "2020-01-01",
  sourceModifiedAt: "2020-01-01",
  setPoints: [],
  phases: [
    {
      id: "test",
      label: "Test",
      kind: "cut",
      start: "2020-01-06",
      end: "2020-01-19",
    },
  ],
  weeks: [
    {
      date: "2020-01-06",
      phaseId: "test",
      weights: [100, 100, 100, 100, 100, 100, 100],
      averageDays: [0, 1, 2, 3, 4, 5, 6],
      target: 100,
      originalTarget: null,
    },
    {
      date: "2020-01-13",
      phaseId: "test",
      weights: [null, null, null, null, null, null, null],
      averageDays: [0, 1, 2, 3, 4, 5, 6],
      target: 200,
      originalTarget: null,
    },
  ],
  scans: [
    {
      date: "2020-01-06",
      weight: 100,
      leanMass: 89,
      fatMass: 8,
      bodyFatPercent: 8,
    },
    {
      date: "2020-01-08",
      weight: 100,
      leanMass: 79,
      fatMass: 18,
      bodyFatPercent: 18,
    },
    {
      date: "2020-01-10",
      weight: 100,
      leanMass: 85,
      fatMass: 12,
      bodyFatPercent: 12,
    },
  ],
};

function bodyFatOnly() {
  const view = render(<WeightLogDashboard log={log} />);
  for (const name of [
    "Weigh-ins",
    "Weekly average",
    "Target",
    "7-day trend",
    "Set points",
    "Future plan",
  ]) {
    fireEvent.click(screen.getByRole("checkbox", { name }));
  }
  return view.container;
}

it("uses a 4% floor, 1% gridlines, and 4% major lines, excluding hidden projections from its ceiling", () => {
  const container = bodyFatOnly();
  const labels = [
    ...container.querySelectorAll(
      ".recharts-yAxis .recharts-cartesian-axis-tick-value",
    ),
  ].map((node) => node.textContent);
  expect(labels).toEqual(
    Array.from({ length: 16 }, (_, index) => `${index + 4}%`),
  );
  expect(container.querySelectorAll(".body-fat-grid-major")).toHaveLength(4);
  expect(container.querySelectorAll(".body-fat-grid-minor")).toHaveLength(12);
});

it("does not draw DEXA markers for null readings along the chart's top edge", () => {
  const container = bodyFatOnly();
  const dots = container.querySelectorAll(".recharts-line-dots circle");
  expect(dots).toHaveLength(3);
  expect([...dots].every((dot) => dot.hasAttribute("cy"))).toBe(true);
});
