import { describe, expect, it } from "vitest";

import type { BookingDay } from "./page";
import {
  GRID,
  bookableSpans,
  dragStart,
  firstPick,
  fits,
  gridFor,
  nearestStart,
  resize,
  snapToGrid,
  startsIn,
  stepStart,
  suggestedFor,
} from "./slots";
import { axisBounds, axisHours, minuteOnDay } from "./strip";
import { zonedTime } from "./zones";

const PT = "America/Los_Angeles";
const DAY = "2026-11-10";
const at = (hour: number, minute = 0, day = DAY) =>
  zonedTime(day, hour * 60 + minute, PT);

// 9-10, 11-12, and 1-4, with busy time between.
const open = [
  { start: at(9), end: at(10) },
  { start: at(11), end: at(12) },
  { start: at(13), end: at(16) },
];
const tuesday: BookingDay = { day: DAY, open };
const wednesday: BookingDay = {
  day: "2026-11-11",
  open: [{ start: at(10, 0, "2026-11-11"), end: at(11, 0, "2026-11-11") }],
};

describe("whether a start is bookable", () => {
  it("needs the grid and the whole length inside one stretch", () => {
    expect(fits(open, at(9), 60)).toBe(true);
    expect(fits(open, at(9, 15), 60)).toBe(false);
    expect(fits(open, at(9, 10), 15)).toBe(false);
    expect(fits(open, at(15, 30), 30)).toBe(true);
    expect(fits(open, at(15, 45), 30)).toBe(false);
    // Busy time between two stretches never counts.
    expect(fits(open, at(9, 45), 90)).toBe(false);
  });

  it("starts 30 minutes or more on the half hour, and shorter on the quarter", () => {
    expect(gridFor(15)).toBe(GRID);
    expect(gridFor(30)).toBe(2 * GRID);
    expect(gridFor(60)).toBe(2 * GRID);
    expect(fits(open, at(13, 15), 15)).toBe(true);
    expect(fits(open, at(13, 15), 30)).toBe(false);
    expect(fits(open, at(13, 45), 60)).toBe(false);
  });

  it("lists every start at a length", () => {
    expect(startsIn(open, 60)).toEqual([
      at(9),
      at(11),
      at(13),
      at(13, 30),
      at(14),
      at(14, 30),
      at(15),
    ]);
    expect(startsIn([{ start: at(9), end: at(10) }], 15)).toEqual([
      at(9),
      at(9, 15),
      at(9, 30),
      at(9, 45),
    ]);
    expect(startsIn(open, 240)).toEqual([]);
  });

  it("lists quarter-hour starts for a length off the quarter hour", () => {
    expect(startsIn([{ start: at(9), end: at(10) }], 20)).toEqual([
      at(9),
      at(9, 15),
      at(9, 30),
    ]);
  });
});

describe("snapping a drag to the grid", () => {
  it("rounds to the nearest quarter hour", () => {
    expect(snapToGrid(at(13, 7))).toBe(at(13));
    expect(snapToGrid(at(13, 8))).toBe(at(13, 15));
    expect(snapToGrid(at(13, 7, DAY) + 30_000)).toBe(at(13, 15));
  });

  it("lands the block under the pointer, less where it was grabbed", () => {
    // Grabbed 10 minutes into a 30-minute block, pointer at 2:37, so its
    // top is at 2:27 and lands on the half hour.
    expect(dragStart(open, at(14, 37), 10 * 60_000, 30)).toBe(at(14, 30));
    // A 15-minute block lands on the quarter hour.
    expect(dragStart(open, at(14, 22), 5 * 60_000, 15)).toBe(at(14, 15));
  });

  it("holds the block at a stretch's last start when dragged past its end", () => {
    expect(dragStart(open, at(15, 55), 0, 30)).toBe(at(15, 30));
    expect(dragStart(open, at(12, 50), 0, 30)).toBe(at(13));
  });

  it("only lands where the whole length fits", () => {
    // An hour won't fit in 9-10 from 9:30, so it stays at 9.
    expect(dragStart(open, at(9, 30), 0, 60)).toBe(at(9));
    // Nothing on the day holds four hours.
    expect(dragStart(open, at(13), 0, 240)).toBeNull();
  });

  it("jumps across busy time to whichever stretch is nearer", () => {
    // 9:30 is 40 minutes from 10:10, and 11:00 is 50.
    expect(nearestStart(open, at(10, 10), 30)).toBe(at(9, 30));
    expect(nearestStart(open, at(10, 40), 30)).toBe(at(11));
  });

  it("keeps every result on the grid", () => {
    for (let minute = 0; minute < 8 * 60; minute += 7) {
      const start = dragStart(open, at(8) + minute * 60_000, 0, 45);
      expect(start).not.toBeNull();
      expect(start! % gridFor(45)).toBe(0);
      expect(fits(open, start!, 45)).toBe(true);
    }
  });
});

