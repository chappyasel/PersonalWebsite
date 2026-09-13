// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WeightLog } from "~/lib/weight-log/schema";
import { buildParetoPayload } from "~/lib/weightlifting/pareto/analysis";

import { BodyweightPareto, ParetoChart } from "./BodyweightPareto";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("~/trpc/react", () => ({
  api: { weightlifting: { getBodyweightPareto: { useQuery: mocks.query } } },
}));
// Rendering semantics and controls are tested without browser or chart layout automation.
vi.mock("~/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ChartTooltip: () => null,
}));
vi.mock("recharts", () => ({
  ScatterChart: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  Scatter: () => null,
  XAxis: () => null,
  YAxis: (props: { domain: number[]; allowDataOverflow?: boolean }) => (
    <span
      data-testid="strength-axis"
      data-domain={JSON.stringify(props.domain)}
      data-clip={props.allowDataOverflow}
    />
  ),
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  ReferenceDot: () => <span data-testid="latest-marker" />,
}));
const log: WeightLog = {
  version: 1,
  importedAt: "2024-01-01T00:00:00Z",
  sourceModifiedAt: "2024-01-01T00:00:00Z",
  phases: [],
  setPoints: [],
  scans: [],
  weeks: [
    {
      date: "2024-01-01",
      phaseId: "a",
      weights: [100, null, null, null, null, null, null],
      averageDays: [0],
      target: null,
      originalTarget: null,
    },
  ],
};
const payload = buildParetoPayload(
  [
    { date: "2024-01-01", oneRM: 400, weight: 300, reps: 10 },
    { date: "2024-01-02", oneRM: 200, weight: 150, reps: 10 },
  ],
  log,
  { displayName: "Synthetic lift", floor: 300 },
  null,
  "2024-01-02T00:00:00Z",
);
afterEach(cleanup);

describe("bodyweight Pareto presentation", () => {
  it("clips a weak latest attempt without expanding the frontier range or omitting it from analysis", () => {
    render(<ParetoChart data={{ ...payload, displayFloor: 0 }} />);
    expect(screen.queryByText(/shown ·.*evaluated/)).toBeNull();
    expect(screen.getByText(/This attempt is outside/).className).toBe(
      "sr-only",
    );
    expect(screen.queryByTestId("latest-marker")).toBeNull();
    expect(screen.getByText(/Dominated by/).textContent).toContain(
      "2024-01-01",
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.getByTestId("strength-axis").getAttribute("data-domain"),
    ).toBe("[395,405]");
    expect(screen.getByTestId("strength-axis").getAttribute("data-clip")).toBe(
      "true",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "About bodyweight estimates" }),
    );
    expect(
      screen.getByText(/Daily weigh-ins are linearly interpolated/),
    ).toBeTruthy();
    expect(screen.getByText(/All 2 valid attempts/)).toBeTruthy();
  });
  it("offers a retry without displaying the underlying failure", () => {
    const refetch = vi.fn();
    mocks.query.mockReturnValue({
      isPending: false,
      isError: true,
      error: { message: "private detail" },
      refetch,
    });
    render(
      <BodyweightPareto
        displayName="Flat Barbell Bench Press"
        color="#039BE5"
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("unavailable");
    expect(screen.queryByText(/private detail/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry analysis" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
  it("shows a useful empty state for configurations with no attempts", () => {
    mocks.query.mockReturnValue({
      isPending: false,
      isError: false,
      data: { ...payload, evaluatedCount: 0 },
    });
    render(
      <BodyweightPareto
        displayName="Flat Barbell Bench Press"
        color="#039BE5"
      />,
    );
    expect(screen.getByText(/No valid recorded 1RMe attempts/)).toBeTruthy();
  });
});
