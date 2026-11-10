// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { weekLabel } from "~/lib/weight-log/format";
import { addDays } from "~/lib/weight-log/phases";
import type { WeightLog } from "~/lib/weight-log/schema";
import {
  WEEKS_AFTER,
  WEEKS_BEFORE,
  currentRow,
  weekCard,
} from "~/lib/weight-log/week-card";
import { DAY_NAMES, SUMMARY_COLUMNS } from "~/lib/weight-log/week-columns";
import {
  HALF_TENTH_LOG,
  SYNTHETIC_LOG,
  loggedThrough,
} from "~/lib/weight-log/week-summary.fixture";
import { buildWeekTable, weeklyAverage } from "~/lib/weight-log/week-table";

import { TooltipProvider } from "~/components/ui/tooltip";

import { CARD_COLUMNS, WeekCardImage } from "./WeekCard";
import { WeekSheet } from "~/app/weight-log/edit/WeekSheet";

/**
 * The card is drawn from the editor's Weeks table, so this week's day cells
 * and each summary row must read and color exactly as the editor's row for
 * the same week does.
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
        weightLog: {
          phases: invalidate,
          week: invalidate,
          weekTable: invalidate,
        },
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

/**
 * Every row of every table the editor shows on `today`, by table name and
 * then by the Week column's text. A render per day is enough, so they're
 * kept.
 */
const editorTables = new Map<string, Map<string, Map<string, Cell[]>>>();
function editorAt(today: string) {
  const key = `${JSON.stringify(mocks.log.weeks)}|${mocks.runningId}|${today}`;
  const cached = editorTables.get(key);
  if (cached) return cached;
  const { container, unmount } = render(
    <TooltipProvider>
      <WeekSheet today={today} />
    </TooltipProvider>,
  );
  const tables = new Map<string, Map<string, Cell[]>>();
  for (const table of container.querySelectorAll("table[aria-label]")) {
    const rows = new Map<string, Cell[]>();
    for (const row of table.querySelectorAll("tbody tr")) {
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
      rows.set(cells[1]!.text, cells);
    }
    tables.set(table.getAttribute("aria-label")!, rows);
  }
  unmount();
  editorTables.set(key, tables);
  return tables;
}

/**
 * The editor's row for a week, from the table named `table`. The editor
 * opens on the phase holding its today and adds today's week when its table
 * lacks it, so a row it doesn't show on the card's date is read with today
 * set to that week's Sunday. The Week column then carries a year by that
 * day, so it is checked apart.
 */
function editorRow(date: string, week: string, table: string): Cell[] {
  for (const today of [date, addDays(week, 6)]) {
    const row = editorAt(today).get(table)?.get(weekLabel(week, today));
    if (row) return row;
  }
  throw new Error(`The editor's ${table} has no row for ${week}`);
}

const readCells = (row: Element): Cell[] =>
  [...row.children].map((cell) => {
    const style = (cell as HTMLElement).style;
    return {
      text: cell.textContent?.trim() ?? "",
      fill: style.backgroundColor ? colorOf(style.backgroundColor) : null,
      ink: style.backgroundColor ? colorOf(style.color) : null,
    };
  });

/** The card's markup as satori would get it. */
function cardMarkup(log: Pick<WeightLog, "phases" | "weeks">, date: string) {
  const card = weekCard(log, date, mocks.runningId);
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<WeekCardImage card={card} />);
  return { card, host };
}

/** The editor's cells the card keeps: #, Week, and `CARD_COLUMNS`. */
const summaryOf = (editor: Cell[]) => [
  ...editor.slice(0, 2),
  ...CARD_COLUMNS.map(
    (column) => editor[2 + DAY_NAMES.length + SUMMARY_COLUMNS.indexOf(column)]!,
  ),
];

/**
 * This week's day cells and each summary row against the editor's table
 * for that row's phase.
 */
