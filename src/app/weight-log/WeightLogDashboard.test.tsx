// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, cloneElement } from "react";
import type * as Recharts from "recharts";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

import type { WeightLog } from "~/lib/weight-log/schema";

import { WeightLogDashboard } from "./WeightLogDashboard";

const chartRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof Recharts>()),
  ResponsiveContainer: ({ children }: { children: ReactElement }) => {
    chartRenders.count++;
    return cloneElement(
      children as ReactElement<{ width: number; height: number }>,
      {
        width: 800,
        height: 450,
      },
    );
  },
}));
vi.mock("./DexaChart", () => ({
  DexaChart: ({ start, end }: { start: string; end: string }) => (
    <div data-testid="dexa-chart" data-start={start} data-end={end} />
  ),
}));
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

function renderTrendOnly(data: WeightLog) {
  const view = render(<WeightLogDashboard log={data} />);
  fireEvent.click(screen.getByRole("button", { name: /Layers/ }));
  for (const name of [
    "Future weight plan",
    "Body fat %",
    "Early body fat · exploratory",
    "Future body fat plan",
  ]) {
    fireEvent.click(screen.getByRole("checkbox", { name }));
  }
  fireEvent.click(screen.getByRole("button", { name: "Close layers" }));
  return view;
}

function bodyFatOnly() {
  const view = renderTrendOnly(log);
  fireEvent.click(screen.getByRole("button", { name: /Layers/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "7-day trend" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Body fat %" }));
  return view.container;
}

it("shows history length and import freshness at the top, with colored scan data collapsed initially", () => {
  const { container } = render(
    <WeightLogDashboard
      log={{
        ...log,
        weeks: ["2018-09-24", "2026-09-07"].map((date) => ({
          ...log.weeks[0]!,
          date,
          weights: [null, null, null, 100, null, null, null],
        })),
        scans: log.scans.map((scan, index) =>
          index === 0 ? { ...scan, leanMass: null } : scan,
        ),
      }}
    />,
  );
  expect(screen.getByText(/2 weigh-ins · 8.0 years/)).toBeTruthy();
  expect(screen.getByText(/Last import/).closest("header")).toBeTruthy();
  expect(screen.queryByText("Private · Read only")).toBeNull();
  expect(container.querySelector('[id$="-zoom-help"]')?.className).toBe(
    "sr-only",
  );
  const summary = screen.getByText(/Scan data ·/);
  expect(summary.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(summary);
  const rows = within(
    screen.getByRole("table", { name: "DEXA scan measurements" }),
  ).getAllByRole("row");
  const first = within(rows[1]!).getAllByRole("cell");
  expect(first[0]!.style.backgroundColor).toBe("rgb(248, 250, 252)");
  expect(first[1]!.textContent).toBe("—");
  expect(first[1]!.style.backgroundColor).toBe("");
  expect(first[3]!.style.backgroundColor).toBe("rgb(37, 99, 235)");
  expect(within(rows[2]!).getAllByRole("cell")[3]!.style.backgroundColor).toBe(
    "rgb(220, 38, 38)",
  );
});

it("keeps filters inside the bodyweight chart and leaves DEXA history unchanged by phase or date selection", async () => {
  render(
    <WeightLogDashboard
      log={{ ...log, phases: [{ ...log.phases[0]!, end: "2020-01-07" }] }}
    />,
  );
  const chart = screen.getByRole("region", { name: "Bodyweight over time" });
  const phase = within(chart).getByRole("combobox", { name: "Phase" });
  expect(within(chart).getByLabelText("From")).toBeTruthy();
  expect(screen.queryByText("Latest in view")).toBeNull();
  expect(screen.queryByText("Change in view")).toBeNull();
  expect(screen.queryByText("Weigh-ins in view")).toBeNull();
  expect(screen.queryByText("Latest weekly average")).toBeNull();
  fireEvent.click(screen.getByText(/Scan data ·/));
  const table = screen.getByRole("table", { name: "DEXA scan measurements" });
  expect(within(table).getAllByRole("row")).toHaveLength(4);
  fireEvent.keyDown(phase, { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: "Cut · Test" }));
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  await waitFor(() =>
    expect(within(table).getAllByRole("row")).toHaveLength(4),
  );
  expect(screen.getByLabelText<HTMLInputElement>("To").value).toBe(
    "2020-01-07",
  );
  expect(within(table).getAllByRole("row")).toHaveLength(4);
  expect(screen.getByTestId("dexa-chart").getAttribute("data-start")).toBe(
    "2020-01-06",
  );
  expect(screen.getByTestId("dexa-chart").getAttribute("data-end")).toBe(
    "2020-01-10",
  );
  fireEvent.change(screen.getByLabelText("From"), {
    target: { value: "2020-01-07" },
  });
  expect(within(table).getAllByRole("row")).toHaveLength(4);
  expect(screen.getByTestId("dexa-chart").getAttribute("data-start")).toBe(
    "2020-01-06",
  );
});

it("groups weight and body-fat layers and toggles each future plan independently", () => {
  const { container } = renderTrendOnly(log);
  fireEvent.click(screen.getByRole("button", { name: /Layers/ }));
  const weight = screen.getByRole("group", { name: "Weight" });
  const fat = screen.getByRole("group", { name: "Body fat" });
  const weightPlan = within(weight).getByRole("checkbox", {
    name: "Future weight plan",
  });
  const fatPlan = within(fat).getByRole("checkbox", {
    name: "Future body fat plan",
  });
  expect(
    within(weight).queryByRole("checkbox", { name: "Future body fat plan" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "7-day trend" }));
  fireEvent.click(fatPlan);
  expect(
    container.querySelector(".future-body-fat-plan .recharts-line-curve"),
  ).toBeTruthy();
  expect(container.querySelector(".future-weight-plan")).toBeNull();
  expect(
    screen
      .getByRole("checkbox", { name: "Body fat %" })
      .getAttribute("aria-checked"),
  ).toBe("false");
  expect(
    container.querySelectorAll(".body-fat-grid-major").length,
  ).toBeGreaterThan(0);
  expect(container.querySelectorAll(".weight-grid-major")).toHaveLength(0);
  fireEvent.click(weightPlan);
  const weightLine = container.querySelector(
    ".future-weight-plan .recharts-line-curve",
  )!;
  const fatLine = container.querySelector(
    ".future-body-fat-plan .recharts-line-curve",
  )!;
  expect(weightLine.getAttribute("stroke-dasharray")).toBe("14 5");
  expect(fatLine.getAttribute("stroke-dasharray")).toBe("1 5");
  expect(fatLine.getAttribute("stroke-linecap")).toBe("round");
  fireEvent.click(fatPlan);
  expect(container.querySelector(".future-body-fat-plan")).toBeNull();
  expect(
    container.querySelector(".future-weight-plan .recharts-line-curve"),
  ).toBeTruthy();
  expect(container.querySelectorAll(".body-fat-grid-major")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: /Layers/ }));
  const active = container.querySelector('[aria-label="Active layers"]')!;
  expect(active.textContent).toContain("Future weight plan");
  expect(active.textContent).not.toContain("left axis");
  expect(active.textContent).not.toContain("Body fat");
});

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

it("opens with the trend, future weight and all three purple body-fat layers", () => {
  const { container } = render(<WeightLogDashboard log={log} />);
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "About this chart" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  expect(
    container
      .querySelector(".future-weight-plan .recharts-line-curve")
      ?.getAttribute("stroke"),
  ).toBe("#2563eb");
  expect(
    container
      .querySelector(".future-body-fat-plan .recharts-line-curve")
      ?.getAttribute("stroke"),
  ).toBe("#a78bfa");
  fireEvent.click(screen.getByRole("button", { name: /Layers/ }));
  expect(
    screen
      .getAllByRole("checkbox")
      .filter((input) => input.getAttribute("aria-checked") === "true")
      .map((input) => input.getAttribute("aria-label")),
  ).toEqual([
    "7-day trend",
    "Future weight plan",
    "Body fat %",
    "Early body fat · exploratory",
    "Future body fat plan",
  ]);
  fireEvent.click(screen.getByRole("checkbox", { name: "12-month average" }));
  fireEvent.click(screen.getByRole("button", { name: "Close layers" }));
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.getByText("12-month average")).toBeTruthy();
});

