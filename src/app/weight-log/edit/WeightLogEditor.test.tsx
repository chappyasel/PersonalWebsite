// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WeekTableRow } from "~/lib/weight-log/week-table";

import { WeightLogEditor, tablePhaseToShow } from "./WeightLogEditor";

// Invented numbers. None of them is the owner's.

/** A mutate call the test settles by hand, as the server would. */
interface Call {
  input: { date: string; pounds?: number };
  hook: MutationOptions;
  call?: MutationOptions;
}
interface MutationOptions {
  onSuccess?: (result: unknown, input: Call["input"]) => unknown;
}

const mocks = vi.hoisted(() => ({
  rows: [] as WeekTableRow[],
  /** Weeks no phase holds. Only the calendar-week query returns them. */
  unphased: [] as WeekTableRow[],
  /** The latest counted weigh-in ahead of any week the grid asks for. */
  before: null as { date: string; pounds: number } | null,
  upsert: vi.fn(),
  calls: [] as Call[],
}));

const empty = [null, null, null, null, null, null, null];
const row = (
  week: string,
  weights: (number | null)[],
  target: number | null,
  excludedDays: number[] = [],
): WeekTableRow => ({
  week,
  weights,
  excludedDays,
  average: null,
  change: null,
  target,
  gapToTarget: null,
  poundsPerWeek: null,
  originalTarget: target,
  gapToOriginalTarget: null,
});

vi.mock("~/trpc/react", () => {
  const mutation =
    (mutate: (...args: unknown[]) => void) => (hook: MutationOptions) => ({
      mutate: (input: Call["input"], call?: MutationOptions) => {
        mocks.calls.push({ input, hook, call });
        mutate(input, call);
      },
      isPending: false,
    });
  return {
    api: {
      useUtils: () => ({
        weightLog: {
          phases: { invalidate: () => Promise.resolve() },
          week: { invalidate: () => Promise.resolve() },
          weekTable: { invalidate: () => Promise.resolve() },
          setPoints: { invalidate: () => Promise.resolve() },
        },
      }),
      weightLog: {
        phases: {
          useQuery: () => ({
            data: {
              currentId: "1",
              runningId: "1",
              phases: [
                {
                  id: "1",
                  label: "Bulk Jan '30 - Feb '30",
                  kind: "bulk",
                  start: "2030-01-07",
                  end: "2030-02-03",
                },
                {
                  id: "0",
                  label: "Cut Nov '29 - Jan '30",
                  kind: "cut",
                  start: "2029-11-05",
                  end: "2030-01-06",
                },
              ],
            },
            isError: false,
            isFetching: false,
          }),
        },
        // Like React Query, a disabled query has no data and stays pending.
        weekTable: {
          useQuery: (
            { phaseId }: { phaseId: string },
            options?: { enabled?: boolean },
          ) =>
            options?.enabled === false || phaseId !== "1"
              ? { data: undefined, isPending: true, isError: false }
              : {
                  data: { phaseId, rows: mocks.rows },
                  isPending: false,
                  isError: false,
                  isFetching: false,
                },
        },
        week: {
          useQuery: ({ week }: { week: string }) => {
            const found = [...mocks.rows, ...mocks.unphased].find(
              (item) => item.week === week,
            );
            return {
              data: {
                week,
                weights: found?.weights ?? empty,
                excludedDays: found?.excludedDays ?? [],
                before: mocks.before,
              },
              isPending: false,
              isError: false,
              isFetching: false,
            };
          },
        },
        upsertWeighIn: { useMutation: mutation(mocks.upsert) },
        deleteWeighIn: { useMutation: mutation(vi.fn()) },
        // The plan and set point forms have their own tests (PlanEditor.test.tsx).
        changeRate: { useMutation: mutation(vi.fn()) },
        moveEnd: { useMutation: mutation(vi.fn()) },
        startPhase: { useMutation: mutation(vi.fn()) },
        setPoints: {
          useQuery: () => ({ data: [], isError: false, isFetching: false }),
        },
        saveSetPoints: { useMutation: mutation(vi.fn()) },
      },
    },
  };
});

/** A local clock time, so the test reads the same in any time zone. */
const at = (day: number, hour: number) => new Date(2030, 0, day, hour);

const dateInput = () =>
  screen.getByLabelText<HTMLInputElement>("Date", { selector: "input" });