function expectCardMatchesEditor(
  log: Pick<WeightLog, "phases" | "weeks">,
  date: string,
  runningId: string | null,
) {
  mocks.log = log;
  mocks.runningId = runningId;
  editorTables.clear();
  const { card, host } = cardMarkup(log, date);
  const tableOf = (phase: (typeof card.rows)[number]["phase"]) =>
    phase ? `Weeks of ${phase.label}` : "Weeks outside every phase";

  const current = currentRow(card);
  const editorCurrent = editorRow(
    date,
    current.row.week,
    tableOf(current.phase),
  );
  expect(editorCurrent).toHaveLength(
    2 + DAY_NAMES.length + SUMMARY_COLUMNS.length,
  );
  const strip = host.querySelector(`[data-days="${current.row.week}"]`)!;
  expect(readCells(strip)).toEqual(
    editorCurrent.slice(2, 2 + DAY_NAMES.length),
  );

  const rows = [...host.querySelectorAll("[data-week]")];
  expect(rows.map((row) => row.getAttribute("data-week"))).toEqual(
    card.rows.map((item) => item.row.week),
  );
  for (const item of card.rows) {
    const row = host.querySelector(`[data-week="${item.row.week}"]`)!;
    const cells = readCells(row);
    const editor = summaryOf(
      editorRow(date, item.row.week, tableOf(item.phase)),
    );
    expect(cells[1]!.text).toBe(weekLabel(item.row.week, date));
    expect({ ...cells, 1: null }).toEqual({ ...editor, 1: null });
  }
  return { card, host };
}

