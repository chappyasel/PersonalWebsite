import { describe, expect, it } from "vitest";

import { fitHistoricalBodyFat, historicalBodyFat } from "./historical-body-fat";
import type { WeightLog } from "./schema";

const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
const scans: WeightLog["scans"] = [100, 110, 120, 130].map((weight, index) => ({
  date: `${2020 + index}-01-01`,
  weight,
  fatMass: weight - (80 + index * 5),
  bodyFatPercent: null,
  leanMass: null,
}));
const point = (date: string, trailing: number | null) => ({
  time: time(date),
  trailing,
  projectedWeight: 200,
});

describe("exploratory body fat before the first DEXA", () => {
  it("requires enough usable scans and meaningful weight variation", () => {
    expect(fitHistoricalBodyFat([])).toBeNull();
    expect(fitHistoricalBodyFat(scans.slice(0, 3))).toBeNull();
    expect(
      fitHistoricalBodyFat(scans.map((scan) => ({ ...scan, weight: 100 }))),
    ).toBeNull();
    expect(fitHistoricalBodyFat([...scans.slice(0, 3), scans[0]!])).toBeNull();
    expect(fitHistoricalBodyFat([...scans].reverse())).toEqual(
      fitHistoricalBodyFat(scans),
    );
  });

  it("tests backward prediction without letting a held-out scan train its own prediction", () => {
    const model = fitHistoricalBodyFat(scans)!;
    // Later scans anchor at 110 lb / 85 lb FFM. Their fitted slope is 250/525.
    const predictedFfm = 85 - (10 * 250) / 525;
    expect(model.validationCount).toBe(1);
    expect(model.validationMeanError).toBeCloseTo(predictedFfm - 80);
    const changed = fitHistoricalBodyFat(
      scans.map((scan, index) =>
        index === 0 ? { ...scan, bodyFatPercent: 30 } : scan,
      ),
    )!;
    // A 10-point change to the held-out reading changes only its test error.
    expect(changed.validationMeanError - model.validationMeanError).toBeCloseTo(
      10,
    );
  });

  it("meets the first reported scan through a scale offset and leaves later estimates alone", () => {
    const model = fitHistoricalBodyFat(scans)!;
    const result = historicalBodyFat(
      [
        point("2018-01-01", 95),
        point("2019-01-01", null),
        point("2020-01-01", 95),
        point("2020-01-02", 95),
      ],
      model,
    );
    expect(result[0]?.bodyFatHistorical).toBeCloseTo(20);
    expect(result[2]?.bodyFatHistorical).toBeCloseTo(20);
    expect(result[1]?.bodyFatHistoricalRange).toBeNull();
    expect(result[3]?.bodyFatHistorical).toBeNull();
    expect(result[3]?.bodyFatHistoricalRange).toBeNull();
    expect(
      historicalBodyFat([point("2018-01-01", 95)], null)[0]?.bodyFatHistorical,
    ).toBeNull();
  });

  it("widens the sensitivity range farther back even for perfectly consistent scans", () => {
    const model = fitHistoricalBodyFat(scans)!;
    const result = historicalBodyFat(
      [
        point("2016-01-01", 100),
        point("2019-01-01", 100),
        point("2020-01-01", 100),
      ],
      model,
    );
    const ranges = result.map((row) => row.bodyFatHistoricalRange!);
    expect(ranges[0]![0]).toBeLessThan(ranges[1]![0]);
    expect(ranges[0]![1]).toBeGreaterThan(ranges[1]![1]);
    expect(ranges[2]![1] - ranges[2]![0]).toBeGreaterThanOrEqual(4);
  });

  it("rejects impossible point estimates and never substitutes planned weight for missing history", () => {
    const result = historicalBodyFat(
      [
        point("2018-01-01", 1),
        point("2018-01-02", null),
        point("2018-01-03", NaN),
      ],
      fitHistoricalBodyFat(scans),
    );
    expect(
      result.every(
        (row) =>
          row.bodyFatHistorical === null && row.bodyFatHistoricalRange === null,
      ),
    ).toBe(true);
  });
});
