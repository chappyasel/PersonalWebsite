// @vitest-environment jsdom
import { TRPCClientError } from "@trpc/client";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WeekTableRow } from "~/lib/weight-log/week-table";

import { PlanEditor, SetPointsEditor } from "./PlanEditor";

// Invented numbers. None of them is the owner's.

type Options = {
  onSuccess?: (data?: unknown) => unknown;
  onError?: (error: unknown) => void;
};

const mocks = vi.hoisted(() => ({
  rows: [] as WeekTableRow[],
  setPoints: [] as number[],
  changeRate: vi.fn(),
  moveEnd: vi.fn(),
  startPhase: vi.fn(),
  saveSetPoints: vi.fn(),
}));

const row = (
  week: string,
  target: number,
  poundsPerWeek: number | null,
): WeekTableRow => ({
  week,
  weights: [null, null, null, null, null, null, null],
  excludedDays: [],
  average: null,
  change: null,
  target,
  gapToTarget: null,
  poundsPerWeek,
  originalTarget: target,
  gapToOriginalTarget: null,
});

vi.mock("~/trpc/react", () => {
  const mutation = (mutate: (...args: unknown[]) => void) => () => ({
    mutate,
    isPending: false,
  });
  const invalidate = { invalidate: () => Promise.resolve() };
  return {
    api: {
      useUtils: () => ({
        weightLog: {
          phases: invalidate,
          weekTable: invalidate,
          setPoints: invalidate,
        },
      }),
      weightLog: {
        phases: {
          useQuery: () => ({
            data: {
              currentId: "2",
              runningId: "2",
              phases: [
                {
                  id: "2",
                  label: "Bulk Jan '30 - Feb '30",
                  start: "2030-01-28",
                  end: "2030-02-24",
                },
                {
                  id: "1",
                  label: "Cut Jan '30 - Jan '30",
                  start: "2030-01-07",
                  end: "2030-01-27",
                },
              ],
            },
            isError: false,
            isFetching: false,
          }),
        },
        weekTable: {
          useQuery: () => ({
            data: { phaseId: "2", rows: mocks.rows },
            isError: false,
            isFetching: false,
          }),
        },
        setPoints: {
          useQuery: () => ({
            data: mocks.setPoints,
            isError: false,
            isFetching: false,
          }),
        },
        changeRate: { useMutation: mutation(mocks.changeRate) },
        moveEnd: { useMutation: mutation(mocks.moveEnd) },
        startPhase: { useMutation: mutation(mocks.startPhase) },
        saveSetPoints: { useMutation: mutation(mocks.saveSetPoints) },
      },
    },
  };
});

/** A form by its name, or the whole page. */
const scope = (form?: string) =>
  form ? within(screen.getByRole("form", { name: form })) : screen;
const field = (label: string, form?: string) =>
  scope(form).getByLabelText<HTMLInputElement>(label, { selector: "input" });
const button = (name: string) =>
  screen.getByRole<HTMLButtonElement>("button", { name });
const type = (label: string, value: string, form?: string) =>
  fireEvent.change(field(label, form), { target: { value } });

const RATE = "Weekly rate";
const LENGTH = "Length";
const START = "Start a phase";

