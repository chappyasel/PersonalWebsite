// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { type ReactElement, cloneElement } from "react";
import type * as Recharts from "recharts";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

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
  fireEvent.click(screen.getByRole("button", { name: /Layers/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "7-day trend" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Body fat %" }));
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

it("opens with only the seven-day trend and lets the user add the annual average", () => {
  const { container } = render(<WeightLogDashboard log={log} />);
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.getByText("About this chart").closest("details")?.open).toBe(
    false,
  );
  expect(container.querySelectorAll(".recharts-line-curve")).toHaveLength(1);
  expect(container.querySelectorAll(".weight-grid-major")).toHaveLength(3);
  expect(container.querySelectorAll(".weight-grid-minor")).toHaveLength(8);
  fireEvent.click(screen.getByRole("button", { name: /Layers/ }));
  expect(
    screen
      .getAllByRole("checkbox")
      .filter((input) => (input as HTMLInputElement).checked),
  ).toHaveLength(1);
  fireEvent.click(screen.getByRole("checkbox", { name: "12-month average" }));
  expect(container.querySelectorAll(".recharts-line-curve")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: /Layers/ }));
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.getByText("12-month average")).toBeTruthy();
});

it("adds early estimates and their sensitivity band only on request, with percent hover values", async () => {
  const earlyLog: WeightLog = {
    ...log,
    scans: [100, 110, 120, 130].map((weight, index) => ({
      date: `${2020 + index}-01-10`,
      weight,
      leanMass: null,
      fatMass: weight - (80 + index * 5),
      bodyFatPercent: null,
    })),
  };
  const { container } = render(<WeightLogDashboard log={earlyLog} />);
  expect(container.querySelector(".historical-body-fat-line")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Layers/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "7-day trend" }));
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Early body fat · exploratory" }),
  );
  expect(
    container.querySelector(".historical-body-fat-range .recharts-area-area"),
  ).toBeTruthy();
  expect(
    container.querySelector(".historical-body-fat-line .recharts-line-curve"),
  ).toBeTruthy();
  expect(screen.getByRole("note").textContent).toContain(
    "not a confidence interval",
  );
  const wrapper = container.querySelector(".recharts-wrapper")!;
  vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 800,
    height: 450,
    right: 800,
    bottom: 450,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  Object.defineProperty(wrapper, "offsetWidth", { value: 800 });
  Object.defineProperty(wrapper, "offsetHeight", { value: 450 });
  fireEvent.mouseMove(wrapper, { clientX: 130, clientY: 100 });
  await waitFor(() =>
    expect(
      container.querySelector(".weight-chart-hover-guide text")?.textContent,
    ).toBe("20.0%"),
  );
  expect(
    container.querySelector(".recharts-tooltip-wrapper")?.textContent,
  ).toMatch(/% to .*%/);
  fireEvent.change(screen.getByLabelText("From"), {
    target: { value: "2020-01-07" },
  });
  fireEvent.change(screen.getByLabelText("To"), {
    target: { value: "2020-01-08" },
  });
  expect(
    container.querySelector(".historical-body-fat-line .recharts-line-curve"),
  ).toBeTruthy();
  expect(screen.getByText(/average error of/).textContent).toContain(
    "1 backward checks",
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Early body fat · exploratory" }),
  );
  expect(container.querySelector(".historical-body-fat-range")).toBeNull();
  expect(container.querySelector(".historical-body-fat-line")).toBeNull();
});

class ChartPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  isPrimary = true;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}
beforeAll(() => vi.stubGlobal("PointerEvent", ChartPointerEvent));
afterAll(() => vi.unstubAllGlobals());

