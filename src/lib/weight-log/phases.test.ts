import { describe, expect, it } from "vitest";

import { addDays, phaseName, weekStartOf } from "./phases";

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
