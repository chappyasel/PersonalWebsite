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

type Phases = {
  currentId: string | null;
  runningId: string | null;
  revision: string;
  phases: { id: string; label: string; start: string; end: string }[];
};

const BULK = {
  id: "2",
  label: "Bulk Jan '30 - Feb '30",
  start: "2030-01-28",
  end: "2030-02-24",
};
const CUT = {
  id: "1",
  label: "Cut Jan '30 - Jan '30",
  start: "2030-01-07",
  end: "2030-01-27",
};

const mocks = vi.hoisted(() => ({
  phases: {} as Phases,
  rows: [] as WeekTableRow[],
  invalidate: vi.fn(() => Promise.resolve()),
  /** The running phase's weeks are refetching, as right after a start. */
  weeksLoading: false,
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
  const invalidate = { invalidate: mocks.invalidate };
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
            data: mocks.phases,
            isError: false,
            isFetching: false,
          }),
        },
        weekTable: {
          useQuery: () => ({
            data: mocks.weeksLoading
              ? undefined
              : {
                  phaseId: mocks.phases.runningId,
                  rows: mocks.rows,
                  revision: mocks.phases.revision,
                },
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

const conflict = (message: string) =>
  new TRPCClientError(message, {
    result: { error: { data: { code: "CONFLICT" } } },
  } as never);

const RATE = "Weekly rate";
const LENGTH = "Length";
const START = "Start a phase";

beforeEach(() => {
  mocks.phases = {
    currentId: "2",
    runningId: "2",
    revision: "rev-1",
    phases: [BULK, CUT],
  };
  mocks.rows = [
    row("2030-01-28", 100, null),
    row("2030-02-04", 100.5, 0.5),
    row("2030-02-11", 101, 0.5),
    row("2030-02-18", 101.5, 0.5),
  ];
  mocks.setPoints = [150, 160];
  mocks.weeksLoading = false;
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
      {
        phaseId: "2",
        weekStart: "2030-02-04",
        poundsPerWeek: 0.25,
        revision: "rev-1",
      },
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

  it("refetches the plan when the server says it changed", () => {
    mocks.changeRate.mockImplementation((_input, options: Options) =>
      options.onError?.(
        conflict("The plan changed since this page loaded it. Check it and try again."),
      ),
    );
    render(<PlanEditor today="2030-02-06" />);
    type("lb/wk", "1", RATE);
    fireEvent.click(button("Save rate"));
    expect(
      screen.getByText(
        "The plan changed since this page loaded it. Check it and try again.",
      ),
    ).toBeTruthy();
    expect(mocks.invalidate).toHaveBeenCalled();
  });

  it("offers a week once a one-week plan grows", () => {
    mocks.rows = [row("2030-01-28", 100, null)];
    const { rerender } = render(<PlanEditor today="2030-02-06" />);
    expect(screen.queryByRole("combobox", { name: "Week" })).toBeNull();

    // The length form, or another tab, added two weeks.
    mocks.rows = [
      row("2030-01-28", 100, null),
      row("2030-02-04", 100.5, 0.5),
      row("2030-02-11", 101, 0.5),
    ];
    rerender(<PlanEditor today="2030-02-06" />);
    expect(screen.getByRole("combobox", { name: "Week" }).textContent).toBe(
      "Feb 4, 2030",
    );
    expect(field("lb/wk", RATE).value).toBe("0.50");
  });

  it("moves to a week that still exists when the plan shrinks past the chosen one", () => {
    const { rerender } = render(<PlanEditor today="2030-02-20" />);
    expect(screen.getByRole("combobox", { name: "Week" }).textContent).toBe(
      "Feb 18, 2030",
    );
    type("lb/wk", "0.75", RATE);

    mocks.rows = mocks.rows.slice(0, 3);
    rerender(<PlanEditor today="2030-02-20" />);
    expect(screen.getByRole("combobox", { name: "Week" }).textContent).toBe(
      "Feb 11, 2030",
    );
    // The draft was for the week that went, so it goes too.
    expect(field("lb/wk", RATE).value).toBe("0.50");
    expect(button("Save rate").disabled).toBe(true);
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
      { phaseId: "2", lastWeek: "2030-03-04", revision: "rev-1" },
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
        "Bulk Jan '30 - Feb '30 ends Sunday, Feb 10, 2030, and this plan replaces its planned weeks from Feb 11, 2030 on.",
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
        revision: "rev-1",
      },
      expect.anything(),
    );
  });

  it("says what started once the page has the new plan", async () => {
    mocks.startPhase.mockImplementation((_input, options: Options) => {
      mocks.weeksLoading = true;
      return options.onSuccess?.();
    });
    render(<PlanEditor today="2030-02-06" />);
    fireEvent.click(button("Start a phase"));
    type("Starting target", "101.2", START);
    type("Weeks", "8", START);
    fireEvent.click(button("Start"));
    fireEvent.click(button("Start phase"));
    expect(
      await screen.findByText("Started Maintain Feb '30 - Apr '30."),
    ).toBeTruthy();
    expect(screen.queryByRole("form", { name: START })).toBeNull();
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

  it("drops an armed confirmation when another tab changes the plan", () => {
    const { rerender } = render(<PlanEditor today="2030-02-06" />);
    fireEvent.click(button("Start a phase"));
    type("Starting target", "101.2", START);
    fireEvent.click(button("Start"));
    expect(button("Start phase")).toBeTruthy();

    // Tab B started a cut on Feb 11, the Monday this form shows.
    const started = {
      id: "3",
      label: "Cut Feb '30 - Feb '30",
      start: "2030-02-11",
      end: "2030-02-24",
    };
    mocks.phases = {
      currentId: "3",
      runningId: "3",
      revision: "rev-2",
      phases: [started, { ...BULK, end: "2030-02-10" }, CUT],
    };
    rerender(<PlanEditor today="2030-02-06" />);
    expect(screen.queryByRole("button", { name: "Start phase" })).toBeNull();
    expect(
      screen.getByText(
        "The plan changed while you were confirming. Check the details and tap Start again.",
      ),
    ).toBeTruthy();

    // The next confirmation names the phase that is current now, and only a
    // second tap sends it.
    fireEvent.click(button("Start"));
    expect(mocks.startPhase).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "This replaces Cut Feb '30 - Feb '30, which starts the same Monday, along with its plan and original targets.",
      ),
    ).toBeTruthy();
    fireEvent.click(button("Start phase"));
    expect(mocks.startPhase).toHaveBeenCalledWith(
      expect.objectContaining({ currentPhaseId: "3", revision: "rev-2" }),
      expect.anything(),
    );
  });

  it("drops an armed confirmation when the same phase's plan changes", () => {
    const { rerender } = render(<PlanEditor today="2030-02-06" />);
    fireEvent.click(button("Start a phase"));
    type("Starting target", "101.2", START);
    fireEvent.click(button("Start"));
    mocks.phases = { ...mocks.phases, revision: "rev-2" };
    rerender(<PlanEditor today="2030-02-06" />);
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
      { pounds: [161.5, 170], previous: [150, 160] },
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
      { pounds: [], previous: [150, 160] },
      expect.anything(),
    );
  });

  it("says so when another tab saved the set points first", () => {
    mocks.saveSetPoints.mockImplementation((_input, options: Options) =>
      options.onError?.(
        conflict(
          "The set points changed since this page loaded them. Cancel to see them, then edit again.",
        ),
      ),
    );
    render(<SetPointsEditor />);
    type("Set point 1", "151");
    fireEvent.click(button("Save set points"));
    expect(
      screen.getByText(
        "The set points changed since this page loaded them. Cancel to see them, then edit again.",
      ),
    ).toBeTruthy();
    expect(mocks.invalidate).toHaveBeenCalled();
  });

  it("sends the list the draft started from, even after a refetch", () => {
    const { rerender } = render(<SetPointsEditor />);
    type("Set point 1", "151");
    mocks.setPoints = [155, 160];
    rerender(<SetPointsEditor />);
    fireEvent.click(button("Save set points"));
    expect(mocks.saveSetPoints).toHaveBeenCalledWith(
      { pounds: [151, 160], previous: [150, 160] },
      expect.anything(),
    );
  });
});
