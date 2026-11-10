// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addDays, weekStartOf } from "~/lib/weight-log/phases";
import type { WeightLog } from "~/lib/weight-log/schema";
import { weekCard } from "~/lib/weight-log/week-card";
import {
  HALF_TENTH_LOG,
  SYNTHETIC_LOG,
} from "~/lib/weight-log/week-summary.fixture";
import { buildWeekTable, weeklyAverage } from "~/lib/weight-log/week-table";

import { TooltipProvider } from "~/components/ui/tooltip";

import { WeekSheet } from "~/app/weight-log/edit/WeekSheet";

import { WeekCardImage } from "./WeekCard";

/**
 * The card is a snapshot of the editor's Weeks table, so each of its rows
 * must read and color exactly as the editor's row for the same week does.
 * The editor here is the real `WeekSheet`, fed the same invented log through
 * a stand-in for its tRPC queries that answers as the server would. Every
 * number is invented.
 */

const mocks = vi.hoisted(() => ({
  log: null as unknown as Pick<WeightLog, "phases" | "weeks">,
  runningId: null as string | null,
}));

vi.mock("~/trpc/react", async () => {
  const { addDays } = await import("~/lib/weight-log/phases");
  const answer = <T,>(data: T) => ({
    data,
    isPending: false,
    isError: false,
    isFetching: false,
  });
  const mutation = () => ({
    mutate: () => undefined,
    mutateAsync: () => new Promise(() => undefined),
    isPending: false,
  });
  const invalidate = { invalidate: () => Promise.resolve() };
  return {
    api: {
      useUtils: () => ({
        weightLog: { phases: invalidate, week: invalidate, weekTable: invalidate },
      }),
      weightLog: {
        phases: {
          useQuery: () =>
            answer({
              currentId: mocks.log.phases.at(-1)?.id ?? null,
              runningId: mocks.runningId,
              revision: "rev-1",
              phases: [...mocks.log.phases].reverse(),
            }),
        },
        weekTable: {
          useQuery: ({ phaseId }: { phaseId: string }) =>
            answer({
              phaseId,
              rows: buildWeekTable(mocks.log, phaseId),
              revision: "rev-1",
            }),
        },
        week: {
          useQuery: ({ week }: { week: string }) => {
            const days = (monday: string) =>
              mocks.log.weeks.find((item) => item.date === monday);
            const found = days(week);
            const before = days(addDays(week, -7));
            return answer({
              week,
              weights: found?.weights ?? Array(7).fill(null),
              excludedDays: found
                ? found.weights.flatMap((weight, day) =>
                    weight !== null && !found.averageDays.includes(day)
                      ? [day]
                      : [],
                  )
                : [],
              previousAverage: before ? weeklyAverage(before) : null,
              before: null,
            });
          },
        },
        upsertWeighIn: { useMutation: mutation },
        deleteWeighIn: { useMutation: mutation },
        restoreWeighIn: { useMutation: mutation },
        changeRate: { useMutation: mutation },
      },
    },
  };
});

afterEach(cleanup);

/**
 * With no running phase, the loader leaves a week past every phase's end
 * outside them all, as here for the week of Feb 18.
 */
const OUTSIDE_LOG: Pick<WeightLog, "phases" | "weeks"> = {
  ...SYNTHETIC_LOG,
  weeks: SYNTHETIC_LOG.weeks.map((week) =>
    week.date === "2030-02-18" ? { ...week, phaseId: "unassigned" } : week,
  ),
};

/** Two weeks in a row outside every phase, both with weigh-ins. */
const OUTSIDE_PAIR_LOG: Pick<WeightLog, "phases" | "weeks"> = {
  ...OUTSIDE_LOG,
  weeks: [
    ...OUTSIDE_LOG.weeks,
    {
      date: "2030-02-25",
      phaseId: "unassigned",
      weights: [102.4, 101.9, null, null, null, null, null],
      averageDays: [0, 1, 2, 3, 4, 5, 6],
      target: null,
      originalTarget: null,
    },
  ],
};

/** A color as the DOM reads it back, so hex and rgb() compare equal. */
function colorOf(value: string) {
  const probe = document.createElement("div");
  probe.style.color = value;
  return probe.style.color;
}

interface Cell {
  text: string;
  fill: string | null;
  ink: string | null;
}

/** The editor's row for a week, from the table named `table`. */
function editorRow(today: string, table: string, label: string): Cell[] {
  const { container, unmount } = render(
    <TooltipProvider>
      <WeekSheet today={today} />
    </TooltipProvider>,
  );
  const row = [
    ...container.querySelectorAll(`table[aria-label="${table}"] tbody tr`),
  ].find((item) => item.querySelector("th")?.textContent?.trim() === label);
  if (!row) throw new Error(`The editor's ${table} has no row for ${label}`);
  const cells = [...row.children].map((cell) => {
    const style = (cell as HTMLElement).style;
    const fill = style.getPropertyValue("--wl-fill");
    const ink = style.getPropertyValue("--wl-ink");
    return {
      text: cell.textContent?.trim() ?? "",
      fill: fill ? colorOf(fill) : null,
      ink: ink ? colorOf(ink) : null,
    };
  });
  unmount();
  return cells;
}

