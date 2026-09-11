import { describe, expect, it } from "vitest";

import { PACIFIC_DATE_REFERENCES, getExportTimeZone } from "./exportTimeZone";

function exportedWorkouts(shiftHours: number) {
  return PACIFIC_DATE_REFERENCES.map((reference) => ({
    uuid: reference.uuid,
    date: new Date(
      Date.parse(`${reference.date.replace(" ", "T")}Z`) +
        shiftHours * 3_600_000,
    )
      .toISOString()
      .slice(0, 16)
      .replace("T", " "),
    dateModified: false,
  }));
}

describe("getExportTimeZone", () => {
  it("recognizes the Pacific backup without shifting it again", () => {
    expect(getExportTimeZone(exportedWorkouts(0))).toBe("America/Los_Angeles");
  });

  it("recognizes an Eastern export that shifts historical workouts by three hours", () => {
    expect(getExportTimeZone(exportedWorkouts(3))).toBe("America/New_York");
  });

  it("rejects other zones instead of silently applying an Eastern correction", () => {
    expect(() => getExportTimeZone(exportedWorkouts(2))).toThrow(
      "export time zone",
    );
  });

  it("rejects inconsistent offsets across the history", () => {
    const workouts = exportedWorkouts(3);
    workouts[0]!.date = PACIFIC_DATE_REFERENCES[0].date;
    expect(() => getExportTimeZone(workouts)).toThrow("export time zone");
  });

  it("ignores manually edited references but still requires six matches", () => {
    const workouts = exportedWorkouts(3);
    workouts[0]!.dateModified = true;
    workouts[0]!.date = "2018-01-31 12:00";
    expect(getExportTimeZone(workouts)).toBe("America/New_York");
    expect(() => getExportTimeZone(workouts.slice(0, 6))).toThrow(
      "export time zone",
    );
  });

  it("requires both summer and winter references to distinguish DST rules", () => {
    const winterOnly = exportedWorkouts(0).filter(
      (workout) => workout.date.slice(5, 7) === "01",
    );
    expect(winterOnly).toHaveLength(6);
    expect(() => getExportTimeZone(winterOnly)).toThrow("export time zone");
  });

  it("rejects empty archives and malformed reference dates", () => {
    expect(() => getExportTimeZone([])).toThrow("export time zone");
    const workouts = exportedWorkouts(3);
    workouts[0]!.date = "invalid";
    expect(() => getExportTimeZone(workouts)).toThrow("export time zone");
  });
});