describe("WeekCardImage", () => {
  it.each([
    [
      "a phase start, with the log's first weeks",
      SYNTHETIC_LOG,
      "2030-01-22",
      "2",
    ],
    ["a full week after a part week", SYNTHETIC_LOG, "2030-01-13", "2"],
    ["an excluded day this week", SYNTHETIC_LOG, "2030-01-31", "2"],
    ["one weigh-in", SYNTHETIC_LOG, "2030-02-04", "2"],
    ["a planned week with no weigh-ins", SYNTHETIC_LOG, "2030-02-12", "2"],
    ["no target past the plan", SYNTHETIC_LOG, "2030-02-19", "2"],
    ["an empty week the running phase holds", SYNTHETIC_LOG, "2030-02-26", "2"],
    ["an empty week before this one", SYNTHETIC_LOG, "2030-03-05", "2"],
    ["weeks outside every phase", OUTSIDE_LOG, "2030-02-26", null],
    [
      "two weigh-in weeks outside every phase",
      OUTSIDE_PAIR_LOG,
      "2030-02-26",
      null,
    ],
    ["the log's first week", SYNTHETIC_LOG, "2030-01-08", "2"],
    [
      "eleven weeks of one phase",
      loggedThrough("2030-06-12"),
      "2030-06-12",
      "3",
    ],
    [
      "the next phase's planned weeks",
      loggedThrough("2030-07-10"),
      "2030-07-10",
      "3",
    ],
    [
      "the last phase's first weeks",
      loggedThrough("2030-07-24"),
      "2030-07-24",
      "3",
    ],
  ] as const)(
    "reads and colors this week's days and each row as the editor does: %s",
    (_label, log, date, runningId) => {
      expectCardMatchesEditor(log, date, runningId);
    },
  );

  it("shows five weeks either side of this one", () => {
    const card = weekCard(loggedThrough("2030-06-12"), "2030-06-12", "3");
    expect(card.rows).toHaveLength(WEEKS_BEFORE + 1 + WEEKS_AFTER);
    expect(card.rows.map((item) => [item.row.week, item.number])).toEqual(
      Array.from({ length: 11 }, (_, index) => [
        addDays("2030-05-06", index * 7),
        index + 1,
      ]),
    );
    expect(currentRow(card).row.week).toBe("2030-06-10");
  });

  it("starts at the log's first week", () => {
    const card = weekCard(SYNTHETIC_LOG, "2030-01-08", "2");
    expect(card.rows.map((item) => item.row.week)).toEqual([
      "2030-01-07",
      "2030-01-14",
      "2030-01-21",
      "2030-01-28",
      "2030-02-04",
      "2030-02-11",
    ]);
  });

  it("stops where the editor's table does past the plan", () => {
    // The running phase holds every week after its plan, but the editor has
    // no row for one still to come.
    const card = weekCard(SYNTHETIC_LOG, "2030-02-12", "2");
    expect(card.rows.map((item) => item.row.week).at(-1)).toBe("2030-02-18");
  });

  it("keeps an earlier week with no weigh-ins that a phase holds", () => {
    const card = weekCard(SYNTHETIC_LOG, "2030-03-05", "2");
    expect(card.rows.map((item) => item.row.week)).toEqual([
      "2030-01-28",
      "2030-02-04",
      "2030-02-11",
      "2030-02-18",
      "2030-02-25",
      "2030-03-04",
    ]);
  });

  it("names a phase where it changes, and the first one when it isn't this week's", () => {
    mocks.runningId = "3";
    const labels = (date: string) =>
      [
        ...cardMarkup(loggedThrough(date), date).host.querySelectorAll(
          "[data-phase]",
        ),
      ].map((node) => node.textContent);
    expect(labels("2030-06-12")).toEqual([]);
    expect(labels("2030-07-10")).toEqual(["Maintenance Jul '30 - Sep '30"]);
    expect(labels("2030-07-24")).toEqual([
      "Bulk Apr '30 - Jul '30",
      "Maintenance Jul '30 - Sep '30",
    ]);
  });

  it("captions this week's phase, number, and Monday", () => {
    mocks.runningId = "2";
    const { host } = cardMarkup(SYNTHETIC_LOG, "2030-01-31");
    expect(host.textContent).toContain("Bulk Jan '30 - Feb '30");
    expect(host.textContent).toContain("Week 1 · Jan 28");
  });

  it("sets this week's row in medium and later weeks muted, as the editor does", () => {
    mocks.runningId = "3";
    const { host } = cardMarkup(loggedThrough("2030-06-12"), "2030-06-12");
    const style = (week: string) =>
      host.querySelector<HTMLElement>(`[data-week="${week}"]`)!.style;
    expect(style("2030-06-03").fontWeight).toBe("400");
    expect(style("2030-06-03").color).toBe("");
    expect(style("2030-06-10").fontWeight).toBe("500");
    expect(colorOf(style("2030-06-17").color)).toBe(colorOf("#56514d"));
  });

  it("strikes an excluded day in the large row", () => {
    mocks.runningId = "2";
    const { host } = cardMarkup(SYNTHETIC_LOG, "2030-01-31");
    const wednesday = host.querySelector('[data-days="2030-01-28"]')!
      .children[2] as HTMLElement;
    expect(wednesday.textContent).toBe("130.0");
    expect(wednesday.style.textDecoration).toBe("line-through");
    expect(wednesday.style.backgroundColor).toBe("");
  });

  it("rings the asked-about day in the large row, and nowhere else", () => {
    mocks.runningId = "2";
    const { host } = cardMarkup(SYNTHETIC_LOG, "2030-01-31");
    const rings = [...host.querySelectorAll("div")].filter((node) =>
      (node as HTMLElement).style.border.includes("solid"),
    );
    expect(rings).toHaveLength(1);
    const cell = rings[0]!.parentElement!;
    expect(cell.parentElement!.getAttribute("data-days")).toBe("2030-01-28");
    // Thursday, the fourth day.
    expect([...cell.parentElement!.children].indexOf(cell)).toBe(3);
  });

  it("rounds a mean ending in a hundredths 5 as the editor's table does", () => {
    // 150.2 and 150.5 average to 150.35, which the editor shows as 150.3.
    const { host } = expectCardMatchesEditor(HALF_TENTH_LOG, "2030-02-05", "2");
    const cells = readCells(host.querySelector('[data-week="2030-02-04"]')!);
    expect(cells.map((cell) => cell.text)).toContain("150.3");
    expect(cells.map((cell) => cell.text)).toContain("+0.3");
  });
});