/** The card's row for a week, read from the markup satori draws. */
function cardRows(log: Pick<WeightLog, "phases" | "weeks">, date: string) {
  const card = weekCard(log, date, mocks.runningId);
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<WeekCardImage card={card} />);
  return card.rows.map((item) => {
    const row = host.querySelector(`[data-week="${item.row.week}"]`)!;
    return {
      item,
      cells: [...row.children].map((cell) => {
        const style = (cell as HTMLElement).style;
        return {
          text: cell.textContent?.trim() ?? "",
          fill: style.backgroundColor ? colorOf(style.backgroundColor) : null,
          ink: style.backgroundColor ? colorOf(style.color) : null,
        };
      }),
    };
  });
}

/**
 * Each card row against the editor showing that row's phase: the editor
 * opens on the phase holding its today, so a row from the week before sets
 * today to that week's Sunday.
 */
function expectRowsMatchEditor(
  log: Pick<WeightLog, "phases" | "weeks">,
  date: string,
  runningId: string | null,
) {
  mocks.log = log;
  mocks.runningId = runningId;
  const rows = cardRows(log, date);
  for (const { item, cells } of rows) {
    const today =
      item.row.week === weekStartOf(date) ? date : addDays(item.row.week, 6);
    const table = item.phase
      ? `Weeks of ${item.phase.label}`
      : "Weeks outside every phase";
    expect(cells).toEqual(editorRow(today, table, cells[1]!.text));
  }
  return rows;
}

describe("WeekCardImage", () => {
  it.each([
    ["a phase boundary", SYNTHETIC_LOG, "2030-01-22", "2"],
    ["a full week after a part week", SYNTHETIC_LOG, "2030-01-13", "2"],
    ["an excluded day", SYNTHETIC_LOG, "2030-01-31", "2"],
    ["one weigh-in", SYNTHETIC_LOG, "2030-02-04", "2"],
    ["a planned week with no weigh-ins", SYNTHETIC_LOG, "2030-02-12", "2"],
    ["no target past the plan", SYNTHETIC_LOG, "2030-02-19", "2"],
    ["an empty week the running phase holds", SYNTHETIC_LOG, "2030-02-26", "2"],
    ["weeks outside every phase", OUTSIDE_LOG, "2030-02-26", null],
    [
      "two weigh-in weeks outside every phase",
      OUTSIDE_PAIR_LOG,
      "2030-02-26",
      null,
    ],
    ["the log's first week", SYNTHETIC_LOG, "2030-01-08", "2"],
  ] as const)(
    "reads and colors each row as the editor's table does: %s",
    (_label, log, date, runningId) => {
      expectRowsMatchEditor(log, date, runningId);
    },
  );

  it("rings the asked-about day", () => {
    const card = weekCard(SYNTHETIC_LOG, "2030-01-31", "2");
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<WeekCardImage card={card} />);
    const rings = [...host.querySelectorAll("[data-week] > div > div")];
    expect(rings).toHaveLength(1);
    const cell = rings[0]!.parentElement!;
    expect(cell.parentElement!.getAttribute("data-week")).toBe("2030-01-28");
    // Thursday is the sixth cell, after #, Week, and Monday to Wednesday.
    expect([...cell.parentElement!.children].indexOf(cell)).toBe(5);
  });

  it("shows last week above this week, in either phase", () => {
    mocks.runningId = "2";
    const card = weekCard(SYNTHETIC_LOG, "2030-01-22", "2");
    expect(card.rows.map((item) => [item.row.week, item.number])).toEqual([
      ["2030-01-14", 1],
      ["2030-01-21", 0],
    ]);
    expect(card.rows.map((item) => item.phase?.id)).toEqual(["1", "2"]);
  });

  it("shows this week alone in the log's first week", () => {
    const card = weekCard(SYNTHETIC_LOG, "2030-01-08", "2");
    expect(card.rows.map((item) => item.row.week)).toEqual(["2030-01-07"]);
  });

  it("rounds a mean ending in a hundredths 5 as the editor's table does", () => {
    // 150.2 and 150.5 average to 150.35, which the editor shows as 150.3.
    mocks.runningId = "2";
    const [, current] = cardRows(HALF_TENTH_LOG, "2030-02-05");
    expect(current!.cells.map((cell) => cell.text)).toContain("150.3");
    expect(current!.cells.map((cell) => cell.text)).toContain("+0.3");
    expectRowsMatchEditor(HALF_TENTH_LOG, "2030-02-05", "2");
  });
});