describe("the time a start can use", () => {
  it("drops the slivers off the grid that no start can use", () => {
    // In 9:15-10:15 the only half-hour start is 9:30, so 9:15-9:30 and
    // 10:00-10:15 go unused, and 11:00-11:15 is too short for 30 minutes.
    const ragged = [
      { start: at(9, 15), end: at(10, 15) },
      { start: at(11), end: at(11, 15) },
    ];
    expect(bookableSpans(ragged, 30)).toEqual([
      { start: at(9, 30), end: at(10) },
    ]);
    expect(bookableSpans(ragged, 15)).toEqual(ragged);
  });
});

describe("changing the length", () => {
  it("keeps the start when the new length fits", () => {
    expect(resize(open, at(13), 60)).toBe(at(13));
  });

  it("slides up when the meeting would run into busy time", () => {
    expect(resize(open, at(15, 30), 60)).toBe(at(15));
    expect(resize(open, at(11, 30), 60)).toBe(at(11));
  });

  it("gives up when nothing near fits", () => {
    expect(resize(open, at(9), 240)).toBeNull();
  });
});

describe("keyboard steps", () => {
  it("moves to the next and previous start, across busy time", () => {
    expect(stepStart(open, at(9, 30), 30, 1)).toBe(at(11));
    expect(stepStart(open, at(11), 30, -1)).toBe(at(9, 30));
    expect(stepStart(open, at(15, 30), 30, 1)).toBeNull();
    expect(stepStart(open, at(9), 30, -1)).toBeNull();
  });
});

describe("the best slots", () => {
  // Daybreak suggested 9:00 (flush with its stretch's start) and 3:30 (flush
  // with its end) at the default 30 minutes.
  const suggested = [at(9), at(15, 30)];

  it("are Daybreak's own at the default length", () => {
    expect(suggestedFor([tuesday], suggested, 30, 30)).toEqual(suggested);
  });

  it("keep the edge they were flush with at another length", () => {
    expect(suggestedFor([tuesday], suggested, 30, 60)).toEqual([at(9), at(15)]);
    expect(suggestedFor([tuesday], suggested, 30, 15)).toEqual([
      at(9),
      at(15, 45),
    ]);
  });

  it("drop one that no longer fits", () => {
    expect(suggestedFor([tuesday], suggested, 30, 120)).toEqual([at(14)]);
    expect(suggestedFor([tuesday], [at(9)], 30, 120)).toEqual([]);
  });

  it("ignore a start outside the open time", () => {
    expect(suggestedFor([tuesday], [at(10, 30)], 30, 30)).toEqual([]);
  });

  it("seed a first selection", () => {
    expect(firstPick([tuesday], [at(15, 30)], 30)).toBe(at(15, 30));
    expect(firstPick([{ day: DAY, open: [] }, wednesday], [], 30)).toBe(
      at(10, 0, "2026-11-11"),
    );
  });
});

describe("the strip's axis", () => {
  it("spans the week's open hours on the host's clock", () => {
    const bounds = axisBounds([tuesday, wednesday], PT);
    expect(bounds).toEqual({ start: 9 * 60, end: 16 * 60 });
    expect(axisHours(bounds)).toHaveLength(8);
  });

  it("falls back to 9 to 6 for a closed week", () => {
    expect(axisBounds([{ day: DAY, open: [] }], PT)).toEqual({
      start: 9 * 60,
      end: 18 * 60,
    });
  });

  it("reads past midnight as a late hour of the same Day", () => {
    expect(minuteOnDay(at(25), DAY, PT)).toBe(25 * 60);
  });
});
