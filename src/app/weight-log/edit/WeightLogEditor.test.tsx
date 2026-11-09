// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WeekTableRow } from "~/lib/weight-log/week-table";

import { WeightLogEditor } from "./WeightLogEditor";

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
        weightLog: { weekTable: { invalidate: () => Promise.resolve() } },
      }),
      weightLog: {
        phases: {
          useQuery: () => ({
            data: {
              currentId: "1",
              phases: [
                {
                  id: "1",
                  label: "Bulk Jan '30 - Feb '30",
                  start: "2030-01-07",
                  end: "2030-02-03",
                },
              ],
            },
            isError: false,
            isFetching: false,
          }),
        },
        weekTable: {
          useQuery: () => ({
            data: { phaseId: "1", rows: mocks.rows },
            isPending: false,
            isError: false,
            isFetching: false,
          }),
        },
        upsertWeighIn: { useMutation: mutation(mocks.upsert) },
        deleteWeighIn: { useMutation: mutation(vi.fn()) },
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
    expect(poundsInput().value).toBe("");
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
      row("2030-01-07", [100, 140, 102, 104, null, null, null], 100, [1]),
      row("2030-01-14", empty, 101),
    ];
    render(<WeightLogEditor />);
    const table = screen.getByRole("table");
    const headers = [...table.querySelectorAll("thead th")].map(
      (cell) => cell.textContent,
    );
    expect(headers).toEqual([
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
    const cells = [...table.querySelectorAll("tbody tr")][0]!.querySelectorAll(
      "td",
    );
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
    // Target 100 is the low end of the shared scale; the gap columns stay plain.
    expect(fill(cells[9]!)).toBe("#5a8ac6");
    expect(fill(cells[10]!)).toBeNull();
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
    expect(screen.getByRole("button", { name: "Replace" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(
      "Saved 99.8 lb for Jan 9.",
    );
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
