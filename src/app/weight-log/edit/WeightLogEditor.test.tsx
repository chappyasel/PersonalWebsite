// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { TRPCClientError } from "@trpc/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WeekTableRow } from "~/lib/weight-log/week-table";

import { tablePhaseToShow } from "./WeekSheet";
import { WeightLogEditor } from "./WeightLogEditor";
import { WEEKS_CONTROLS_ID } from "./headerSlot";

// Invented numbers. None of them is the owner's.

/** A mutate call the test settles by hand, as the server would. */
interface Call {
  name: string;
  input: Record<string, unknown>;
  hook: MutationOptions;
  call?: MutationOptions;
  /** A `mutateAsync` call's promise, which the page awaits. */
  resolve?: (result: unknown) => void;
  reject?: (error: unknown) => void;
}
interface MutationOptions {
  onSuccess?: (result: unknown, input: Call["input"]) => unknown;
  onError?: (error: unknown) => unknown;
}

const mocks = vi.hoisted(() => ({
  rows: [] as WeekTableRow[],
  /** Weeks no phase holds. Only the calendar-week query returns them. */
  unphased: [] as WeekTableRow[],
  /** The latest counted weigh-in ahead of any week the grid asks for. */
  before: null as { date: string; pounds: number } | null,
  calls: [] as Call[],
  /** Each hook's latest call, as TanStack Query tracks it. */
  latest: {} as Record<string, Call>,
  invalidate: vi.fn(() => Promise.resolve()),
}));

const empty = [null, null, null, null, null, null, null];
const row = (
  week: string,
  weights: (number | null)[],
  target: number | null,
  poundsPerWeek: number | null = null,
  excludedDays: number[] = [],
): WeekTableRow => ({
  week,
  weights,
  excludedDays,
  average: null,
  change: null,
  target,
  gapToTarget: null,
  poundsPerWeek,
  originalTarget: target,
  gapToOriginalTarget: null,
});

