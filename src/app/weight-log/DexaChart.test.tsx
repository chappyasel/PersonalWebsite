// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { WeightLog } from "~/lib/weight-log/schema";

import { DexaChart } from "./DexaChart";

const scans: WeightLog["scans"] = [
  {
    date: "2020-01-01",
    weight: 100,
    leanMass: 70,
    fatMass: 20,
    bodyFatPercent: 20,
  },
  {
    date: "2020-02-01",
    weight: 120,
    leanMass: 80,
    fatMass: 30,
    bodyFatPercent: 25,
  },
  {
    date: "2020-03-01",
    weight: 110,
    leanMass: 77,
    fatMass: 23,
    bodyFatPercent: 21,
  },
];
afterEach(cleanup);

describe("DEXA chart selection", () => {
  it("shows scan details through keyboard focus and keeps the full-history context when filtered", () => {
    const { rerender } = render(
      <DexaChart scans={scans} start="2020-01-01" end="2020-03-01" />,
    );
    const scanTwo = screen.getByRole("button", { name: /Scan 2,/ });
    fireEvent.focus(scanTwo);
    expect(scanTwo.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^Scan 2 ·/ }));
    expect(screen.getByText(/Bulk efficiency 50%/)).toBeTruthy();
    rerender(<DexaChart scans={scans} start="2020-03-01" end="2020-03-01" />);
    expect(screen.queryByRole("button", { name: /Scan 2,/ })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: /Scan 3,/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText(/Cut efficiency 70%/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "About this chart" }));
    expect(screen.getByText(/1 of 3 scans/)).toBeTruthy();
  });

  it("handles a missing lean measurement and a single plottable scan without invalid SVG coordinates", () => {
    const { container, rerender } = render(
      <DexaChart
        scans={[{ ...scans[0]!, leanMass: null }]}
        start="2020-01-01"
        end="2020-01-01"
      />,
    );
    expect(screen.getByText(/No lean-mass measurements/)).toBeTruthy();
    rerender(
      <DexaChart scans={[scans[0]!]} start="2020-01-01" end="2020-01-01" />,
    );
    expect(screen.getByRole("button", { name: /Scan 1,/ })).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    fireEvent.click(screen.getByRole("button", { name: "About this chart" }));
    expect(screen.getByText(/R² unavailable/)).toBeTruthy();
  });
});

describe("DEXA bulk ribbon", () => {
  const history: WeightLog["scans"] = [
    [200, 150],
    [210, 152],
    [200, 149],
    [210, 153],
    [200, 148],
    [210, 154],
  ].map(([weight, leanMass], index) => ({
    date: `2020-0${index + 1}-01`,
    weight: weight!,
    leanMass: leanMass!,
    fatMass: weight! - leanMass! - 10,
    bodyFatPercent: null,
  }));

  it("shows the 240 lb scenarios, hides the ribbon on demand, and preserves historical date filters", () => {
    const { container, rerender } = render(
      <DexaChart scans={history} start="2020-01-01" end="2020-06-01" />,
    );
    expect(screen.getByLabelText("Bulk scenarios at 240 lb")).toBeTruthy();
    const scenarios = screen.getByRole("button", {
      name: "Current bulk · Scenarios at 240 lb",
    });
    expect(scenarios.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByText("Current bulk · Scenarios at 240 lb"));
    expect(scenarios.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("166.0")).toBeTruthy();
    expect(container.querySelector("polygon")).not.toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Project current bulk/ }),
    );
    expect(container.querySelector("polygon")).toBeNull();
    expect(screen.queryByLabelText("Bulk scenarios at 240 lb")).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Project current bulk/ }),
    );
    rerender(<DexaChart scans={history} start="2020-01-01" end="2020-04-01" />);
    expect(screen.queryByLabelText("Bulk scenarios at 240 lb")).toBeNull();
    expect(screen.getByText(/Include the latest DEXA scan/)).toBeTruthy();
    rerender(<DexaChart scans={history} start="2020-06-01" end="2020-06-01" />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Current bulk · Scenarios at 240 lb",
      }),
    );
    expect(screen.getByText("166.0")).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});