function dragArea(container: HTMLElement) {
  const area = container.querySelector<SVGRectElement>(
    ".weight-chart-drag-area",
  )!;
  Object.assign(area, {
    getBoundingClientRect: () => ({
      left: 100,
      top: 12,
      width: 1000,
      height: 400,
    }),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  return area;
}
function dragAcross(area: SVGRectElement, from: number, to: number) {
  fireEvent.pointerDown(area, { clientX: from, button: 0, pointerId: 1 });
  fireEvent.pointerMove(area, { clientX: to, pointerId: 1 });
  fireEvent.pointerUp(area, { clientX: to, pointerId: 1 });
}
function dates() {
  return ["From", "To"].map(
    (label) => screen.getByLabelText<HTMLInputElement>(label).value,
  );
}

it("zooms in either direction, supports nested zooms, and resets the original range", () => {
  const { container } = render(<WeightLogDashboard log={log} />);
  expect(
    container.querySelector(".recharts-surface")?.getAttribute("tabindex"),
  ).toBe("0");
  dragAcross(dragArea(container), 850, 350);
  expect(dates()).toEqual(["2020-01-09", "2020-01-16"]);
  dragAcross(dragArea(container), 350, 850);
  expect(dates()).toEqual(["2020-01-10", "2020-01-15"]);
  fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
  expect(dates()).toEqual(["2020-01-06", "2020-01-19"]);
  expect(
    screen.getByRole("button", { name: "Reset zoom" }).hasAttribute("disabled"),
  ).toBe(true);
});

it("ignores clicks, cancels with Escape, and bounds a drag released outside the plot", () => {
  const { container } = render(<WeightLogDashboard log={log} />);
  const area = dragArea(container);
  dragAcross(area, 350, 352);
  expect(dates()).toEqual(["2020-01-06", "2020-01-19"]);
  fireEvent.pointerDown(area, { clientX: 350, button: 0, pointerId: 1 });
  fireEvent.pointerMove(area, { clientX: 850, pointerId: 1 });
  expect(
    container.querySelector(".weight-chart-zoom-selection"),
  ).not.toBeNull();
  fireEvent.keyDown(window, { key: "Escape" });
  fireEvent.pointerUp(area, { clientX: 850, pointerId: 1 });
  expect(dates()).toEqual(["2020-01-06", "2020-01-19"]);
  expect(container.querySelector(".weight-chart-zoom-selection")).toBeNull();
  dragAcross(area, 900, -200);
  expect(dates()).toEqual(["2020-01-06", "2020-01-17"]);
  fireEvent.change(screen.getByLabelText("From"), {
    target: { value: "2020-01-08" },
  });
  expect(
    screen.getByRole("button", { name: "Reset zoom" }).hasAttribute("disabled"),
  ).toBe(true);
});

it("shows a horizontal guide at the hovered trend value", async () => {
  const { container } = render(<WeightLogDashboard log={log} />);
  const wrapper = container.querySelector<HTMLElement>(".recharts-wrapper")!;
  Object.assign(wrapper, {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
  });
  Object.defineProperty(wrapper, "offsetWidth", { value: 800 });
  Object.defineProperty(wrapper, "offsetHeight", { value: 450 });
  fireEvent.mouseMove(wrapper, { clientX: 200, clientY: 180 });
  await waitFor(() =>
    expect(
      container.querySelector(".weight-chart-hover-guide text")?.textContent,
    ).toBe("100.0 lb"),
  );
  const guide = container.querySelector(".weight-chart-hover-guide line")!;
  expect(Number(guide.getAttribute("y1"))).toBe(212);
  expect(guide.getAttribute("y1")).toBe(guide.getAttribute("y2"));
  fireEvent.click(screen.getByRole("button", { name: /Layers/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Body fat %" }));
  fireEvent.mouseMove(wrapper, { clientX: 163, clientY: 40 });
  await waitFor(() =>
    expect(
      container.querySelector(".weight-chart-hover-guide text")?.textContent,
    ).toBe("18.0%"),
  );
  fireEvent.mouseMove(wrapper, { clientX: 163, clientY: 210 });
  await waitFor(() =>
    expect(
      container.querySelector(".weight-chart-hover-guide text")?.textContent,
    ).toBe("100.0 lb"),
  );
  fireEvent.mouseLeave(wrapper);
  await waitFor(() =>
    expect(container.querySelector(".weight-chart-hover-guide")).toBeNull(),
  );
});