vi.mock("~/trpc/react", () => {
  const record = (call: Call) => {
    mocks.calls.push(call);
    mocks.latest[call.name] = call;
  };
  const mutation = (name: string) => (hook: MutationOptions) => ({
    mutate: (input: Call["input"], call?: MutationOptions) =>
      record({ name, input, hook, call }),
    mutateAsync: (input: Call["input"]) =>
      new Promise((resolve, reject) =>
        record({ name, input, hook, resolve, reject }),
      ),
    isPending: false,
  });
  const invalidate = { invalidate: mocks.invalidate };
  return {
    api: {
      useUtils: () => ({
        weightLog: {
          phases: invalidate,
          week: invalidate,
          weekTable: invalidate,
          setPoints: invalidate,
        },
      }),
      weightLog: {
        phases: {
          useQuery: () => ({
            data: {
              currentId: "1",
              runningId: "1",
              revision: "rev-1",
              phases: [
                {
                  id: "1",
                  label: "Bulk Jan '30 - Feb '30",
                  kind: "bulk",
                  start: "2030-01-07",
                  end: "2030-01-27",
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
                  data: { phaseId, rows: mocks.rows, revision: "rev-1" },
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
                previousAverage: null,
                before: mocks.before,
              },
              isPending: false,
              isError: false,
              isFetching: false,
            };
          },
        },
        upsertWeighIn: { useMutation: mutation("upsertWeighIn") },
        deleteWeighIn: { useMutation: mutation("deleteWeighIn") },
        restoreWeighIn: { useMutation: mutation("restoreWeighIn") },
        changeRate: { useMutation: mutation("changeRate") },
        // The plan and set point forms have their own tests (PlanEditor.test.tsx).
        moveEnd: { useMutation: mutation("moveEnd") },
        startPhase: { useMutation: mutation("startPhase") },
        setPoints: {
          useQuery: () => ({ data: [], isError: false, isFetching: false }),
        },
        saveSetPoints: { useMutation: mutation("saveSetPoints") },
      },
    },
  };
});

/** A local clock time, so the test reads the same in any time zone. */
const at = (day: number, hour: number) => new Date(2030, 0, day, hour);

const cell = (name: string) =>
  screen.getByRole<HTMLButtonElement>("button", {
    name: new RegExp(`^${name}(,|$)`),
  });
const input = (name: string) =>
  screen.getByRole<HTMLInputElement>("textbox", { name });
/** Tap a cell and type into the input it becomes. */
function typeInto(name: string, value: string) {
  fireEvent.click(cell(name));
  fireEvent.change(input(name), { target: { value } });
  return input(name);
}
const press = (target: HTMLElement, key: string, shiftKey = false) =>
  fireEvent.keyDown(target, { key, shiftKey });

/** Let the page's `.then` handlers run. */
async function flush() {
  for (let tick = 0; tick < 5; tick++) await Promise.resolve();
}
/**
 * The server answers a call: the hook's handler, then the call's own, which
 * TanStack Query v5 runs only for the hook's latest `mutate` call, then the
 * promise of a `mutateAsync` call.
 */
async function settle(call: Call, result: unknown = {}) {
  await act(async () => {
    await call.hook.onSuccess?.(result, call.input);
    if (mocks.latest[call.name] === call) {
      await call.call?.onSuccess?.(result, call.input);
    }
    call.resolve?.(result);
    await flush();
  });
}
async function refuse(call: Call, error: unknown) {
  await act(async () => {
    await call.hook.onError?.(error);
    if (mocks.latest[call.name] === call) await call.call?.onError?.(error);
    call.reject?.(error);
    await flush();
  });
}
const refusal = (message: string, code = "BAD_REQUEST") =>
  new TRPCClientError(message, {
    result: { error: { data: { code } } },
  } as never);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(8, 21));
  mocks.rows = [
    row("2030-01-07", [100, 100.4, ...empty.slice(2)], 100),
    row("2030-01-14", empty, 100.5, 0.5),
    row("2030-01-21", empty, 101, 0.5),
  ];
});