const poundsInput = () =>
  screen.getByLabelText<HTMLInputElement>("Pounds", { selector: "input" });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(8, 21));
  mocks.rows = [
    row("2030-01-07", [100, 100.4, ...empty.slice(2)], 100),
    row("2030-01-14", empty, 101),
  ];
});

afterEach(() => {
  mocks.calls = [];
  mocks.unphased = [];
  mocks.before = null;
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("today", () => {
  it("moves an untouched form to the new day when the page comes back", () => {
    render(<WeightLogEditor />);
    expect(dateInput().value).toBe("2030-01-08");
    expect(dateInput().max).toBe("2030-01-08");

    // The phone keeps the tab alive overnight and shows it again.
    vi.setSystemTime(at(9, 7));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(dateInput().value).toBe("2030-01-09");
    expect(dateInput().max).toBe("2030-01-09");
    // Tuesday's weigh-in, carried to the new day and not saved.
    expect(poundsInput().value).toBe("100.4");
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("also turns over at midnight, on focus, and on a back-forward restore", () => {
    render(<WeightLogEditor />);
    act(() => {
      vi.advanceTimersByTime(4 * 60 * 60 * 1000);
    });
    expect(dateInput().value).toBe("2030-01-09");

    vi.setSystemTime(at(10, 7));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(dateInput().value).toBe("2030-01-10");

    vi.setSystemTime(at(11, 7));
    act(() => {
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(dateInput().value).toBe("2030-01-11");
  });

  it("keeps a typed draft on its day and lets the next day be picked", () => {
    render(<WeightLogEditor />);
    fireEvent.change(poundsInput(), { target: { value: "99.8" } });

    vi.setSystemTime(at(9, 7));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(dateInput().value).toBe("2030-01-08");
    expect(poundsInput().value).toBe("99.8");
    expect(dateInput().max).toBe("2030-01-09");
    expect(screen.getByRole("button", { name: "Back to today" })).toBeTruthy();
    const wednesday = screen.getByRole<HTMLButtonElement>("button", {
      name: /^Wednesday, January 9/,
    });
    expect(wednesday.disabled).toBe(false);
  });

  it("leaves a form on an earlier day where it is", () => {
    render(<WeightLogEditor />);
    fireEvent.click(screen.getByRole("button", { name: /^Monday, January 7/ }));
    expect(dateInput().value).toBe("2030-01-07");

    vi.setSystemTime(at(9, 7));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(dateInput().value).toBe("2030-01-07");
  });
});

describe("the date field", () => {
  it("shows the date as words over the native picker", () => {
    render(<WeightLogEditor />);
    expect(dateInput().type).toBe("date");
    expect(screen.getByText("Today")).toBeTruthy();

    fireEvent.change(dateInput(), { target: { value: "2030-01-07" } });
    expect(screen.getByText("Yesterday")).toBeTruthy();
    expect(screen.queryByText("Today")).toBeNull();
  });

  it("shows an older date short", () => {
    vi.setSystemTime(at(15, 7));
    render(<WeightLogEditor />);
    fireEvent.change(dateInput(), { target: { value: "2030-01-07" } });
    expect(screen.getByText("Mon, Jan 7")).toBeTruthy();
  });
});

/** The muted text class itself, not the input's placeholder variant. */
const MUTED = /(^|\s)text-muted-foreground(\s|$)/;

describe("a date with no weigh-in", () => {
  it("starts from the latest weigh-in before it, unsaved, with Save ready", () => {
    vi.setSystemTime(at(9, 7));
    render(<WeightLogEditor />);
    const field = poundsInput();
    expect(field.value).toBe("100.4");
    // Muted, like a value the owner hasn't entered yet.
    expect(field.className).toMatch(MUTED);
    expect(
      screen.getByText("Filled in from yesterday. Not saved yet."),
    ).toBeTruthy();
    // Nothing went to the server just by opening the form.
    expect(mocks.calls).toEqual([]);

    const save = screen.getByRole<HTMLButtonElement>("button", {
      name: "Save",
    });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(mocks.upsert).toHaveBeenCalledWith(
      { date: "2030-01-09", pounds: 100.4 },
      expect.anything(),
    );
  });

  it("takes a nudge as a typed draft", () => {
    vi.setSystemTime(at(9, 7));
    render(<WeightLogEditor />);
    fireEvent.change(poundsInput(), { target: { value: "100.2" } });
    expect(poundsInput().value).toBe("100.2");
    expect(poundsInput().className).not.toMatch(MUTED);
    expect(screen.queryByText(/Not saved yet/)).toBeNull();
  });

  it("looks before the week when the week has nothing earlier", () => {
    mocks.before = { date: "2030-01-03", pounds: 98.6 };
    vi.setSystemTime(at(15, 7));
    render(<WeightLogEditor />);
    expect(poundsInput().value).toBe("98.6");
    expect(
      screen.getByText("Filled in from Thu, Jan 3. Not saved yet."),
    ).toBeTruthy();
  });

  it("stays empty with no weigh-in before it", () => {
    vi.setSystemTime(at(15, 7));
    render(<WeightLogEditor />);
    expect(poundsInput().value).toBe("");
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Save" }).disabled,
    ).toBe(true);
  });
});

describe("the save button", () => {
  it("is a check mark with a name and no visible text", () => {
    vi.setSystemTime(at(9, 7));
    render(<WeightLogEditor />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.textContent).toBe("");
    expect(save.querySelector("svg")).not.toBeNull();
    expect(save.getAttribute("title")).toBeNull();
  });
});

describe("the phase picker", () => {
  it("shows the picked phase with its color, cycle, and weeks", () => {
    render(<WeightLogEditor />);
    const trigger = screen.getByRole("combobox", { name: "Phase" });
    // The bulk started second, so it is Cycle 2. Jan 7 to Feb 3 is 4 weeks.
    expect(trigger.textContent).toContain("Bulk Jan '30 - Feb '30");
    expect(trigger.textContent).toContain("Cycle 2 · 4 wk");
    const dot = trigger.querySelector<HTMLElement>(
      "[aria-hidden].rounded-full",
    );
    expect(dot?.style.background).toBe("rgb(220, 38, 38)");
  });
});

describe("replacing a weigh-in", () => {
  it("says Replace and shows the value it replaces", () => {
    vi.setSystemTime(at(7, 21));
    render(<WeightLogEditor />);
    expect(poundsInput().value).toBe("100.0");
    const replace = screen.getByRole<HTMLButtonElement>("button", {
      name: "Replace",
    });
    // The same value replaces nothing.
    expect(replace.disabled).toBe(true);
    expect(screen.queryByText("Replaces 100.0 lb")).toBeNull();

    fireEvent.change(poundsInput(), { target: { value: "99.6" } });
    expect(replace.disabled).toBe(false);
    expect(screen.getByText("Replaces 100.0 lb")).toBeTruthy();
    fireEvent.click(replace);
    expect(mocks.upsert).toHaveBeenCalledWith(
      { date: "2030-01-07", pounds: 99.6 },
      expect.anything(),
    );
  });

  it("says Save on a date with no weigh-in", () => {
    vi.setSystemTime(at(9, 7));
    render(<WeightLogEditor />);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Replace" })).toBeNull();
  });
});

describe("weekly table", () => {
  it("shows the seven days before the summary and fills them from the scales", () => {
    mocks.rows = [
      {
        ...row("2030-01-07", [100, 140, 102, 104, null, null, null], 100, [1]),
        gapToTarget: 1,
      },
      { ...row("2030-01-14", empty, 101), gapToTarget: -0.5 },
    ];
    render(<WeightLogEditor />);
    const table = screen.getByRole("table");
    const headers = [...table.querySelectorAll("thead th")].map(
      (cell) => cell.textContent,
    );
    expect(headers).toEqual([
      "#Week number",
      "Week",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
      "Avg",
      "Chg",
      "Target",
      "Gap",
      "lb/wk",
      "Orig",
      "Gap",
    ]);
    const [number, ...cells] = [
      ...[...table.querySelectorAll("tbody tr")][0]!.querySelectorAll("td"),
    ];
    // The phase's first week is week 0, the next week 1.
    expect(number!.textContent).toBe("0");
    expect(
      [...table.querySelectorAll("tbody tr")][1]!.querySelector("td")!
        .textContent,
    ).toBe("1");
    const fill = (cell: Element) =>
      (cell as HTMLElement).style.getPropertyValue("--wl-fill") || null;
    // Lowest counted weigh-in is white, highest green; the excluded 140 has
    // no fill and stays out of the range.
    expect([...cells].slice(0, 4).map(fill)).toEqual([
      "#fcfcff",
      null,
      "#b0ddbd",
      "#63be7b",
    ]);
    expect(cells[1]!.querySelector(".line-through")?.textContent).toContain(
      "140.0",
    );
    // Target 100 is the low end of the shared scale. The gap is colored
    // around zero, and a column with nothing in it stays plain.
    expect(fill(cells[9]!)).toBe("#5a8ac6");
    expect(fill(cells[10]!)).toBe("#f8696b");
    expect(fill(cells[8]!)).toBeNull();
  });
});

/** The server answers a mutate call: the hook's handler, then the call's. */
async function settle(call: Call, result: unknown) {
  await act(async () => {
    await call.hook.onSuccess?.(result, call.input);
    await call.call?.onSuccess?.(result, call.input);
  });
}

describe("a request that settles after the owner moved on", () => {
  it("keeps what the owner typed on the next date when a save lands", async () => {
    vi.setSystemTime(at(9, 7));
    render(<WeightLogEditor />);
    fireEvent.change(poundsInput(), { target: { value: "99.8" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const save = mocks.calls[0]!;
    expect(save.input).toEqual({ date: "2030-01-09", pounds: 99.8 });

    fireEvent.click(screen.getByRole("button", { name: /^Monday, January 7/ }));
    fireEvent.change(poundsInput(), { target: { value: "99.6" } });
    await settle(save, { date: "2030-01-09", pounds: 99.8 });

    expect(dateInput().value).toBe("2030-01-07");
    expect(poundsInput().value).toBe("99.6");
  });

  it("clears the draft it saved when the owner stayed on that date", async () => {
    vi.setSystemTime(at(9, 7));
    render(<WeightLogEditor />);
    fireEvent.change(poundsInput(), { target: { value: "99.8" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    mocks.rows = [
      row("2030-01-07", [100, 100.4, 99.8, ...empty.slice(3)], 100),
      row("2030-01-14", empty, 101),
    ];
    await settle(mocks.calls[0]!, { date: "2030-01-09", pounds: 99.8 });
    expect(poundsInput().value).toBe("99.8");
    const replace = screen.getByRole("button", { name: "Replace" });
    // The Plan section below has a status line of its own.
    expect(
      within(replace.closest("form")!).getByRole("status").textContent,
    ).toBe("Saved 99.8 lb for Jan 9.");
  });

  it("keeps the next date's draft and open confirmation when a delete lands", async () => {
    render(<WeightLogEditor />);
    fireEvent.click(screen.getByRole("button", { name: /^Monday, January 7/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const remove = mocks.calls[0]!;
    expect(remove.input).toEqual({ date: "2030-01-07" });

    fireEvent.click(
      screen.getByRole("button", { name: /^Tuesday, January 8/ }),
    );
    fireEvent.change(poundsInput(), { target: { value: "99.0" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await settle(remove, { deleted: true });

    expect(dateInput().value).toBe("2030-01-08");
    expect(poundsInput().value).toBe("99.0");
    expect(screen.getByText(/Delete 100.4 lb on/)).toBeTruthy();
  });
});

describe("a date no phase holds", () => {
  it("shows the weigh-in saved there, so it can be replaced or deleted", () => {
    mocks.unphased = [row("2029-12-03", [null, 99.5, ...empty.slice(2)], null)];
    render(<WeightLogEditor />);
    fireEvent.change(dateInput(), { target: { value: "2029-12-04" } });

    expect(poundsInput().value).toBe("99.5");
    expect(screen.getByRole("button", { name: "Replace" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mocks.calls.at(-1)!.input).toEqual({ date: "2029-12-04" });
  });
});

describe("the phase the weekly table shows", () => {
  const phases = [{ id: "4" }, { id: "5" }];

  it("keeps a picked phase while it exists", () => {
    expect(tablePhaseToShow("4", phases, "5")).toBe("4");
  });

  it("falls back to the current phase when the picked one was replaced", () => {
    expect(tablePhaseToShow("3", phases, "5")).toBe("5");
  });

  it("shows the current phase when nothing is picked", () => {
    expect(tablePhaseToShow(null, phases, "5")).toBe("5");
    expect(tablePhaseToShow(null, [], null)).toBeNull();
  });
});