it("adds early estimates and their sensitivity band only on request, with percent hover values", async () => {
  const earlyLog: WeightLog = {
    ...log,
    historicalContext: {
      anchor: {
        date: "2020-01-06",
        bodyFatLow: 18,
        bodyFatHigh: 22,
        note: "Synthetic approximate recollection.",
      },
      strength: [],
    },
    scans: [100, 110, 120, 130].map((weight, index) => ({
      date: `${2020 + index}-01-10`,
      weight,
      leanMass: null,
      fatMass: weight - (80 + index * 5),
      bodyFatPercent: null,
    })),
  };
  const { container } = renderTrendOnly(earlyLog);
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
  expect(screen.queryByRole("note")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "About this chart" }));
  expect(screen.getByText(/starting assumption/).textContent).toContain(
    "recollection",
  );
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
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
  fireEvent.click(screen.getByRole("button", { name: "About this chart" }));
  expect(screen.getByText(/starting assumption/).textContent).toContain(
    "recollection",
  );
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: /Layers/ }));
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
beforeAll(() => {
  vi.stubGlobal("PointerEvent", ChartPointerEvent);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
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
  const { container } = renderTrendOnly(log);
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
  const { container } = renderTrendOnly(log);
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
  const { container } = renderTrendOnly(log);
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

it("closes Layers with the trigger after changing multiple checkboxes", async () => {
  const user = userEvent.setup();
  render(<WeightLogDashboard log={log} />);
  await user.click(screen.getByRole("button", { name: /Layers/ }));
  await user.click(screen.getByRole("checkbox", { name: "Weekly average" }));
  await user.click(screen.getByRole("checkbox", { name: "12-month average" }));
  await user.click(screen.getByRole("button", { name: /Layers/ }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.click(screen.getByRole("button", { name: /Layers/ }));
  await user.pointer({
    keys: "[TouchA]",
    target: screen.getByRole("checkbox", { name: "Target" }),
  });
  await user.pointer({
    keys: "[TouchA]",
    target: screen.getByRole("button", { name: /Layers/ }),
  });
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.click(screen.getByRole("button", { name: /Layers/ }));
  await user.click(screen.getByRole("checkbox", { name: "Weigh-ins" }));
  await user.click(screen.getByRole("button", { name: "Close layers" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.click(screen.getByRole("button", { name: /Layers/ }));
  expect(
    screen
      .getByRole("checkbox", { name: "Weigh-ins" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("opens and closes Layers without rebuilding the chart", async () => {
  const user = userEvent.setup();
  render(<WeightLogDashboard log={log} />);
  const rendered = chartRenders.count;
  await user.click(screen.getByRole("button", { name: /Layers/ }));
  await user.click(screen.getByRole("button", { name: "Close layers" }));
  expect(chartRenders.count).toBe(rendered);
  for (const name of ["Chart settings", "Legend"]) {
    await user.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(chartRenders.count).toBe(rendered);
  }
});