afterEach(() => {
  mocks.calls = [];
  mocks.latest = {};
  mocks.unphased = [];
  mocks.before = null;
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("the page", () => {
  it("shows the Weeks table open, with no form and no section to fold", () => {
    render(<WeightLogEditor />);
    expect(screen.queryByRole("button", { name: "Weigh-in" })).toBeNull();
    expect(screen.queryByLabelText("Date")).toBeNull();
    expect(screen.queryByLabelText("Pounds")).toBeNull();
    expect(screen.queryByRole("form", { name: "Weekly rate" })).toBeNull();
    // Plan and Set points have pages of their own.
    expect(screen.queryByRole("form", { name: "Length" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Set points" })).toBeNull();
    // The table isn't an accordion, and has no heading of its own.
    expect(screen.queryByRole("button", { name: "Weeks" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Weeks" })).toBeNull();
    expect(screen.getByRole("region", { name: "Weeks" })).toBeTruthy();
  });

  it("shows Length and Start a phase on the Plan page", () => {
    render(<WeightLogEditor view="plan" />);
    expect(screen.getByRole("heading", { name: "Plan" })).toBeTruthy();
    expect(screen.getByRole("form", { name: "Length" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start a phase" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Weeks" })).toBeNull();
  });

  it("shows the set points on their own page", () => {
    render(<WeightLogEditor view="set-points" />);
    expect(screen.getByRole("heading", { name: "Set points" })).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Length" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Weeks" })).toBeNull();
  });

  it("puts the phase picker and Go to date in the header's slot", () => {
    const slot = document.createElement("div");
    slot.id = WEEKS_CONTROLS_ID;
    document.body.append(slot);
    try {
      render(<WeightLogEditor />);
      const region = screen.getByRole("region", { name: "Weeks" });
      for (const control of [
        screen.getByRole("combobox", { name: "Phase" }),
        screen.getByLabelText("Go to date"),
      ]) {
        expect(slot.contains(control)).toBe(true);
        expect(region.contains(control)).toBe(false);
      }
    } finally {
      slot.remove();
    }
  });

  it("opens where the page starts, without scrolling to this week", () => {
    const scrollIntoView = vi.fn();
    const original = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "scrollIntoView",
    );
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      render(<WeightLogEditor />);
      // This week's day still carries its outline.
      expect(
        document.querySelector('button[aria-current="date"]'),
      ).not.toBeNull();
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      if (original)
        Object.defineProperty(Element.prototype, "scrollIntoView", original);
      else
        delete (Element.prototype as { scrollIntoView?: unknown })
          .scrollIntoView;
    }
  });
});

describe("a day cell", () => {
  it("turns into an input, and Return saves the weigh-in", async () => {
    render(<WeightLogEditor />);
    const field = typeInto("Weigh-in, Mon, Jan 7", "99.84");
    expect(field.getAttribute("inputmode")).toBe("decimal");
    press(field, "Enter");
    expect(mocks.calls.map(({ name, input }) => [name, input])).toEqual([
      ["upsertWeighIn", { date: "2030-01-07", pounds: 99.8 }],
    ]);
    // The cell shows what was sent until the table comes back.
    expect(cell("Weigh-in, Mon, Jan 7").textContent).toBe("99.8");

    mocks.rows[0] = row("2030-01-07", [99.8, 100.4, ...empty.slice(2)], 100);
    await settle(mocks.calls[0]!);
    expect(
      screen.getByText("Changed Mon, Jan 7 from 100.0 to 99.8 lb."),
    ).toBeTruthy();
    expect(document.activeElement).toBe(cell("Weigh-in, Mon, Jan 7"));
  });

  it("puts the caret at the end with nothing selected", () => {
    render(<WeightLogEditor />);
    fireEvent.click(cell("Weigh-in, Mon, Jan 7"));
    const field = input("Weigh-in, Mon, Jan 7");
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe("100.0");
    expect(field.selectionStart).toBe(5);
    expect(field.selectionEnd).toBe(5);
  });

  it("saves when the owner leaves the cell", () => {
    render(<WeightLogEditor />);
    fireEvent.blur(typeInto("Weigh-in, Mon, Jan 7", "99.6"));
    expect(mocks.calls[0]!.input).toEqual({ date: "2030-01-07", pounds: 99.6 });
  });

  it("cancels on Escape", () => {
    render(<WeightLogEditor />);
    press(typeInto("Weigh-in, Mon, Jan 7", "99.6"), "Escape");
    expect(mocks.calls).toEqual([]);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(cell("Weigh-in, Mon, Jan 7").textContent).toBe("100.0");
  });

  it("sends nothing for an unchanged value", () => {
    render(<WeightLogEditor />);
    press(typeInto("Weigh-in, Mon, Jan 7", "100"), "Enter");
    expect(mocks.calls).toEqual([]);
  });

  it("keeps an invalid number open and says why", () => {
    render(<WeightLogEditor />);
    const field = typeInto("Weigh-in, Mon, Jan 7", "abc");
    press(field, "Enter");
    expect(mocks.calls).toEqual([]);
    expect(input("Weigh-in, Mon, Jan 7").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(screen.getByText("Type a weight in pounds.")).toBeTruthy();
  });

  it("can't take a day after today", () => {
    render(<WeightLogEditor />);
    expect(
      screen.queryByRole("button", { name: /^Weigh-in, Wed, Jan 9/ }),
    ).toBeNull();
    expect(cell("Weigh-in, Tue, Jan 8")).toBeTruthy();
  });

  it("moves to the next and previous editable cell with Tab", () => {
    render(<WeightLogEditor />);
    fireEvent.click(cell("Weigh-in, Mon, Jan 7"));
    press(input("Weigh-in, Mon, Jan 7"), "Tab");
    expect(document.activeElement).toBe(input("Weigh-in, Tue, Jan 8"));
    press(input("Weigh-in, Tue, Jan 8"), "Tab", true);
    expect(document.activeElement).toBe(input("Weigh-in, Mon, Jan 7"));
    expect(mocks.calls).toEqual([]);
  });

  it("goes from the last day through today to the plan cells", () => {
    vi.setSystemTime(at(14, 21));
    render(<WeightLogEditor />);
    fireEvent.click(cell("Weigh-in, Mon, Jan 14"));
    press(input("Weigh-in, Mon, Jan 14"), "Tab");
    expect(document.activeElement).toBe(input("Target, week of Jan 14"));
    press(input("Target, week of Jan 14"), "Tab");
    expect(document.activeElement).toBe(input("lbs/w, week of Jan 14"));
  });
});

describe("clearing a day", () => {
  it("deletes the weigh-in, and Undo puts it back", async () => {
    render(<WeightLogEditor />);
    press(typeInto("Weigh-in, Mon, Jan 7", ""), "Enter");
    expect(mocks.calls[0]!.name).toBe("deleteWeighIn");
    expect(mocks.calls[0]!.input).toEqual({ date: "2030-01-07" });

    mocks.rows[0] = row("2030-01-07", [null, 100.4, ...empty.slice(2)], 100);
    await settle(mocks.calls[0]!);
    expect(screen.getByText("Deleted 100.0 lb from Mon, Jan 7.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mocks.calls[1]!.name).toBe("restoreWeighIn");
    expect(mocks.calls[1]!.input).toEqual({
      date: "2030-01-07",
      pounds: 100,
      excluded: false,
    });
    await settle(mocks.calls[1]!);
    expect(screen.getByText("Put Mon, Jan 7 back to 100.0 lb.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("puts an excluded weigh-in back still excluded", async () => {
    mocks.rows[0] = row(
      "2030-01-07",
      [100, 100.4, ...empty.slice(2)],
      100,
      null,
      [1],
    );
    render(<WeightLogEditor />);
    press(typeInto("Weigh-in, Tue, Jan 8", ""), "Enter");
    mocks.rows[0] = row("2030-01-07", [100, ...empty.slice(1)], 100);
    await settle(mocks.calls[0]!);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mocks.calls[1]!.name).toBe("restoreWeighIn");
    expect(mocks.calls[1]!.input).toEqual({
      date: "2030-01-08",
      pounds: 100.4,
      excluded: true,
    });
    await settle(mocks.calls[1]!);
    expect(
      screen.getByText(
        "Put Tue, Jan 8 back to 100.4 lb, still left out of the weekly average.",
      ),
    ).toBeTruthy();
  });

  it("leaves a day that has a weigh-in again, and refetches it", async () => {
    render(<WeightLogEditor />);
    press(typeInto("Weigh-in, Mon, Jan 7", ""), "Enter");
    await settle(mocks.calls[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    const again =
      "That day has a weigh-in again, so the undo left it as it is.";
    await refuse(mocks.calls[1]!, refusal(again, "CONFLICT"));
    expect(screen.getByText(again)).toBeTruthy();
    expect(mocks.invalidate).toHaveBeenCalled();
  });

  it("undoes a new weigh-in by deleting it", async () => {
    vi.setSystemTime(at(10, 7));
    render(<WeightLogEditor />);
    press(typeInto("Weigh-in, Thu, Jan 10", "99.9"), "Enter");
    await settle(mocks.calls[0]!);
    expect(screen.getByText("Saved 99.9 lb for Thu, Jan 10.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mocks.calls[1]!.name).toBe("deleteWeighIn");
    expect(mocks.calls[1]!.input).toEqual({ date: "2030-01-10" });
  });

  it("undoes a replace with the old pounds", async () => {
    render(<WeightLogEditor />);
    press(typeInto("Weigh-in, Tue, Jan 8", "99.9"), "Enter");
    await settle(mocks.calls[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mocks.calls[1]!.input).toEqual({
      date: "2030-01-08",
      pounds: 100.4,
    });
  });
});

describe("overlapping saves", () => {
  it("settle each cell, in whichever order the server answers", async () => {
    render(<WeightLogEditor />);
    press(typeInto("Weigh-in, Mon, Jan 7", "99.8"), "Enter");
    press(typeInto("Weigh-in, Tue, Jan 8", "99.6"), "Enter");
    const [first, second] = mocks.calls;
    const saving = (name: string) =>
      cell(name).getAttribute("aria-label")!.endsWith("saving");
    expect(saving("Weigh-in, Mon, Jan 7")).toBe(true);
    expect(saving("Weigh-in, Tue, Jan 8")).toBe(true);

    // The later save lands first. The first is still in flight, so Undo
    // waits for it.
    mocks.rows[0] = row("2030-01-07", [100, 99.6, ...empty.slice(2)], 100);
    await settle(second!);
    expect(
      screen.getByText("Changed Tue, Jan 8 from 100.4 to 99.6 lb."),
    ).toBeTruthy();
    expect(saving("Weigh-in, Tue, Jan 8")).toBe(false);
    expect(saving("Weigh-in, Mon, Jan 7")).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Undo" }).disabled,
    ).toBe(true);

    mocks.rows[0] = row("2030-01-07", [99.8, 99.6, ...empty.slice(2)], 100);
    await settle(first!);
    expect(saving("Weigh-in, Mon, Jan 7")).toBe(false);
    expect(cell("Weigh-in, Mon, Jan 7").textContent).toBe("99.8");
    expect(
      screen.getByText("Changed Mon, Jan 7 from 100.0 to 99.8 lb."),
    ).toBeTruthy();
    const undo = screen.getByRole<HTMLButtonElement>("button", {
      name: "Undo",
    });
    expect(undo.disabled).toBe(false);
    fireEvent.click(undo);
    expect(mocks.calls[2]!.input).toEqual({ date: "2030-01-07", pounds: 100 });
  });

  it("settle a refusal and a save on their own cells", async () => {
    render(<WeightLogEditor />);
    press(typeInto("Weigh-in, Mon, Jan 7", "99.8"), "Enter");
    press(typeInto("Weigh-in, Tue, Jan 8", "99.6"), "Enter");
    const [first, second] = mocks.calls;
    await settle(second!);
    await refuse(first!, refusal("That date is too early."));
    expect(screen.getByText("That date is too early.")).toBeTruthy();
    expect(cell("Weigh-in, Mon, Jan 7").getAttribute("aria-label")).toMatch(
      /not saved$/,
    );
    expect(cell("Weigh-in, Tue, Jan 8").getAttribute("aria-label")).not.toMatch(
      /saving|not saved/,
    );
  });
});

describe("a refusal", () => {
  it("shows the server's message and keeps what was typed", async () => {
    render(<WeightLogEditor />);
    press(typeInto("Weigh-in, Mon, Jan 7", "99.6"), "Enter");
    await refuse(
      mocks.calls[0]!,
      refusal("That date is in the future.", "BAD_REQUEST"),
    );
    expect(screen.getByText("That date is in the future.")).toBeTruthy();
    expect(cell("Weigh-in, Mon, Jan 7").textContent).toBe("99.6");
    expect(cell("Weigh-in, Mon, Jan 7").getAttribute("aria-label")).toMatch(
      /not saved$/,
    );
    fireEvent.click(cell("Weigh-in, Mon, Jan 7"));
    expect(input("Weigh-in, Mon, Jan 7").value).toBe("99.6");
  });

  it("refetches the plan when it changed since the page loaded", async () => {
    render(<WeightLogEditor />);
    press(typeInto("Target, week of Jan 14", "101"), "Enter");
    const stale =
      "The plan changed since this page loaded it. Check it and try again.";
    await refuse(mocks.calls[0]!, refusal(stale, "CONFLICT"));
    expect(screen.getByText(stale)).toBeTruthy();
    expect(mocks.invalidate).toHaveBeenCalled();
    expect(cell("Target, week of Jan 14").textContent).toBe("101");
  });
});

describe("the plan cells", () => {
  it("sends a target as the rate from the week before, with the revision", async () => {
    render(<WeightLogEditor />);
    press(typeInto("Target, week of Jan 14", "101.2"), "Enter");
    expect(mocks.calls.map(({ name, input }) => [name, input])).toEqual([
      [
        "changeRate",
        {
          phaseId: "1",
          weekStart: "2030-01-14",
          poundsPerWeek: 1.2,
          revision: "rev-1",
        },
      ],
    ]);
    // Both views of the edit show it until the plan comes back.
    expect(cell("Target, week of Jan 14").textContent).toBe("101.2");
    expect(cell("lbs/w, week of Jan 14").textContent).toBe("+1.2");
    await settle(mocks.calls[0]!);
    expect(
      screen.getByText(
        "Set the week of Jan 14 to 101.2 lb at +1.2 lbs/w. Later targets moved +0.7 lb.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mocks.calls[1]!.input).toEqual({
      phaseId: "1",
      weekStart: "2030-01-14",
      poundsPerWeek: 0.5,
      revision: "rev-1",
    });
  });

  it("lands a target exactly on what was typed, and undoes an imported rate exactly", async () => {
    mocks.rows = [
      row("2030-01-07", empty, 100.333333),
      row("2030-01-14", empty, 100.666666, 0.333333),
    ];
    render(<WeightLogEditor />);
    press(typeInto("Target, week of Jan 14", "101"), "Enter");
    expect(mocks.calls[0]!.input).toMatchObject({ poundsPerWeek: 0.666667 });
    await settle(mocks.calls[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mocks.calls[1]!.input).toMatchObject({ poundsPerWeek: 0.333333 });
  });

  it("sends an lbs/w to two decimals", () => {
    render(<WeightLogEditor />);
    press(typeInto("lbs/w, week of Jan 21", "-0.254"), "Enter");
    expect(mocks.calls[0]!.input).toEqual({
      phaseId: "1",
      weekStart: "2030-01-21",
      poundsPerWeek: -0.25,
      revision: "rev-1",
    });
  });

  it("starts an lbs/w from its two-decimal value", () => {
    render(<WeightLogEditor />);
    fireEvent.click(cell("lbs/w, week of Jan 21"));
    expect(input("lbs/w, week of Jan 21").value).toBe("0.50");
  });

  it("reads a quarter-pound rate to one decimal but edits it at two", () => {
    mocks.rows = [
      row("2030-01-07", empty, 100),
      row("2030-01-14", empty, 100.25, 0.25),
      row("2030-01-21", empty, 100, -0.25),
    ];
    render(<WeightLogEditor />);
    expect(cell("lbs/w, week of Jan 14").textContent).toBe("+0.3");
    expect(cell("lbs/w, week of Jan 21").textContent).toBe("−0.3");
    // The field opens on the stored 0.25, so saving it untouched sends
    // nothing, and a typed 0.3 still saves as 0.3.
    fireEvent.click(cell("lbs/w, week of Jan 14"));
    expect(input("lbs/w, week of Jan 14").value).toBe("0.25");
    press(input("lbs/w, week of Jan 14"), "Enter");
    expect(mocks.calls).toEqual([]);
    press(typeInto("lbs/w, week of Jan 14", "0.3"), "Enter");
    expect(mocks.calls[0]!.input).toMatchObject({
      weekStart: "2030-01-14",
      poundsPerWeek: 0.3,
    });
  });

  it("keeps the phase's first week read-only", () => {
    render(<WeightLogEditor />);
    expect(
      screen.queryByRole("button", { name: /^Target, week of Jan 7/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^lbs\/w, week of Jan 7/ }),
    ).toBeNull();
  });
});

/** The muted text class itself, not the input's placeholder variant. */
const MUTED = /(^|\s)text-muted-foreground(\s|$)/;

describe("today", () => {
  it("has a red outline", () => {
    render(<WeightLogEditor />);
    const today = cell("Weigh-in, Tue, Jan 8, today");
    expect(today.getAttribute("aria-current")).toBe("date");
    expect(today.className).toMatch(/ring-red-600/);
    expect(cell("Weigh-in, Mon, Jan 7").className).not.toMatch(/ring-red/);
  });

  it("moves when the day turns over with the page open", () => {
    render(<WeightLogEditor />);
    vi.setSystemTime(at(9, 7));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(cell("Weigh-in, Wed, Jan 9, today").className).toMatch(
      /ring-red-600/,
    );
    expect(cell("Weigh-in, Tue, Jan 8").className).not.toMatch(/ring-red/);
  });

  it("starts an empty today from the last weigh-in, muted and unsaved", () => {
    vi.setSystemTime(at(9, 7));
    render(<WeightLogEditor />);
    fireEvent.click(cell("Weigh-in, Wed, Jan 9, today"));
    const field = input("Weigh-in, Wed, Jan 9");
    expect(field.value).toBe("100.4");
    expect(field.className).toMatch(MUTED);
    expect(
      screen.getByText("Filled in from yesterday. Not saved yet."),
    ).toBeTruthy();

    // Leaving it untouched saves nothing; Return saves the carried value.
    fireEvent.blur(field);
    expect(mocks.calls).toEqual([]);
    fireEvent.click(cell("Weigh-in, Wed, Jan 9, today"));
    press(input("Weigh-in, Wed, Jan 9"), "Enter");
    expect(mocks.calls[0]!.input).toEqual({
      date: "2030-01-09",
      pounds: 100.4,
    });
  });

  it("looks before the week when the week has nothing earlier", () => {
    mocks.before = { date: "2030-01-03", pounds: 98.6 };
    vi.setSystemTime(at(14, 7));
    render(<WeightLogEditor />);
    fireEvent.click(cell("Weigh-in, Mon, Jan 14, today"));
    expect(input("Weigh-in, Mon, Jan 14").value).toBe("98.6");
    expect(
      screen.getByText("Filled in from Thu, Jan 3. Not saved yet."),
    ).toBeTruthy();
  });

  it("leaves other empty days blank", () => {
    vi.setSystemTime(at(14, 7));
    render(<WeightLogEditor />);
    fireEvent.click(cell("Weigh-in, Thu, Jan 10"));
    expect(input("Weigh-in, Thu, Jan 10").value).toBe("");
  });

  it("gets a row when the plan has ended and the week has no weigh-in", () => {
    vi.setSystemTime(at(29, 7));
    render(<WeightLogEditor />);
    const today = cell("Weigh-in, Tue, Jan 29, today");
    expect(today.closest("table")!.getAttribute("aria-label")).toBe(
      "Weeks of Bulk Jan '30 - Feb '30",
    );
  });
});

describe("go to date", () => {
  it("opens a day outside every phase in a table of its own", () => {
    mocks.unphased = [row("2029-10-29", [null, 99.5, ...empty.slice(2)], null)];
    render(<WeightLogEditor />);
    fireEvent.change(screen.getByLabelText("Go to date"), {
      target: { value: "2029-10-30" },
    });
    const field = input("Weigh-in, Tue, Oct 30, 2029");
    expect(field.value).toBe("99.5");
    expect(field.closest("table")!.getAttribute("aria-label")).toBe(
      "Weeks outside every phase",
    );
    fireEvent.change(field, { target: { value: "99.1" } });
    press(field, "Enter");
    expect(mocks.calls[0]!.input).toEqual({ date: "2029-10-30", pounds: 99.1 });
  });

  it("opens a day in the shown phase", () => {
    vi.setSystemTime(at(16, 7));
    render(<WeightLogEditor />);
    fireEvent.change(screen.getByLabelText("Go to date"), {
      target: { value: "2030-01-15" },
    });
    expect(document.activeElement).toBe(input("Weigh-in, Tue, Jan 15"));
  });
});

describe("the phase picker", () => {
  it("shows the picked phase with its color, cycle, and weeks", () => {
    render(<WeightLogEditor />);
    const trigger = screen.getByRole("combobox", { name: "Phase" });
    // The bulk started second, so it is Cycle 2. Jan 7 to Jan 27 is 3 weeks.
    expect(trigger.textContent).toContain("Bulk Jan '30 - Feb '30");
    expect(trigger.textContent).toContain("Cycle 2 · 3 wk");
    const dot = trigger.querySelector<HTMLElement>(
      "[aria-hidden].rounded-full",
    );
    expect(dot?.style.background).toBe("rgb(220, 38, 38)");
  });
});

describe("weekly table", () => {
  it("shows the seven days before the summary and fills them from the scales", () => {
    mocks.rows = [
      {
        ...row(
          "2030-01-07",
          [100, 140, 102, 104, null, null, null],
          100,
          null,
          [1],
        ),
        gapToTarget: 1,
      },
      { ...row("2030-01-14", empty, 101, 1), gapToTarget: -0.5 },
    ];
    vi.setSystemTime(at(12, 7));
    render(<WeightLogEditor />);
    const table = screen.getByRole("table");
    const headers = [...table.querySelectorAll("thead th")].map(
      (item) => item.textContent,
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
      "+/-",
      "Target",
      "Gap",
      "lbs/w",
      "Orig",
      "Gap",
    ]);
    const cells = [
      ...[...table.querySelectorAll("tbody tr")][0]!.querySelectorAll("td"),
    ];
    // Each row is headed by its number in the phase beside its Monday, the
    // month over the day, as on the Log Weight card. The phase's first week
    // is week 0, the next week 1.
    const rowHeaders = screen.getAllByRole("rowheader");
    expect(rowHeaders.map((item) => item.textContent)).toEqual([
      "0Jan7Jan 7, week 0",
      "1Jan14Jan 14, week 1",
    ]);
    expect(
      rowHeaders.map(
        (item) => item.querySelector("[data-number]")!.textContent,
      ),
    ).toEqual(["0", "1"]);
    const fill = (item: Element) =>
      (item as HTMLElement).style.getPropertyValue("--wl-fill") || null;
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
    expect(cell("Weigh-in, Tue, Jan 8").getAttribute("aria-label")).toBe(
      "Weigh-in, Tue, Jan 8, 140.0 lb, left out of the weekly average",
    );
    // Target 100 is the low end of the shared scale. The gap is colored
    // around zero, and a column with nothing in it stays plain.
    expect(fill(cells[9]!)).toBe("#5a8ac6");
    expect(fill(cells[10]!)).toBe("#f8696b");
    expect(fill(cells[8]!)).toBeNull();
    // lbs/w reads to one decimal, though the plan stores six.
    const second = [
      ...[...table.querySelectorAll("tbody tr")][1]!.querySelectorAll("td"),
    ];
    expect(second[11]!.textContent).toBe("+1.0");
    // An empty value's dash is light gray, and a number never is.
    expect(second[7]!.textContent).toBe("—");
    expect(second[7]!.className).toContain("text-neutral-300");
    expect(second[9]!.className).not.toContain("text-neutral-300");
  });
});

describe("the phase the weekly table shows", () => {
  const phases = [{ id: "4" }, { id: "5" }];

  it("keeps a picked phase while it exists", () => {
    expect(tablePhaseToShow("4", phases, "5")).toBe("4");
  });

  it("falls back to the phase holding today when the picked one was replaced", () => {
    expect(tablePhaseToShow("3", phases, "5")).toBe("5");
  });

  it("shows the phase holding today when nothing is picked", () => {
    expect(tablePhaseToShow(null, phases, "5")).toBe("5");
    expect(tablePhaseToShow(null, [], null)).toBeNull();
  });
});
