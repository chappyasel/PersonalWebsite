import { describe, expect, it } from "vitest";

import {
  addDays,
  cycleNumbers,
  phaseName,
  phaseWeekCount,
  weekStartOf,
} from "./phases";

describe("phase names", () => {
  it("builds the name from kind, start month, and end month", () => {
    expect(phaseName("bulk", "2030-08-26", "2031-08-10")).toBe(
      "Bulk Aug '30 - Aug '31",
    );
    expect(phaseName("cut", "2030-01-21", "2030-03-17")).toBe(
      "Cut Jan '30 - Mar '30",
    );
    expect(phaseName("maintenance", "2029-12-31", "2030-02-03")).toBe(
      "Maintain Dec '29 - Feb '30",
    );
  });
});

describe("calendar helpers", () => {
  it("finds the Monday that starts a date's week", () => {
    expect(weekStartOf("2030-01-07")).toBe("2030-01-07");
    expect(weekStartOf("2030-01-13")).toBe("2030-01-07");
    expect(weekStartOf("2030-01-01")).toBe("2029-12-31");
  });
  it("adds days across month and year boundaries", () => {
    expect(addDays("2029-12-30", 6)).toBe("2030-01-05");
    expect(addDays("2030-03-01", -1)).toBe("2030-02-28");
  });
});

describe("cycleNumbers", () => {
  it("numbers every phase by start date from 1, whatever its kind", () => {
    // Newest first, as the picker lists them.
    const numbers = cycleNumbers([
      { id: "c", start: "2031-03-03" },
      { id: "a", start: "2030-01-07" },
      { id: "b", start: "2030-06-02" },
    ]);
    expect([...numbers]).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });

  it("is empty without phases", () => {
    expect(cycleNumbers([]).size).toBe(0);
  });
});

describe("phaseWeekCount", () => {
  it("counts the weeks from the start's Monday to the end's, inclusive", () => {
    expect(phaseWeekCount("2030-01-07", "2030-01-13")).toBe(1);
    expect(phaseWeekCount("2030-01-07", "2030-02-03")).toBe(4);
    // Across the new year, with an end that isn't a Sunday.
    expect(phaseWeekCount("2029-12-24", "2030-01-08")).toBe(3);
  });
});