beforeEach(() => {
  mocks.rows = [
    row("2030-01-28", 100, null),
    row("2030-02-04", 100.5, 0.5),
    row("2030-02-11", 101, 0.5),
    row("2030-02-18", 101.5, 0.5),
  ];
  mocks.setPoints = [150, 160];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("weekly rate", () => {
  it("opens on this week's rate and says how far later targets move", () => {
    render(<PlanEditor today="2030-02-06" />);
    expect(screen.getByText("Bulk Jan '30 - Feb '30")).toBeTruthy();
    expect(screen.getByText("4 weeks, ending Sunday, Feb 24, 2030")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Week" }).textContent).toBe(
      "Feb 4, 2030",
    );
    expect(field("lb/wk", RATE).value).toBe("0.50");
    expect(button("Save rate").disabled).toBe(true);

    type("lb/wk", "0.25", RATE);
    expect(
      screen.getByText("Targets from Feb 4, 2030 on move −0.25 lb."),
    ).toBeTruthy();
    fireEvent.click(button("Save rate"));
    expect(mocks.changeRate).toHaveBeenCalledWith(
      { weekStart: "2030-02-04", poundsPerWeek: 0.25 },
      expect.anything(),
    );
  });

  it("shows the server's refusal", () => {
    mocks.changeRate.mockImplementation((_input, options: Options) =>
      options.onError?.(
        new TRPCClientError("The week of Feb 4, 2030 has no target.", {
          result: { error: { data: { code: "BAD_REQUEST" } } },
        } as never),
      ),
    );
    render(<PlanEditor today="2030-02-06" />);
    type("lb/wk", "1", RATE);
    fireEvent.click(button("Save rate"));
    expect(
      screen.getByText("The week of Feb 4, 2030 has no target."),
    ).toBeTruthy();
  });

  it("does not show a validation dump from the server", () => {
    mocks.changeRate.mockImplementation((_input, options: Options) =>
      options.onError?.(
        new TRPCClientError('[{"code":"too_big"}]', {
          result: {
            error: { data: { code: "BAD_REQUEST", zodError: { x: 1 } } },
          },
        } as never),
      ),
    );
    render(<PlanEditor today="2030-02-06" />);
    type("lb/wk", "1", RATE);
    fireEvent.click(button("Save rate"));
    expect(screen.getByText("The rate didn't save. Try again.")).toBeTruthy();
  });
});

describe("length", () => {
  it("adds weeks at the last rate or removes them from the end", () => {
    render(<PlanEditor today="2030-02-06" />);
    expect(field("Weeks", LENGTH).value).toBe("4");

    type("Weeks", "6", LENGTH);
    expect(
      screen.getByText(
        "Adds 2 weeks at +0.50 lb/wk, ending Sunday, Mar 10, 2030.",
      ),
    ).toBeTruthy();
    fireEvent.click(button("Save length"));
    expect(mocks.moveEnd).toHaveBeenCalledWith(
      { phaseId: "2", lastWeek: "2030-03-04" },
      expect.anything(),
    );

    type("Weeks", "3", LENGTH);
    expect(
      screen.getByText(
        "Removes 1 week from the end, ending Sunday, Feb 17, 2030.",
      ),
    ).toBeTruthy();

    type("Weeks", "0", LENGTH);
    expect(screen.getByText("A plan runs 1 to 156 weeks.")).toBeTruthy();
    expect(button("Save length").disabled).toBe(true);
  });
});

describe("start a phase", () => {
  it("names the new phase, asks before ending the current one, and sends the plan", () => {
    render(<PlanEditor today="2030-02-06" />);
    fireEvent.click(button("Start a phase"));
    expect(screen.getByRole("combobox", { name: "Start" }).textContent).toBe(
      "Feb 11, 2030",
    );
    expect(button("Start").disabled).toBe(true);
    type("Starting target", "101.2", START);
    type("lb/wk", "-0.5", START);
    type("Weeks", "8", START);
    expect(
      screen.getByText("Maintain Feb '30 - Apr '30, ending Sunday, Apr 7, 2030."),
    ).toBeTruthy();

    fireEvent.click(button("Start"));
    expect(mocks.startPhase).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Bulk Jan '30 - Feb '30 ends Sunday, Feb 10, 2030. Its weeks from Feb 11, 2030 on take the new plan's targets, and its empty weeks past the new plan go.",
      ),
    ).toBeTruthy();
    fireEvent.click(button("Start phase"));
    expect(mocks.startPhase).toHaveBeenCalledWith(
      {
        kind: "maintenance",
        startDate: "2030-02-11",
        startTarget: 101.2,
        poundsPerWeek: -0.5,
        lastWeek: "2030-04-01",
        currentPhaseId: "2",
      },
      expect.anything(),
    );
  });

  it("drops the confirmation when a value changes", () => {
    render(<PlanEditor today="2030-02-06" />);
    fireEvent.click(button("Start a phase"));
    type("Starting target", "101.2", START);
    fireEvent.click(button("Start"));
    expect(button("Start phase")).toBeTruthy();
    type("Weeks", "9", START);
    expect(screen.queryByRole("button", { name: "Start phase" })).toBeNull();
  });
});

describe("set points", () => {
  it("edits, adds, and removes, then saves the list in order", () => {
    render(<SetPointsEditor />);
    expect(field("Set point 1").value).toBe("150.0");
    expect(field("Set point 2").value).toBe("160.0");
    expect(button("Save set points").disabled).toBe(true);

    type("Set point 2", "161.5");
    fireEvent.click(button("Add"));
    expect(button("Save set points").disabled).toBe(true);
    type("Set point 3", "170");
    fireEvent.click(button("Remove set point 1"));
    expect(field("Set point 1").value).toBe("161.5");

    fireEvent.click(button("Save set points"));
    expect(mocks.saveSetPoints).toHaveBeenCalledWith(
      { pounds: [161.5, 170] },
      expect.anything(),
    );
  });

  it("can clear every set point", () => {
    render(<SetPointsEditor />);
    fireEvent.click(button("Remove set point 1"));
    fireEvent.click(button("Remove set point 1"));
    expect(screen.getByText("No set points.")).toBeTruthy();
    fireEvent.click(button("Save set points"));
    expect(mocks.saveSetPoints).toHaveBeenCalledWith(
      { pounds: [] },
      expect.anything(),
    );
  });
});
